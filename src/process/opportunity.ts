import type {
  Opportunity,
  OpportunityMap,
  OpportunitySignals,
} from "../contracts/opportunityMap.js";
import type { ProjectState } from "../contracts/project.js";
import type { EvidenceVerifier } from "./validate.js";

const duplicates = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

export const opportunityIntegrityIssues = (
  map: OpportunityMap,
  verify: EvidenceVerifier,
): string[] => {
  const issues: string[] = [];
  const ids = new Set(map.opportunities.map((item) => item.id));
  for (const id of duplicates(map.opportunities.map((item) => item.id))) {
    issues.push(`duplicate opportunity ${id}`);
  }
  for (const opportunity of map.opportunities) {
    const at = `opportunity ${opportunity.id}`;
    for (const dependency of opportunity.depends_on ?? []) {
      if (!ids.has(dependency)) {
        issues.push(
          `${at}: depends_on cites unknown opportunity ${dependency}`,
        );
      }
      if (dependency === opportunity.id) {
        issues.push(`${at}: depends_on cannot include itself`);
      }
    }
    for (const enabled of opportunity.enables ?? []) {
      if (!ids.has(enabled)) {
        issues.push(`${at}: enables cites unknown opportunity ${enabled}`);
      }
      if (enabled === opportunity.id) {
        issues.push(`${at}: enables cannot include itself`);
      }
    }
    for (const item of opportunity.evidence) {
      const outcome = verify(item);
      if (outcome === "missing_source") {
        issues.push(`${at}: evidence cites unknown source ${item.source_id}`);
      } else if (outcome === "not_found") {
        issues.push(
          `${at}: quote not found in source ${item.source_id}: "${item.quote.slice(0, 60)}"`,
        );
      }
    }
  }
  return issues;
};

const signalScore = (signals: OpportunitySignals): number => {
  const weight = { none: 0, weak: 1, stated: 3 } as const;
  return (
    weight[signals.frequency] +
    weight[signals.volume] +
    weight[signals.cost_or_money] +
    (signals.severity === "stated" ? 2 : signals.severity === "weak" ? 1 : 0)
  );
};

export type PriorityAnswer = "high" | "medium" | "low" | "defer";

export const priorityAnswerOf = (
  answer: string | undefined,
): PriorityAnswer | undefined => {
  if (answer === undefined) return undefined;
  const value = answer.trim().toLowerCase();
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "defer"
  ) {
    return value;
  }
  return undefined;
};

const priorityBonus = (answer: PriorityAnswer | undefined): number => {
  switch (answer) {
    case "high":
      return 4;
    case "medium":
      return 2;
    case "low":
      return 0;
    case "defer":
      return -8;
    case undefined:
      return 0;
  }
};

export interface RankedOpportunity {
  readonly opportunity: Opportunity;
  readonly score: number;
  readonly factors: readonly string[];
  readonly priority_answer: PriorityAnswer | undefined;
}

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

export const priorityClarificationId = (opportunityId: string): string =>
  `value:priority:${opportunityId}`;

export const rankOpportunities = (state: ProjectState): RankedOpportunity[] => {
  const map = state.opportunity_map;
  if (map === undefined) return [];
  const ranked = map.opportunities.map((opportunity) => {
    const factors: string[] = [];
    let score = signalScore(opportunity.signals);
    factors.push(`document signals ${score}`);
    if (opportunity.current_workaround !== undefined) {
      score += 2;
      factors.push("explicit workaround +2");
    }
    const actorBonus = Math.min(3, opportunity.affected_actor_labels.length);
    score += actorBonus;
    factors.push(`affected actors +${actorBonus}`);
    if (opportunity.confidence === "inferred") {
      score -= 2;
      factors.push("inferred confidence -2");
    }
    const dependencies = opportunity.depends_on?.length ?? 0;
    if (dependencies > 0) {
      score -= dependencies;
      factors.push(`depends_on -${dependencies}`);
    }
    const priority = priorityAnswerOf(
      latestAnswer(state, priorityClarificationId(opportunity.id)),
    );
    const bonus = priorityBonus(priority);
    if (priority !== undefined) {
      score += bonus;
      factors.push(
        `user priority ${priority} ${bonus >= 0 ? "+" : ""}${bonus}`,
      );
    }
    return {
      opportunity,
      score,
      factors,
      priority_answer: priority,
    };
  });
  return ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.opportunity.id.localeCompare(right.opportunity.id);
  });
};

export const rankingSummary = (
  ranked: readonly RankedOpportunity[],
): string => {
  if (ranked.length === 0) return "No opportunities submitted.";
  const lines = [
    "# Opportunity ranking",
    "",
    "Scores combine document signals (frequency, volume, cost, severity),",
    "workarounds, affected actors, confidence, dependencies, and your priority answers.",
    "Inferred pains score lower. Numbers and ROI are never invented.",
    "",
  ];
  for (const [index, item] of ranked.entries()) {
    lines.push(
      `${index + 1}. **${item.opportunity.title}** (\`${item.opportunity.id}\`) — score ${item.score}`,
    );
    lines.push(`   Pain: ${item.opportunity.pain}`);
    lines.push(`   Build: ${item.opportunity.software_hypothesis}`);
    lines.push(`   Factors: ${item.factors.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
};

export const isScopeSelected = (state: ProjectState): boolean =>
  state.opportunity_map !== undefined &&
  state.scope_selection !== undefined &&
  state.scope_selection.opportunity_seq === state.opportunity_seq;

export const selectedOpportunity = (
  state: ProjectState,
): Opportunity | undefined => {
  if (!isScopeSelected(state) || state.scope_selection === undefined) {
    return undefined;
  }
  return state.opportunity_map?.opportunities.find(
    (item) => item.id === state.scope_selection?.opportunity_id,
  );
};
