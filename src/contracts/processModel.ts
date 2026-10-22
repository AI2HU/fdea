import { z } from "zod";

const identifier = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "use lower snake_case: letters, digits, underscore",
  );

export const EvidenceSchema = z.object({
  source_id: z.string().min(1),
  quote: z
    .string()
    .min(1)
    .describe(
      "Verbatim excerpt of the source that supports this element. For image sources, a short observation of what the image shows.",
    ),
});

const evidence = z.array(EvidenceSchema).min(1);

export const FIELD_TYPES = [
  "string",
  "text",
  "integer",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "enum",
  "reference",
] as const;

export const FieldSchema = z.object({
  name: identifier,
  label: z.string().min(1).optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
  unique: z.boolean().optional(),
  enum_values: z.array(z.string().min(1)).min(1).optional(),
  references: identifier
    .optional()
    .describe("Target entity id when type is reference (many-to-one)."),
  evidence,
});

export const EntitySchema = z.object({
  id: identifier,
  name: z.string().min(1),
  plural_id: identifier.optional(),
  description: z.string().optional(),
  display_field: identifier.optional(),
  fields: z.array(FieldSchema),
  evidence,
});

export const OPERATION_KINDS = [
  "list",
  "view",
  "create",
  "update",
  "delete",
  "transition",
] as const;

export const OperationSchema = z.object({
  entity_id: identifier,
  kind: z.enum(OPERATION_KINDS),
  transition: z
    .object({
      field: identifier,
      from: z.array(z.string().min(1)).optional(),
      to: z.string().min(1),
    })
    .optional(),
});

export const ActorSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string().optional(),
  evidence,
});

export const StepSchema = z.object({
  id: identifier,
  name: z.string().min(1),
  description: z.string().min(1),
  actor_ids: z.array(identifier).min(1),
  operations: z.array(OperationSchema).min(1),
  evidence,
});

export const DeclaredUnknownSchema = z.object({
  id: identifier,
  question: z.string().min(1),
  subject: z.string().min(1),
});

export const ProcessModelSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  actors: z.array(ActorSchema),
  entities: z.array(EntitySchema),
  steps: z.array(StepSchema),
  unknowns: z.array(DeclaredUnknownSchema),
});

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Step = z.infer<typeof StepSchema>;
export type DeclaredUnknown = z.infer<typeof DeclaredUnknownSchema>;
export type ProcessModel = z.infer<typeof ProcessModelSchema>;
