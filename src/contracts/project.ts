import { z } from "zod";
import { OpportunityMapSchema } from "./opportunityMap.js";
import { ProcessModelSchema } from "./processModel.js";

export const FIDELITIES = ["foundation", "prototype"] as const;

export const DirectivesSchema = z.object({
  fidelity: z
    .enum(FIDELITIES)
    .optional()
    .describe(
      "foundation: production Adonis app. prototype: lightweight Adonis + Vue gallery with mock data.",
    ),
  prototype_variants: z
    .number()
    .int()
    .min(2)
    .max(5)
    .optional()
    .describe(
      "Number of visual approaches to scaffold when fidelity is prototype (default 3).",
    ),
  rbac: z.boolean().optional(),
  deployment: z
    .enum(["cloud", "local", "none"])
    .optional()
    .describe(
      "cloud: PostgreSQL. local: SQLite. none: no database (prototypes).",
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
  deployment: z.enum(["cloud", "local", "none"]),
  rbac: z.boolean(),
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
  created_at: z.string(),
  seq: z.number().int(),
  directives: DirectivesSchema,
  sources: z.array(SourceMetaSchema),
  opportunity_map: OpportunityMapSchema.optional(),
  opportunity_seq: z.number().int().default(0),
  scope_selection: ScopeSelectionSchema.optional(),
  model: ProcessModelSchema.optional(),
  model_seq: z.number().int(),
  answers: z.array(AnswerRecordSchema),
  schema_approval: SchemaApprovalSchema.optional(),
  submitted_design: SubmittedDesignSchema.optional(),
  generation: GenerationResultSchema.optional(),
});

export type Directives = z.infer<typeof DirectivesSchema>;
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
