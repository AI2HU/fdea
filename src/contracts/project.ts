import { z } from "zod";
import { MockDataSchema } from "./mockData.js";
import { OpportunityMapSchema } from "./opportunityMap.js";
import { ProcessModelSchema } from "./processModel.js";

export const FIDELITIES = ["foundation", "prototype"] as const;
export const STACKS = ["fullstack", "static"] as const;

export const DirectivesSchema = z.object({
  fidelity: z
    .enum(FIDELITIES)
    .optional()
    .describe(
      "foundation: production application with real data only. prototype: the same production-ready application filled with mock data.",
    ),
  stack: z
    .enum(STACKS)
    .optional()
    .describe(
      "fullstack: AdonisJS + Vue with database, auth and optional MCP. static: Astro + Vue static website.",
    ),
  rbac: z.boolean().optional(),
  mcp: z
    .boolean()
    .optional()
    .describe(
      "Whether the fullstack application exposes an MCP server for agents. Always false on the static stack.",
    ),
  deployment: z
    .enum(["cloud", "local", "none"])
    .optional()
    .describe(
      "cloud: PostgreSQL. local: SQLite. none: no database (static stack).",
    ),
});

export const DESIGN_TOKEN_KEYS = [
  "primary",
  "primary_foreground",
  "background",
  "foreground",
  "accent",
  "muted",
  "border",
  "destructive",
] as const;

const cssColor = z
  .string()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|oklch\([^)]+\)|rgb\([^)]+\)|hsl\([^)]+\))$/,
    "use a hex, rgb(), hsl() or oklch() color",
  );

export const DesignTokensSchema = z.object({
  primary: cssColor,
  primary_foreground: cssColor,
  background: cssColor,
  foreground: cssColor,
  accent: cssColor,
  muted: cssColor,
  border: cssColor,
  destructive: cssColor,
  radius: z.string().regex(/^\d+(\.\d+)?(rem|px)$/),
  font_sans: z.string().min(1),
});

export const DesignProvenanceSchema = z.object({
  source_id: z.string().min(1),
  cue: z.string().min(1),
});

export const SubmittedDesignSchema = z.object({
  tokens: DesignTokensSchema,
  provenance: z.array(DesignProvenanceSchema).min(1),
});

export const DesignSpecSchema = z.object({
  kind: z.enum(["inferred", "agent_provided", "shadcn_default"]),
  tokens: DesignTokensSchema,
  provenance: z.array(DesignProvenanceSchema),
});

export const SourceKindSchema = z.enum(["web", "pdf", "docx", "text", "image"]);
export const SourceRoleSchema = z.enum(["process", "design"]);

export const DesignCuesSchema = z.object({
  colors: z.array(
    z.object({ value: z.string(), cue: z.string(), weight: z.number() }),
  ),
  fonts: z.array(z.string()),
  radius: z.string().optional(),
  background: z.string().optional(),
});

export const SourceMetaSchema = z.object({
  id: z.string(),
  kind: SourceKindSchema,
  role: SourceRoleSchema,
  name: z.string(),
  origin: z.object({
    type: z.enum(["url", "path", "inline"]),
    value: z.string(),
  }),
  sha256: z.string(),
  bytes: z.number().int(),
  text_chars: z.number().int(),
  stored_path: z.string().optional(),
  image: z
    .object({
      width: z.number().int(),
      height: z.number().int(),
      format: z.string(),
    })
    .optional(),
  embedded_images: z.array(z.string()),
  design_cues: DesignCuesSchema,
  limitations: z.array(z.string()),
  ingested_at: z.string(),
});

export const GenerationResultSchema = z.object({
  output_dir: z.string(),
  generated_at: z.string(),
  scaffold: z.object({ kit: z.string(), command: z.string() }),
  fidelity: z.enum(FIDELITIES).default("foundation"),
  stack: z.enum(STACKS).default("fullstack"),
  deployment: z.enum(["cloud", "local", "none"]),
  rbac: z.boolean(),
  mcp: z.boolean().default(false),
  design_kind: z.enum(["inferred", "agent_provided", "shadcn_default"]),
  files: z.array(z.string()),
  ui_backlog: z
    .array(
      z.object({
        page: z.string(),
        route: z.string(),
        purpose: z.string(),
        props: z.array(z.string()),
        permission: z.string().optional(),
      }),
    )
    .default([]),
  verification: z.object({
    typecheck: z.enum(["passed", "failed"]),
    build: z.enum(["passed", "failed"]),
    output: z.string().optional(),
  }),
  limitations: z.array(z.string()),
});

export const AnswerRecordSchema = z.object({
  clarification_id: z.string(),
  answer: z.string(),
  seq: z.number().int(),
});

export const SchemaApprovalSchema = z.object({
  model_seq: z.number().int(),
  approved_at: z.string(),
});

export const ScopeSelectionSchema = z.object({
  opportunity_id: z.string().min(1),
  opportunity_seq: z.number().int(),
  selected_at: z.string(),
});

export const ProjectStateSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  name: z.string(),
  out_dir: z.string(),
  skip_pain: z.boolean().default(false),
  created_at: z.string(),
  seq: z.number().int(),
  directives: DirectivesSchema,
  sources: z.array(SourceMetaSchema),
  opportunity_map: OpportunityMapSchema.optional(),
  opportunity_seq: z.number().int().default(0),
  scope_selection: ScopeSelectionSchema.optional(),
  model: ProcessModelSchema.optional(),
  model_seq: z.number().int(),
  mock_data: MockDataSchema.optional(),
  answers: z.array(AnswerRecordSchema),
  schema_approval: SchemaApprovalSchema.optional(),
  access_approval: SchemaApprovalSchema.optional(),
  submitted_design: SubmittedDesignSchema.optional(),
  generation: GenerationResultSchema.optional(),
});

export type Directives = z.infer<typeof DirectivesSchema>;
export type Fidelity = (typeof FIDELITIES)[number];
export type Stack = (typeof STACKS)[number];
export type DesignTokens = z.infer<typeof DesignTokensSchema>;
export type DesignSpec = z.infer<typeof DesignSpecSchema>;
export type SubmittedDesign = z.infer<typeof SubmittedDesignSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type SourceRole = z.infer<typeof SourceRoleSchema>;
export type DesignCues = z.infer<typeof DesignCuesSchema>;
export type SourceMeta = z.infer<typeof SourceMetaSchema>;
export type GenerationResult = z.infer<typeof GenerationResultSchema>;
export type AnswerRecord = z.infer<typeof AnswerRecordSchema>;
export type SchemaApproval = z.infer<typeof SchemaApprovalSchema>;
export type ScopeSelection = z.infer<typeof ScopeSelectionSchema>;
export type ProjectState = z.infer<typeof ProjectStateSchema>;
