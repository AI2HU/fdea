import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import type { OpportunityMap } from "../contracts/opportunityMap.js";
import type { ProcessModel } from "../contracts/processModel.js";
import type {
  DesignSpec,
  SourceMeta,
  SourceRole,
  SubmittedDesign,
} from "../contracts/project.js";
import type { ProjectState } from "../contracts/project.js";
import { err, ok, type FdeaError, type Result } from "../domain/result.js";
import {
  ingest,
  type Fetcher,
  type OcrPort,
  type SourceInput,
} from "../ingestion/index.js";
import { resolveDesign } from "../design/infer.js";
import {
  DEPLOYMENT_CLARIFICATION_ID,
  FIDELITY_CLARIFICATION_ID,
  RBAC_CLARIFICATION_ID,
  SCHEMA_CLARIFICATION_ID,
  SCOPE_CLARIFICATION_ID,
  deriveClarifications,
  isPrototype,
  isSchemaApproved,
  readinessBlockers,
  type Clarification,
} from "../process/clarifications.js";
import {
  isScopeSelected,
  opportunityIntegrityIssues,
  priorityAnswerOf,
  rankOpportunities,
  rankingSummary,
  selectedOpportunity,
} from "../process/opportunity.js";
import { buildDatabaseSchemaPreview } from "../process/schemaPreview.js";
import { integrityIssues, type EvidenceVerifier } from "../process/validate.js";
import type { ProjectStore } from "../store/ProjectStore.js";
import type { ApplicationGenerator } from "./ports.js";

export interface FdeaServiceDeps {
  readonly store: ProjectStore;
  readonly ocr: OcrPort;
  readonly generator: ApplicationGenerator;
  readonly fetch?: Fetcher | undefined;
  readonly now?: () => Date;
}

const normalize = (text: string): string =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "png",
  jpeg: "jpg",
  webp: "webp",
  gif: "gif",
};

export interface SourceSummary {
  readonly id: string;
  readonly kind: SourceMeta["kind"];
  readonly role: SourceRole;
  readonly name: string;
  readonly origin: SourceMeta["origin"];
  readonly text_chars: number;
  readonly stored_path: string | undefined;
  readonly embedded_images: readonly string[];
  readonly limitations: readonly string[];
}

const summarize = (source: SourceMeta): SourceSummary => ({
  id: source.id,
  kind: source.kind,
  role: source.role,
  name: source.name,
  origin: source.origin,
  text_chars: source.text_chars,
  stored_path: source.stored_path,
  embedded_images: source.embedded_images,
  limitations: source.limitations,
});

export class FdeaService {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly deps: FdeaServiceDeps) {}

  private timestamp(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private async withProject<T>(
    projectId: string,
    work: (state: ProjectState) => Promise<Result<T, FdeaError>>,
  ): Promise<Result<T, FdeaError>> {
    const previous = this.locks.get(projectId) ?? Promise.resolve();
    const run = previous.then(async () => {
      const loaded = await this.deps.store.load(projectId);
      return loaded.ok ? work(loaded.value) : loaded;
    });
    const settled = run.catch(() => undefined);
    this.locks.set(projectId, settled);
    void settled.then(() => {
      if (this.locks.get(projectId) === settled) this.locks.delete(projectId);
    });
    return run;
  }

  private async commit<T>(
    state: ProjectState,
    value: T,
  ): Promise<Result<T, FdeaError>> {
    const saved = await this.deps.store.save(state);
    return saved.ok ? ok(value) : saved;
  }

  async createProject(input: {
    name: string;
    out_dir: string;
  }): Promise<
    Result<
      { project_id: string; name: string; out_dir: string; next: string },
      FdeaError
    >
  > {
    if (!isAbsolute(input.out_dir)) {
      return err({
        tag: "invalid_input",
        message: "out_dir must be an absolute path.",
      });
    }
    const created = await this.deps.store.create(input.name, input.out_dir);
    if (!created.ok) return created;
    return ok({
      project_id: created.value.id,
      name: created.value.name,
      out_dir: created.value.out_dir,
      next: "Ingest the process documentation with ingest_source, then submit_opportunity_map before modeling.",
    });
  }

  async ingestSource(input: {
    project_id: string;
    url?: string | undefined;
    path?: string | undefined;
    inline?:
      | {
          name: string;
          text?: string | undefined;
          base64?: string | undefined;
          media_type?: string | undefined;
        }
      | undefined;
    role?: SourceRole | undefined;
  }): Promise<Result<SourceSummary & { preview: string }, FdeaError>> {
    const given = [input.url, input.path, input.inline].filter(
      (value) => value !== undefined,
    );
    if (given.length !== 1) {
      return err({
        tag: "invalid_input",
        message: "Provide exactly one of url, path or inline.",
      });
    }
    const source: SourceInput =
      input.url !== undefined
        ? { kind: "url", url: input.url }
        : input.path !== undefined
          ? { kind: "path", path: input.path }
          : {
              kind: "inline",
              name: input.inline?.name ?? "inline",
              text: input.inline?.text,
              base64: input.inline?.base64,
              mediaType: input.inline?.media_type,
            };
    const role = input.role ?? "process";
    return this.withProject(input.project_id, async (state) => {
      const ingested = await ingest(source, role, {
        ocr: this.deps.ocr,
        fetch: this.deps.fetch,
      });
      if (!ingested.ok) return ingested;
      const { loaded, extraction } = ingested.value;
      const sha256 = createHash("sha256").update(loaded.bytes).digest("hex");
      const duplicate = state.sources.find(
        (existing) => existing.sha256 === sha256 && existing.role === role,
      );
      if (duplicate !== undefined) {
        return ok({ ...summarize(duplicate), preview: "(already ingested)" });
      }
      const id = `src_${String(state.sources.length + 1).padStart(2, "0")}_${sha256.slice(0, 6)}`;

      const stored: string[] = [];
      let storedPath: string | undefined;
      const keep = async (
        fileName: string,
        bytes: Uint8Array,
      ): Promise<Result<string, FdeaError>> =>
        this.deps.store.writeSourceBinary(state.id, fileName, bytes);
      if (extraction.image !== undefined) {
        const extension =
          IMAGE_EXTENSIONS[extraction.image.facts.format] ?? "img";
        const written = await keep(
          `${id}.${extension}`,
          extraction.image.bytes,
        );
        if (!written.ok) return written;
        storedPath = written.value;
      }
      for (const [index, image] of extraction.embeddedImages.entries()) {
        const extension = IMAGE_EXTENSIONS[image.facts.format] ?? "img";
        const written = await keep(
          `${id}.image-${index + 1}.${extension}`,
          image.bytes,
        );
        if (!written.ok) return written;
        stored.push(written.value);
      }
      const textParts = [extraction.text];
      for (const [index, image] of extraction.embeddedImages.entries()) {
        if (image.ocrText !== "") {
          textParts.push(
            `[text recognized in image ${index + 1}]\n${image.ocrText}`,
          );
        }
      }
      const text = textParts.filter((part) => part !== "").join("\n\n");
      const textWritten = await this.deps.store.writeSourceText(
        state.id,
        id,
        text,
      );
      if (!textWritten.ok) return textWritten;

      const meta: SourceMeta = {
        id,
        kind: extraction.kind,
        role,
        name: loaded.name,
        origin: loaded.origin,
        sha256,
        bytes: loaded.bytes.byteLength,
        text_chars: text.length,
        ...(storedPath === undefined ? {} : { stored_path: storedPath }),
        ...(extraction.image === undefined
          ? {}
          : {
              image: {
                width: extraction.image.facts.width,
                height: extraction.image.facts.height,
                format: extraction.image.facts.format,
              },
            }),
        embedded_images: stored,
        design_cues: extraction.designCues,
        limitations: [...extraction.limitations],
        ingested_at: this.timestamp(),
      };
      const next: ProjectState = {
        ...state,
        sources: [...state.sources, meta],
      };
      return this.commit(next, {
        ...summarize(meta),
        preview: text.slice(0, 600),
      });
    });
  }

  async listSources(input: {
    project_id: string;
  }): Promise<Result<{ sources: SourceSummary[] }, FdeaError>> {
    return this.withProject(input.project_id, async (state) =>
      ok({ sources: state.sources.map(summarize) }),
    );
  }

  async readSource(input: {
    project_id: string;
    source_id: string;
    offset?: number | undefined;
    limit?: number | undefined;
  }): Promise<
    Result<
      {
        source_id: string;
        offset: number;
        returned: number;
        total: number;
        text: string;
        truncated: boolean;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (!state.sources.some((source) => source.id === input.source_id)) {
        return err({
          tag: "source_not_found",
          message: `Unknown source ${input.source_id}`,
        });
      }
      const text = await this.deps.store.readSourceText(
        state.id,
        input.source_id,
      );
      if (!text.ok) return text;
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 20_000;
      const slice = text.value.slice(offset, offset + limit);
      return ok({
        source_id: input.source_id,
        offset,
        returned: slice.length,
        total: text.value.length,
        text: slice,
        truncated: offset + slice.length < text.value.length,
      });
    });
  }

  private async evidenceVerifier(
    state: ProjectState,
  ): Promise<Result<EvidenceVerifier, FdeaError>> {
    const texts = new Map<string, string>();
    for (const source of state.sources) {
      if (source.kind === "image") continue;
      const text = await this.deps.store.readSourceText(state.id, source.id);
      if (!text.ok) return text;
      texts.set(source.id, normalize(text.value));
    }
    const imageSources = new Set(
      state.sources
        .filter((source) => source.kind === "image")
        .map((source) => source.id),
    );
    return ok((evidence) => {
      if (imageSources.has(evidence.source_id)) return "ok";
      const text = texts.get(evidence.source_id);
      if (text === undefined) return "missing_source";
      return text.includes(normalize(evidence.quote)) ? "ok" : "not_found";
    });
  }

  async submitOpportunityMap(input: {
    project_id: string;
    map: OpportunityMap;
  }): Promise<
    Result<
      {
        summary: Record<string, number>;
        ranking_summary: string;
        open_clarifications: Clarification[];
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (
        state.sources.filter((source) => source.role === "process").length === 0
      ) {
        return err({
          tag: "not_ready",
          message:
            "Ingest at least one process source before submitting opportunities.",
          blockers: readinessBlockers(state),
        });
      }
      const verifier = await this.evidenceVerifier(state);
      if (!verifier.ok) return verifier;
      const issues = opportunityIntegrityIssues(input.map, verifier.value);
      if (issues.length > 0) {
        return err({
          tag: "invalid_opportunity_map",
          message: `The opportunity map has ${issues.length} problem(s). Fix them and resubmit.`,
          issues,
        });
      }
      const seq = state.seq + 1;
      const next: ProjectState = {
        ...state,
        seq,
        opportunity_map: input.map,
        opportunity_seq: seq,
        scope_selection: undefined,
        model: undefined,
        schema_approval: undefined,
      };
      const ranked = rankOpportunities(next);
      const open = deriveClarifications(next).filter(
        (item) => item.status === "open",
      );
      return this.commit(next, {
        summary: {
          opportunities: input.map.opportunities.length,
          open_clarifications: open.length,
        },
        ranking_summary: rankingSummary(ranked),
        open_clarifications: open,
        next: "Ask the user each value:priority clarification, then show ranking_summary / get_opportunity_ranking and call select_opportunity with their choice.",
      });
    });
  }

  async getOpportunityRanking(input: { project_id: string }): Promise<
    Result<
      {
        ranking: ReturnType<typeof rankOpportunities>;
        summary: string;
        selected_opportunity_id: string | null;
        open_clarifications: Clarification[];
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (state.opportunity_map === undefined) {
        return err({
          tag: "not_ready",
          message: "Submit an opportunity map before requesting a ranking.",
          blockers: readinessBlockers(state),
        });
      }
      const ranking = rankOpportunities(state);
      const open = deriveClarifications(state).filter(
        (item) =>
          item.status === "open" &&
          (item.kind === "value_priority" || item.kind === "directive_scope"),
      );
      return ok({
        ranking,
        summary: rankingSummary(ranking),
        selected_opportunity_id: state.scope_selection?.opportunity_id ?? null,
        open_clarifications: open,
        next: isScopeSelected(state)
          ? "Scope is selected. Submit a process model scoped to that opportunity."
          : open.some((item) => item.kind === "value_priority")
            ? "Ask the user each open value:priority clarification, then call get_opportunity_ranking again and select_opportunity."
            : "Show summary to the user and call select_opportunity with their chosen opportunity_id.",
      });
    });
  }

  async selectOpportunity(input: {
    project_id: string;
    opportunity_id: string;
  }): Promise<
    Result<
      {
        selected: NonNullable<ReturnType<typeof selectedOpportunity>>;
        open_clarifications: Clarification[];
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (state.opportunity_map === undefined) {
        return err({
          tag: "not_ready",
          message: "Submit an opportunity map before selecting a scope.",
          blockers: readinessBlockers(state),
        });
      }
      const openPriorities = deriveClarifications(state).filter(
        (item) => item.status === "open" && item.kind === "value_priority",
      );
      if (openPriorities.length > 0) {
        return err({
          tag: "not_ready",
          message:
            "Answer every value:priority clarification before selecting the build scope.",
          blockers: openPriorities.map(
            (item) => `Open clarification ${item.id}: ${item.question}`,
          ),
        });
      }
      const opportunity = state.opportunity_map.opportunities.find(
        (item) => item.id === input.opportunity_id,
      );
      if (opportunity === undefined) {
        return err({
          tag: "invalid_input",
          message: `Unknown opportunity ${input.opportunity_id}`,
          issues: state.opportunity_map.opportunities.map((item) => item.id),
        });
      }
      const seq = state.seq + 1;
      const next: ProjectState = {
        ...state,
        seq,
        scope_selection: {
          opportunity_id: opportunity.id,
          opportunity_seq: state.opportunity_seq,
          selected_at: this.timestamp(),
        },
        answers: [
          ...state.answers,
          {
            clarification_id: SCOPE_CLARIFICATION_ID,
            answer: opportunity.id,
            seq,
          },
        ],
        model: undefined,
        schema_approval: undefined,
      };
      const open = deriveClarifications(next).filter(
        (item) => item.status === "open",
      );
      return this.commit(next, {
        selected: opportunity,
        open_clarifications: open,
        next: `Scope is "${opportunity.title}". Submit a process model that implements only this opportunity; put everything else in unknowns.`,
      });
    });
  }

  async getProcessModel(input: {
    project_id: string;
  }): Promise<
    Result<
      { model: ProcessModel | null; clarifications: Clarification[] },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) =>
      ok({
        model: state.model ?? null,
        clarifications: deriveClarifications(state),
      }),
    );
  }

  async submitProcessModel(input: {
    project_id: string;
    model: ProcessModel;
  }): Promise<
    Result<
      {
        summary: Record<string, number>;
        open_clarifications: Clarification[];
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (!isScopeSelected(state)) {
        return err({
          tag: "not_ready",
          message:
            "Select a build opportunity before submitting the process model.",
          blockers: readinessBlockers(state),
        });
      }
      const verifier = await this.evidenceVerifier(state);
      if (!verifier.ok) return verifier;
      const issues = integrityIssues(input.model, verifier.value);
      if (issues.length > 0) {
        return err({
          tag: "invalid_process_model",
          message: `The process model has ${issues.length} problem(s). Fix them and resubmit.`,
          issues,
        });
      }
      const seq = state.seq + 1;
      const next: ProjectState = {
        ...state,
        seq,
        model: input.model,
        model_seq: seq,
        schema_approval: undefined,
      };
      const open = deriveClarifications(next).filter(
        (item) => item.status === "open",
      );
      const schema = buildDatabaseSchemaPreview(
        input.model,
        next.directives.rbac,
      );
      const selected = selectedOpportunity(state);
      return this.commit(next, {
        summary: {
          actors: input.model.actors.length,
          entities: input.model.entities.length,
          steps: input.model.steps.length,
          open_clarifications: open.length,
          tables: schema.tables.length,
        },
        open_clarifications: open,
        database_schema: schema,
        selected_opportunity_id: selected?.id,
        next:
          open.length === 0
            ? "Show database_schema.summary to the user (Mermaid ER diagram plus table detail), then call approve_database_schema when they confirm."
            : "Ask the user each open clarification. For directive:schema, call get_database_schema and show the Mermaid summary before approve_database_schema.",
      });
    });
  }

  async listClarifications(input: {
    project_id: string;
  }): Promise<
    Result<{ clarifications: Clarification[]; open: number }, FdeaError>
  > {
    return this.withProject(input.project_id, async (state) => {
      const clarifications = deriveClarifications(state);
      return ok({
        clarifications,
        open: clarifications.filter((item) => item.status === "open").length,
      });
    });
  }

  async answerClarifications(input: {
    project_id: string;
    answers: ReadonlyArray<{ id: string; answer: string }>;
  }): Promise<
    Result<
      { recorded: number; open_clarifications: Clarification[]; next: string },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      const known = new Map(
        deriveClarifications(state).map((item) => [item.id, item]),
      );
      const issues: string[] = [];
      let directives = state.directives;
      let touchesModel = false;
      for (const { id, answer } of input.answers) {
        const clarification = known.get(id);
        if (clarification === undefined) {
          issues.push(`Unknown clarification ${id}`);
          continue;
        }
        const value = answer.trim().toLowerCase();
        if (id === FIDELITY_CLARIFICATION_ID) {
          if (value === "foundation" || value === "prototype") {
            directives = {
              ...directives,
              fidelity: value,
              ...(value === "prototype"
                ? { rbac: false, deployment: "local" as const }
                : {}),
            };
          } else issues.push(`${id}: answer foundation or prototype`);
        } else if (id === RBAC_CLARIFICATION_ID) {
          if (["true", "yes"].includes(value))
            directives = { ...directives, rbac: true };
          else if (["false", "no"].includes(value))
            directives = { ...directives, rbac: false };
          else issues.push(`${id}: answer true or false`);
        } else if (id === DEPLOYMENT_CLARIFICATION_ID) {
          if (value === "cloud" || value === "local")
            directives = { ...directives, deployment: value };
          else issues.push(`${id}: answer cloud or local`);
        } else if (id === SCHEMA_CLARIFICATION_ID) {
          issues.push(
            `${id}: use approve_database_schema after showing get_database_schema to the user`,
          );
        } else if (id === SCOPE_CLARIFICATION_ID) {
          issues.push(
            `${id}: use select_opportunity after showing get_opportunity_ranking to the user`,
          );
        } else if (id.startsWith("value:")) {
          if (priorityAnswerOf(answer) === undefined) {
            issues.push(`${id}: answer high, medium, low or defer`);
          }
        } else {
          touchesModel = true;
        }
      }
      if (issues.length > 0) {
        return err({
          tag: "invalid_input",
          message: "Some answers were rejected.",
          issues,
        });
      }
      const seq = state.seq + 1;
      const next: ProjectState = {
        ...state,
        seq,
        directives,
        answers: [
          ...state.answers,
          ...input.answers.map(({ id, answer }) => ({
            clarification_id: id,
            answer: answer.trim(),
            seq,
          })),
        ],
      };
      const open = deriveClarifications(next).filter(
        (item) => item.status === "open",
      );
      const rankingReady =
        state.opportunity_map !== undefined &&
        !isScopeSelected(next) &&
        !open.some((item) => item.kind === "value_priority");
      return this.commit(next, {
        recorded: input.answers.length,
        open_clarifications: open,
        next: touchesModel
          ? "Update the process model with these answers and call submit_process_model."
          : rankingReady
            ? "Show get_opportunity_ranking to the user, then call select_opportunity with their choice."
            : open.length > 0
              ? "Ask the user the remaining open clarifications."
              : "Check project_status, then generate_application.",
      });
    });
  }

  async setImplementationDirectives(input: {
    project_id: string;
    fidelity?: "foundation" | "prototype" | undefined;
    prototype_variants?: number | undefined;
    rbac?: boolean | undefined;
    deployment?: "cloud" | "local" | undefined;
  }): Promise<Result<{ directives: ProjectState["directives"] }, FdeaError>> {
    if (
      input.fidelity === undefined &&
      input.prototype_variants === undefined &&
      input.rbac === undefined &&
      input.deployment === undefined
    ) {
      return err({
        tag: "invalid_input",
        message: "Provide fidelity, prototype_variants, rbac and/or deployment.",
      });
    }
    return this.withProject(input.project_id, async (state) => {
      const fidelity = input.fidelity ?? state.directives.fidelity;
      const directives = {
        ...state.directives,
        ...(input.fidelity === undefined ? {} : { fidelity: input.fidelity }),
        ...(input.prototype_variants === undefined
          ? {}
          : { prototype_variants: input.prototype_variants }),
        ...(input.rbac === undefined ? {} : { rbac: input.rbac }),
        ...(input.deployment === undefined
          ? {}
          : { deployment: input.deployment }),
        ...(fidelity === "prototype" || input.fidelity === "prototype"
          ? { rbac: false as const, deployment: "local" as const }
          : {}),
      };
      return this.commit({ ...state, directives }, { directives });
    });
  }

  async getDesignSpec(input: {
    project_id: string;
  }): Promise<
    Result<{ design: DesignSpec; limitations: string[] }, FdeaError>
  > {
    return this.withProject(input.project_id, async (state) => {
      const design = resolveDesign(state);
      const limitations =
        design.kind === "shadcn_default"
          ? [
              state.sources.some((source) => source.role === "design")
                ? "The design sources contain no usable brand color; the shadcn default is used."
                : "No design source was ingested; the shadcn default is used. Ingest brand or UI references with role design to infer a design.",
            ]
          : design.tokens.font_sans.startsWith('"')
            ? [
                "The brand font is referenced by name; font files are not bundled.",
              ]
            : [];
      return ok({ design, limitations });
    });
  }

  async submitDesignSpec(input: {
    project_id: string;
    design: SubmittedDesign;
  }): Promise<Result<{ design: DesignSpec }, FdeaError>> {
    return this.withProject(input.project_id, async (state) => {
      const known = new Set(state.sources.map((source) => source.id));
      const unknown = input.design.provenance.filter(
        (item) => !known.has(item.source_id),
      );
      if (unknown.length > 0) {
        return err({
          tag: "invalid_input",
          message: "Design provenance cites unknown sources.",
          issues: unknown.map((item) => item.source_id),
        });
      }
      const next: ProjectState = { ...state, submitted_design: input.design };
      return this.commit(next, { design: resolveDesign(next) });
    });
  }

  async getDatabaseSchema(input: { project_id: string }): Promise<
    Result<
      {
        schema: ReturnType<typeof buildDatabaseSchemaPreview>;
        model_seq: number;
        approved: boolean;
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (state.model === undefined) {
        return err({
          tag: "not_ready",
          message:
            "Submit a process model before requesting the database schema.",
          blockers: readinessBlockers(state),
        });
      }
      const schema = buildDatabaseSchemaPreview(
        state.model,
        state.directives.rbac,
      );
      const approved = isSchemaApproved(state);
      return ok({
        schema,
        model_seq: state.model_seq,
        approved,
        next: approved
          ? "The schema is already approved for this process model."
          : "Show schema.summary to the user (includes a Mermaid ER diagram). If they approve, call approve_database_schema with approved=true.",
      });
    });
  }

  async approveDatabaseSchema(input: {
    project_id: string;
    approved: boolean;
  }): Promise<
    Result<
      {
        approved: boolean;
        model_seq: number;
        open_clarifications: Clarification[];
        next: string;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      if (state.model === undefined) {
        return err({
          tag: "not_ready",
          message:
            "Submit a process model before approving the database schema.",
          blockers: readinessBlockers(state),
        });
      }
      const seq = state.seq + 1;
      const next: ProjectState = input.approved
        ? {
            ...state,
            seq,
            schema_approval: {
              model_seq: state.model_seq,
              approved_at: (this.deps.now?.() ?? new Date()).toISOString(),
            },
            answers: [
              ...state.answers,
              {
                clarification_id: SCHEMA_CLARIFICATION_ID,
                answer: "approved",
                seq,
              },
            ],
          }
        : {
            ...state,
            seq,
            schema_approval: undefined,
            answers: [
              ...state.answers,
              {
                clarification_id: SCHEMA_CLARIFICATION_ID,
                answer: "rejected",
                seq,
              },
            ],
          };
      const open = deriveClarifications(next).filter(
        (item) => item.status === "open",
      );
      return this.commit(next, {
        approved: input.approved,
        model_seq: state.model_seq,
        open_clarifications: open,
        next: input.approved
          ? open.length > 0
            ? "Ask the user the remaining open clarifications."
            : "Check project_status, then generate_application."
          : "Correct the process model from the user's feedback and call submit_process_model.",
      });
    });
  }

  async projectStatus(input: { project_id: string }): Promise<
    Result<
      {
        project_id: string;
        name: string;
        out_dir: string;
        directives: ProjectState["directives"];
        sources: number;
        opportunities: number | null;
        selected_opportunity_id: string | null;
        model: { actors: number; entities: number; steps: number } | null;
        schema_approved: boolean;
        clarifications: { open: number; answered: number };
        design: DesignSpec["kind"];
        ready: boolean;
        blockers: string[];
        generation: ProjectState["generation"] | null;
      },
      FdeaError
    >
  > {
    return this.withProject(input.project_id, async (state) => {
      const clarifications = deriveClarifications(state);
      const blockers = readinessBlockers(state);
      return ok({
        project_id: state.id,
        name: state.name,
        out_dir: state.out_dir,
        directives: state.directives,
        sources: state.sources.length,
        opportunities: state.opportunity_map?.opportunities.length ?? null,
        selected_opportunity_id: isScopeSelected(state)
          ? (state.scope_selection?.opportunity_id ?? null)
          : null,
        model:
          state.model === undefined
            ? null
            : {
                actors: state.model.actors.length,
                entities: state.model.entities.length,
                steps: state.model.steps.length,
              },
        schema_approved: isSchemaApproved(state),
        clarifications: {
          open: clarifications.filter((item) => item.status === "open").length,
          answered: clarifications.filter((item) => item.status === "answered")
            .length,
        },
        design: resolveDesign(state).kind,
        ready: blockers.length === 0,
        blockers,
        generation: state.generation ?? null,
      });
    });
  }

  async generateApplication(input: {
    project_id: string;
  }): Promise<Result<NonNullable<ProjectState["generation"]>, FdeaError>> {
    return this.withProject(input.project_id, async (state) => {
      const blockers = readinessBlockers(state);
      const { fidelity, rbac, deployment, prototype_variants } =
        state.directives;
      const prototype = isPrototype(state);
      if (
        blockers.length > 0 ||
        state.model === undefined ||
        fidelity === undefined ||
        (!prototype && (rbac === undefined || deployment === undefined))
      ) {
        return err({
          tag: "not_ready",
          message:
            "The project is not ready to generate. Resolve the blockers first.",
          blockers,
        });
      }
      const generated = await this.deps.generator.generate({
        projectName: state.name,
        outDir: state.out_dir,
        model: state.model,
        fidelity,
        prototypeVariants: prototype_variants ?? 3,
        rbac: prototype ? false : rbac!,
        deployment: prototype ? "local" : deployment!,
        design: resolveDesign(state),
      });
      if (!generated.ok) return generated;
      return this.commit(
        { ...state, generation: generated.value },
        generated.value,
      );
    });
  }
}
