import { z } from "zod";

const MockValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const MockRowSchema = z.object({
  id: z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
      "use letters, digits, underscore or dash",
    )
    .describe(
      "Stable key of the row, unique within its entity. Reference fields of other rows hold this key.",
    ),
  values: z
    .record(z.string(), MockValueSchema)
    .describe(
      "Field values keyed by field name. Dates are YYYY-MM-DD, datetimes ISO 8601, decimals and integers are numbers, enums one of enum_values, references the id of a row of the target entity. Omit or null an optional field.",
    ),
});

export const MockEntitySchema = z.object({
  entity_id: z.string().min(1),
  rows: z.array(MockRowSchema).min(1),
});

export const MockDataSchema = z.object({
  entities: z.array(MockEntitySchema),
});

export type MockRow = z.infer<typeof MockRowSchema>;
export type MockEntity = z.infer<typeof MockEntitySchema>;
export type MockData = z.infer<typeof MockDataSchema>;
