import type {
  Entity,
  Evidence,
  ProcessModel,
} from "../contracts/processModel.js";
import { entityNames } from "./naming.js";

export type QuoteLookup = "ok" | "missing_source" | "not_found";

export interface EvidenceVerifier {
  (evidence: Evidence): QuoteLookup;
}

export const RESERVED_FIELD_NAMES: ReadonlySet<string> = new Set([
  "id",
  "created_at",
  "updated_at",
]);

export const RESERVED_ENTITY_IDS: ReadonlySet<string> = new Set([
  "user",
  "role",
  "permission",
  "session",
  "new_account",
]);

const RESERVED_TABLES: ReadonlySet<string> = new Set([
  "users",
  "roles",
  "permissions",
  "permission_role",
  "sessions",
  "adonis_schema",
  "adonis_schema_versions",
]);

const RESERVED_ROUTE_PATHS: ReadonlySet<string> = new Set([
  "login",
  "logout",
  "dashboard",
]);

const CRUD_ROUTE_NAMES: ReadonlySet<string> = new Set([
  "index",
  "show",
  "create",
  "store",
  "edit",
  "update",
  "destroy",
]);

const duplicates = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
};

const entityIssues = (
  entity: Entity,
  entityIds: ReadonlySet<string>,
): string[] => {
  const issues: string[] = [];
  const at = `entity ${entity.id}`;
  if (RESERVED_ENTITY_IDS.has(entity.id)) {
    issues.push(`${at}: id is reserved by the application's authentication`);
  }
  const names = entityNames(entity);
  if (RESERVED_TABLES.has(names.table)) {
    issues.push(`${at}: table name ${names.table} is reserved; set plural_id`);
  }
  if (RESERVED_ROUTE_PATHS.has(names.routePath)) {
    issues.push(`${at}: route /${names.routePath} is reserved; set plural_id`);
  }
  for (const name of duplicates(entity.fields.map((field) => field.name))) {
    issues.push(`${at}: duplicate field ${name}`);
  }
  const fieldNames = new Map(entity.fields.map((field) => [field.name, field]));
  for (const field of entity.fields) {
    const where = `${at}.${field.name}`;
    if (RESERVED_FIELD_NAMES.has(field.name)) {
      issues.push(`${where}: field name is generated automatically`);
    }
    if (field.type === "enum") {
      const values = field.enum_values ?? [];
      if (values.length === 0)
        issues.push(`${where}: enum requires enum_values`);
      if (new Set(values).size !== values.length) {
        issues.push(`${where}: enum_values must be unique`);
      }
    } else if (field.enum_values !== undefined) {
      issues.push(`${where}: enum_values is only valid for type enum`);
    }
    if (field.type === "reference") {
      if (field.references === undefined) {
        issues.push(`${where}: reference requires references`);
      } else if (!entityIds.has(field.references)) {
        issues.push(`${where}: references unknown entity ${field.references}`);
      }
    } else if (field.references !== undefined) {
      issues.push(`${where}: references is only valid for type reference`);
    }
  }
  if (entity.display_field !== undefined) {
    const display = fieldNames.get(entity.display_field);
    if (display === undefined) {
      issues.push(
        `${at}: display_field ${entity.display_field} is not a field`,
      );
    } else if (display.type === "reference") {
      issues.push(`${at}: display_field must not be a reference`);
    }
  }
  return issues;
};

const stepIssues = (model: ProcessModel): string[] => {
  const issues: string[] = [];
  const actorIds = new Set(model.actors.map((actor) => actor.id));
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  for (const step of model.steps) {
    const at = `step ${step.id}`;
    for (const actorId of step.actor_ids) {
      if (!actorIds.has(actorId))
        issues.push(`${at}: unknown actor ${actorId}`);
    }
    const transitionEntities: string[] = [];
    for (const operation of step.operations) {
      const entity = entities.get(operation.entity_id);
      if (entity === undefined) {
        issues.push(`${at}: unknown entity ${operation.entity_id}`);
        continue;
      }
      if (operation.kind !== "transition") {
        if (operation.transition !== undefined) {
          issues.push(`${at}: transition is only valid for kind transition`);
        }
        continue;
      }
      transitionEntities.push(entity.id);
      if (CRUD_ROUTE_NAMES.has(step.id)) {
        issues.push(
          `${at}: id ${step.id} is reserved for a transition step; rename the step`,
        );
      }
      const transition = operation.transition;
      if (transition === undefined) {
        issues.push(`${at}: kind transition requires transition`);
        continue;
      }
      const field = entity.fields.find(
        (candidate) => candidate.name === transition.field,
      );
      if (field === undefined || field.type !== "enum") {
        issues.push(
          `${at}: ${entity.id}.${transition.field} is not an enum field`,
        );
        continue;
      }
      const allowed = new Set(field.enum_values ?? []);
      for (const value of [transition.to, ...(transition.from ?? [])]) {
        if (!allowed.has(value)) {
          issues.push(
            `${at}: ${value} is not a value of ${entity.id}.${field.name}`,
          );
        }
      }
    }
    for (const entityId of duplicates(transitionEntities)) {
      issues.push(`${at}: more than one transition on entity ${entityId}`);
    }
  }
  return issues;
};

const evidenceTargets = (model: ProcessModel): Array<[string, Evidence[]]> => [
  ...model.actors.map((actor): [string, Evidence[]] => [
    `actor ${actor.id}`,
    actor.evidence,
  ]),
  ...model.entities.flatMap((entity): Array<[string, Evidence[]]> => [
    [`entity ${entity.id}`, entity.evidence],
    ...entity.fields.map((field): [string, Evidence[]] => [
      `entity ${entity.id}.${field.name}`,
      field.evidence,
    ]),
  ]),
  ...model.steps.map((step): [string, Evidence[]] => [
    `step ${step.id}`,
    step.evidence,
  ]),
];

export const integrityIssues = (
  model: ProcessModel,
  verify: EvidenceVerifier,
): string[] => {
  const issues: string[] = [];
  for (const id of duplicates(model.actors.map((actor) => actor.id))) {
    issues.push(`duplicate actor ${id}`);
  }
  for (const id of duplicates(model.entities.map((entity) => entity.id))) {
    issues.push(`duplicate entity ${id}`);
  }
  for (const id of duplicates(model.steps.map((step) => step.id))) {
    issues.push(`duplicate step ${id}`);
  }
  for (const id of duplicates(model.unknowns.map((unknown) => unknown.id))) {
    issues.push(`duplicate unknown ${id}`);
  }
  for (const table of duplicates(
    model.entities.map((entity) => entityNames(entity).table),
  )) {
    issues.push(`entities share the table name ${table}; set plural_id`);
  }
  const entityIds = new Set(model.entities.map((entity) => entity.id));
  for (const entity of model.entities)
    issues.push(...entityIssues(entity, entityIds));
  issues.push(...stepIssues(model));
  for (const [subject, evidence] of evidenceTargets(model)) {
    for (const item of evidence) {
      const outcome = verify(item);
      if (outcome === "missing_source") {
        issues.push(
          `${subject}: evidence cites unknown source ${item.source_id}`,
        );
      } else if (outcome === "not_found") {
        issues.push(
          `${subject}: quote not found in source ${item.source_id}: "${item.quote.slice(0, 60)}"`,
        );
      }
    }
  }
  return issues;
};

export interface Gap {
  readonly id: string;
  readonly question: string;
  readonly subject: string;
}

export const completenessGaps = (model: ProcessModel): Gap[] => {
  const gaps: Gap[] = [];
  if (model.actors.length === 0) {
    gaps.push({
      id: "gap:no_actors",
      subject: "model",
      question: "Who performs this process? Name each person or role involved.",
    });
  }
  if (model.entities.length === 0) {
    gaps.push({
      id: "gap:no_entities",
      subject: "model",
      question:
        "Which records or documents does this process create, track or change?",
    });
  }
  if (model.steps.length === 0) {
    gaps.push({
      id: "gap:no_steps",
      subject: "model",
      question: "What are the steps of the process, and who performs each one?",
    });
  }
  const used = new Map<string, Set<string>>();
  for (const step of model.steps) {
    for (const operation of step.operations) {
      const kinds = used.get(operation.entity_id) ?? new Set<string>();
      kinds.add(operation.kind);
      used.set(operation.entity_id, kinds);
    }
  }
  for (const entity of model.entities) {
    if (entity.fields.length === 0) {
      gaps.push({
        id: `gap:entity_without_fields:${entity.id}`,
        subject: entity.id,
        question: `Which information is captured for a ${entity.name}?`,
      });
    }
    const kinds = used.get(entity.id);
    if (kinds === undefined) {
      gaps.push({
        id: `gap:entity_unused:${entity.id}`,
        subject: entity.id,
        question: `Which step creates, reads or changes a ${entity.name}?`,
      });
    } else if (!kinds.has("create")) {
      gaps.push({
        id: `gap:entity_never_created:${entity.id}`,
        subject: entity.id,
        question: `Which step creates a ${entity.name}, and who performs it?`,
      });
    }
  }
  const acting = new Set(model.steps.flatMap((step) => step.actor_ids));
  for (const actor of model.actors) {
    if (!acting.has(actor.id)) {
      gaps.push({
        id: `gap:actor_without_steps:${actor.id}`,
        subject: actor.id,
        question: `Which steps does ${actor.name} perform?`,
      });
    }
  }
  return gaps;
};
