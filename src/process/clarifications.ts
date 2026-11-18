import type { Directives, ProjectState } from "../contracts/project.js";
import { isScopeSelected, priorityClarificationId } from "./opportunity.js";
import { completenessGaps } from "./validate.js";

export type ClarificationKind =
  | "directive_fidelity"
  | "directive_stack"
  | "directive_rbac"
  | "directive_mcp"
  | "directive_deployment"
  | "directive_scope"
  | "directive_schema"
  | "directive_access"
  | "value_priority"
  | "process_gap"
  | "declared_unknown";

export interface Clarification {
  readonly id: string;
  readonly kind: ClarificationKind;
  readonly question: string;
  readonly options?: readonly string[];
  readonly subject?: string;
  readonly status: "open" | "answered";
  readonly answer?: string;
}

export const FIDELITY_CLARIFICATION_ID = "directive:fidelity";
export const STACK_CLARIFICATION_ID = "directive:stack";
export const RBAC_CLARIFICATION_ID = "directive:rbac";
export const MCP_CLARIFICATION_ID = "directive:mcp";
export const DEPLOYMENT_CLARIFICATION_ID = "directive:deployment";
export const SCOPE_CLARIFICATION_ID = "directive:scope";
export const SCHEMA_CLARIFICATION_ID = "directive:schema";
export const ACCESS_CLARIFICATION_ID = "directive:access";

export const isSchemaApproved = (state: ProjectState): boolean =>
  state.model !== undefined &&
  state.schema_approval !== undefined &&
  state.schema_approval.model_seq === state.model_seq;

export const isAccessApproved = (state: ProjectState): boolean =>
  state.model !== undefined &&
  state.access_approval !== undefined &&
  state.access_approval.model_seq === state.model_seq;

/** Only the fullstack stack has a database, RBAC, MCP and a deployment target. */
const usesDatabase = (directives: Directives): boolean =>
  directives.stack === "fullstack";

export const lacksDatabase = (state: ProjectState): boolean =>
  state.directives.stack === "static";

export type DirectivesPatch = {
  readonly [K in keyof Directives]?: Directives[K] | undefined;
};

/**
 * Directives that only make sense with a database are forced off on the static
 * stack, and asked again when a database comes back.
 */
export const updateDirectives = (
  current: Directives,
  patch: DirectivesPatch,
): Directives => {
  const fidelity = patch.fidelity ?? current.fidelity;
  const stack = patch.stack ?? current.stack;
  const next: Directives = {
    ...(fidelity === undefined ? {} : { fidelity }),
    ...(stack === undefined ? {} : { stack }),
  };
  if (stack === "static") {
    return { ...next, rbac: false, mcp: false, deployment: "none" };
  }
  const carried = current.deployment !== "none";
  const rbac = patch.rbac ?? (carried ? current.rbac : undefined);
  const mcp = patch.mcp ?? (carried ? current.mcp : undefined);
  const deployment =
    patch.deployment ?? (carried ? current.deployment : undefined);
  return {
    ...next,
    ...(rbac === undefined ? {} : { rbac }),
    ...(mcp === undefined ? {} : { mcp }),
    ...(deployment === undefined || deployment === "none"
      ? {}
      : { deployment }),
  };
};

const directiveClarification = (
  base: Omit<Clarification, "status" | "answer">,
  answer: string | undefined,
): Clarification =>
  answer === undefined
    ? { ...base, status: "open" }
    : { ...base, status: "answered", answer };

const latestAnswer = (state: ProjectState, id: string): string | undefined => {
  let latest: { answer: string; seq: number } | undefined;
  for (const record of state.answers) {
    if (
      record.clarification_id === id &&
      (latest === undefined || record.seq > latest.seq)
    ) {
      latest = { answer: record.answer, seq: record.seq };
    }
  }
  return latest?.answer;
};

const withStatus = (
  state: ProjectState,
  base: Omit<Clarification, "status" | "answer">,
): Clarification => {
  const answer = latestAnswer(state, base.id);
  return answer === undefined
    ? { ...base, status: "open" }
    : { ...base, status: "answered", answer };
};

export const deriveClarifications = (state: ProjectState): Clarification[] => {
  const { fidelity, stack, rbac, mcp, deployment } = state.directives;
  const result: Clarification[] = [
    directiveClarification(
      {
        id: FIDELITY_CLARIFICATION_ID,
        kind: "directive_fidelity",
        question:
          "Generate a production foundation with real data only, or a prototype: the same production-ready application filled with mock data derived from the sources?",
        options: ["foundation", "prototype"],
      },
      fidelity,
    ),
  ];

  if (fidelity !== undefined) {
    result.push(
      directiveClarification(
        {
          id: STACK_CLARIFICATION_ID,
          kind: "directive_stack",
          question:
            "Build a fullstack application (AdonisJS + Vue with database, auth and optional MCP) or a static website (Astro + Vue, content in files, no server)?",
          options: ["fullstack", "static"],
        },
        stack,
      ),
    );
  }

  if (usesDatabase(state.directives)) {
    result.push(
      directiveClarification(
        {
          id: RBAC_CLARIFICATION_ID,
          kind: "directive_rbac",
          question:
            "Will the application require role-based access control (RBAC)?",
          options: ["true", "false"],
        },
        rbac === undefined ? undefined : String(rbac),
      ),
      directiveClarification(
        {
          id: MCP_CLARIFICATION_ID,
          kind: "directive_mcp",
          question:
            "Should the application expose an MCP server so AI agents can operate the process through tools (with the same permissions as the UI)?",
          options: ["true", "false"],
        },
        mcp === undefined ? undefined : String(mcp),
      ),
      directiveClarification(
        {
          id: DEPLOYMENT_CLARIFICATION_ID,
          kind: "directive_deployment",
          question: "Will this be a cloud application or a local application?",
          options: ["cloud", "local"],
        },
        deployment === "none" ? undefined : deployment,
      ),
    );
  }

  const map = state.skip_pain ? undefined : state.opportunity_map;
  if (map !== undefined) {
    if (!isScopeSelected(state)) {
      for (const opportunity of map.opportunities) {
        result.push(
          withStatus(state, {
            id: priorityClarificationId(opportunity.id),
            kind: "value_priority",
            question: `How important is solving "${opportunity.title}" relative to the other pains in the documents?`,
            options: ["high", "medium", "low", "defer"],
            subject: opportunity.id,
          }),
        );
      }
    }
    const selectedId = state.scope_selection?.opportunity_id;
    result.push(
      isScopeSelected(state) && selectedId !== undefined
        ? {
            id: SCOPE_CLARIFICATION_ID,
            kind: "directive_scope",
            question:
              "Which opportunity should this application implement? Call get_opportunity_ranking, show the ranking to the user, then select_opportunity with their choice.",
            options: map.opportunities.map((item) => item.id),
            status: "answered",
            answer: selectedId,
          }
        : {
            id: SCOPE_CLARIFICATION_ID,
            kind: "directive_scope",
            question:
              "Which opportunity should this application implement? Call get_opportunity_ranking, show the ranking to the user, then select_opportunity with their choice.",
            options: map.opportunities.map((item) => item.id),
            status: "open",
          },
    );
  }

  const model = state.model;
  if (model === undefined) return result;

  if (usesDatabase(state.directives)) {
    result.push(
      directiveClarification(
        {
          id: SCHEMA_CLARIFICATION_ID,
          kind: "directive_schema",
          question:
            "Does the database schema correctly represent the process? Call get_database_schema, show the Mermaid ER diagram (schema.summary) to the user, and record their approval with approve_database_schema before generating.",
          options: ["approved", "rejected"],
        },
        isSchemaApproved(state) ? "approved" : undefined,
      ),
    );
    if (rbac === true) {
      result.push(
        directiveClarification(
          {
            id: ACCESS_CLARIFICATION_ID,
            kind: "directive_access",
            question:
              "Who can do what? Call get_access_matrix, show the permissions of each role (summary) to the user, ask whether each role should have exactly these permissions, and record their decision with approve_access_matrix before generating.",
            options: ["approved", "rejected"],
          },
          isAccessApproved(state) ? "approved" : undefined,
        ),
      );
    }
  }

  for (const gap of completenessGaps(model)) {
    result.push(
      withStatus(state, {
        id: gap.id,
        kind: "process_gap",
        question: gap.question,
        subject: gap.subject,
      }),
    );
  }
  for (const unknown of model.unknowns) {
    result.push(
      withStatus(state, {
        id: `unknown:${unknown.id}`,
        kind: "declared_unknown",
        question: unknown.question,
        subject: unknown.subject,
      }),
    );
  }
  return result;
};

export const readinessBlockers = (state: ProjectState): string[] => {
  const blockers: string[] = [];
  if (
    state.sources.filter((source) => source.role === "process").length === 0
  ) {
    blockers.push("No process source has been ingested (ingest_source).");
  }
  if (!state.skip_pain) {
    if (state.opportunity_map === undefined) {
      blockers.push(
        "No opportunity map has been submitted (submit_opportunity_map). Extract the most valuable pains from the documents before modeling the process.",
      );
    } else if (!isScopeSelected(state)) {
      blockers.push(
        "No build scope has been selected (select_opportunity). Show get_opportunity_ranking to the user and record their choice.",
      );
    }
  }
  if (state.model === undefined) {
    blockers.push(
      state.skip_pain
        ? "No process model has been submitted (submit_process_model). Model what the sources ask to build."
        : "No process model has been submitted (submit_process_model).",
    );
  }
  if (
    state.model !== undefined &&
    state.directives.fidelity === "prototype" &&
    state.mock_data === undefined
  ) {
    blockers.push(
      "No mock data has been submitted (submit_mock_data). A prototype is the application filled with mock data: derive realistic records for every entity from the context of the sources.",
    );
  }
  for (const item of deriveClarifications(state)) {
    if (item.status === "open")
      blockers.push(`Open clarification ${item.id}: ${item.question}`);
  }
  const stale = state.answers.some(
    (record) =>
      !record.clarification_id.startsWith("directive:") &&
      !record.clarification_id.startsWith("value:") &&
      record.seq > state.model_seq,
  );
  if (stale && state.model !== undefined) {
    blockers.push(
      "Clarification answers were recorded after the last process model. Resubmit the process model so it reflects them (submit_process_model).",
    );
  }
  return blockers;
};
