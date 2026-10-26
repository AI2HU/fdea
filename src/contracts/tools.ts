import { z } from "zod";
import { OpportunityMapSchema } from "./opportunityMap.js";
import { ProcessModelSchema } from "./processModel.js";
import { SourceRoleSchema, SubmittedDesignSchema } from "./project.js";

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
      "The process for the selected opportunity only. Include only what the sources support; record anything unclear or out of scope in unknowns.",
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
        "foundation: production-ready Adonis app. prototype: lightweight Adonis + Vue approach gallery with mock data.",
      ),
    prototype_variants: z
      .number()
      .int()
      .min(2)
      .max(5)
      .optional()
      .describe(
        "How many visual approaches to scaffold for a prototype (default 3).",
      ),
    rbac: z
      .boolean()
      .optional()
      .describe(
        "Whether the application requires role-based access control. Ignored when fidelity is prototype.",
      ),
    deployment: z
      .enum(["cloud", "local"])
      .optional()
      .describe(
        "cloud: PostgreSQL. local: SQLite on one machine. Ignored when fidelity is prototype (no database).",
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
  generate_application: { project_id: projectId },
  project_status: { project_id: projectId },
} as const;

export type ToolName = keyof typeof TOOL_INPUTS;

export const TOOL_NAMES = Object.keys(TOOL_INPUTS) as ToolName[];

export type ToolInput<N extends ToolName> = z.infer<
  z.ZodObject<(typeof TOOL_INPUTS)[N]>
>;
