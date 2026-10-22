import { z } from "zod";
import { EvidenceSchema } from "./processModel.js";

const identifier = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "use lower snake_case: letters, digits, underscore",
  );

const evidence = z.array(EvidenceSchema).min(1);

export const FRICTION_KINDS = [
  "manual_rework",
  "handoff_delay",
  "error_risk",
  "visibility",
  "compliance",
  "tool_gap",
  "other",
] as const;

export const SIGNAL_STRENGTHS = ["none", "weak", "stated"] as const;

export const OpportunitySignalsSchema = z.object({
  frequency: z
    .enum(SIGNAL_STRENGTHS)
    .describe(
      "How often the pain occurs, only from the documents: stated when they give cadence, weak when implied, none when absent.",
    ),
  volume: z
    .enum(SIGNAL_STRENGTHS)
    .describe(
      "How many people or cases are affected: stated when quantified, weak when implied, none when absent.",
    ),
  cost_or_money: z
    .enum(SIGNAL_STRENGTHS)
    .describe(
      "Money, time cost or loss language in the documents: stated, weak or none.",
    ),
  severity: z
    .enum(SIGNAL_STRENGTHS)
    .describe(
      "Risk, failure or severity language in the documents: stated, weak or none.",
    ),
});

export const OpportunitySchema = z.object({
  id: identifier,
  title: z.string().min(1),
  pain: z
    .string()
    .min(1)
    .describe("The painful situation as the documents describe it."),
  friction_kind: z.enum(FRICTION_KINDS),
  affected_actor_labels: z
    .array(z.string().min(1))
    .min(1)
    .describe("Who suffers, using labels from the documents."),
  current_workaround: z
    .string()
    .min(1)
    .optional()
    .describe("What people do today when the documents say so."),
  software_hypothesis: z
    .string()
    .min(1)
    .describe(
      "The thinnest software that would remove this pain, still grounded in the documents.",
    ),
  signals: OpportunitySignalsSchema,
  confidence: z
    .enum(["stated", "inferred"])
    .describe(
      "stated when the pain is explicit in the documents; inferred when you are reading between lines (inferred items rank lower).",
    ),
  depends_on: z
    .array(identifier)
    .optional()
    .describe("Other opportunity ids that must be solved first."),
  enables: z
    .array(identifier)
    .optional()
    .describe("Other opportunity ids this would unlock."),
  evidence,
});

export const OpportunityMapSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe("One paragraph on what the documents suggest is worth building."),
  opportunities: z.array(OpportunitySchema).min(1),
});

export type OpportunitySignals = z.infer<typeof OpportunitySignalsSchema>;
export type Opportunity = z.infer<typeof OpportunitySchema>;
export type OpportunityMap = z.infer<typeof OpportunityMapSchema>;
