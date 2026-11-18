import { z } from "zod";
import { MockDataSchema } from "./mockData.js";
import { OpportunityMapSchema } from "./opportunityMap.js";
import { ProcessModelSchema } from "./processModel.js";
import { SourceRoleSchema, STACKS, SubmittedDesignSchema } from "./project.js";

const projectId = z
  .string()
  .min(1)
  .describe("Project id returned by create_project.");

export const TOOL_INPUTS = {
  create_project: {
    name: z.string().min(1).describe("Short name of the software to build."),
    out_dir: z
      .string()
      .min(1)
      .describe(
        "Absolute path of the directory the application is generated into. Must be absent or empty.",
      ),
    skip_pain: z
      .boolean()
      .optional()
      .describe(
        "Skip pain analysis: the sources are the specification and are applied as asked. When true, do not submit an opportunity map, rank pains, or select an opportunity; submit a process model of everything the sources ask for after reading them.",
      ),
  },
  ingest_source: {
    project_id: projectId,
    url: z
      .string()
      .url()
      .optional()
      .describe("http(s) URL of a documentation page, PDF, DOCX or image."),
    path: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Absolute path of a local file (pdf, docx, md, txt, html, png, jpg, webp, gif).",
      ),
    inline: z
      .object({
        name: z.string().min(1),
        text: z.string().optional(),
        base64: z.string().optional(),
        media_type: z.string().optional(),
      })
      .optional()
      .describe("Inline content, as text or base64 bytes."),
    role: SourceRoleSchema.optional().describe(
      "process (default): describes the process. design: brand or UI reference used to infer the design.",
    ),
  },
  list_sources: { project_id: projectId },
  read_source: {
    project_id: projectId,
    source_id: z.string().min(1),
    offset: z.number().int().min(0).optional(),
    limit: z.number().int().min(1).max(60_000).optional(),
  },
  submit_opportunity_map: {
    project_id: projectId,
    map: OpportunityMapSchema.describe(
      "Pain points and software opportunities grounded in the documents. Include only evidenced pains; do not invent ROI or features.",
    ),
  },
  get_opportunity_ranking: { project_id: projectId },
  select_opportunity: {
    project_id: projectId,
    opportunity_id: z
      .string()
      .min(1)
      .describe(
        "Id of the opportunity the user chose to implement. Required before submit_process_model.",
      ),
  },
  get_process_model: { project_id: projectId },
  submit_process_model: {
    project_id: projectId,
    model: ProcessModelSchema.describe(
      "The process for the selected opportunity only, or, when the project was created with skip_pain, the process the sources ask to build. Include only what the sources support; record anything unclear or out of scope in unknowns.",
    ),
  },
  submit_mock_data: {
    project_id: projectId,
    mock_data: MockDataSchema.describe(
      "Mock records for every entity of the process model, derived from the context of the sources: the vocabulary, names, places, currencies, volumes, languages and states they show. Fictional only, never real personal data.",
    ),
  },
  list_clarifications: { project_id: projectId },
  answer_clarifications: {
    project_id: projectId,
    answers: z
      .array(z.object({ id: z.string().min(1), answer: z.string().min(1) }))
      .min(1),
  },
  set_implementation_directives: {
    project_id: projectId,
    fidelity: z
      .enum(["foundation", "prototype"])
      .optional()
      .describe(
        "foundation: production-ready application with real data only. prototype: the same production-ready application filled with mock data.",
      ),
    stack: z
      .enum(STACKS)
      .optional()
      .describe(
        "fullstack: AdonisJS + Vue (database, auth, optional MCP). static: Astro + Vue static website (no server, database, auth or MCP).",
      ),
    rbac: z
      .boolean()
      .optional()
      .describe(
        "Whether the application requires role-based access control. Ignored on the static stack.",
      ),
    mcp: z
      .boolean()
      .optional()
      .describe(
        "Whether the application exposes an MCP server so agents can operate the process. Ignored on the static stack.",
      ),
    deployment: z
      .enum(["cloud", "local"])
      .optional()
      .describe(
        "cloud: PostgreSQL. local: SQLite on one machine. Ignored on the static stack (no database).",
      ),
  },
  get_design_spec: { project_id: projectId },
  submit_design_spec: {
    project_id: projectId,
    design: SubmittedDesignSchema.describe(
      "Design tokens you derived from the design sources (for example by viewing an image).",
    ),
  },
  get_database_schema: {
    project_id: projectId,
  },
  approve_database_schema: {
    project_id: projectId,
    approved: z
      .boolean()
      .describe(
        "true when the user confirms the schema. false rejects it so the process model must be corrected and resubmitted.",
      ),
  },
  get_access_matrix: {
    project_id: projectId,
  },
  approve_access_matrix: {
    project_id: projectId,
    approved: z
      .boolean()
      .describe(
        "true when the user confirms who can do what. false rejects it so the process model (step actors) must be corrected and resubmitted.",
      ),
  },
  generate_application: { project_id: projectId },
  project_status: { project_id: projectId },
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;

export const TOOL_NAMES = Object.keys(TOOL_INPUTS) as ToolName[];

export type ToolInput<N extends ToolName> = z.infer<
  z.ZodObject<(typeof TOOL_INPUTS)[N]>
>;
