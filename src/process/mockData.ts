import type { Entity, Field, ProcessModel } from "../contracts/processModel.js";
import type { MockData, MockRow } from "../contracts/mockData.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

type Value = MockRow["values"][string];

const valueIssue = (
  field: Field,
  value: Exclude<Value, null>,
  referenceable: ReadonlySet<string> | undefined,
): string | undefined => {
  switch (field.type) {
    case "string":
    case "text":
      return typeof value === "string" && value.trim() !== ""
        ? undefined
        : "expected a non-empty string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value)
        ? undefined
        : "expected an integer";
    case "decimal":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        Math.abs(value) < 1e15 &&
        Math.round(value * 100) / 100 === value
        ? undefined
        : "expected a number with at most 2 decimals";
    case "boolean":
      return typeof value === "boolean" ? undefined : "expected a boolean";
    case "date":
      return typeof value === "string" &&
        DATE.test(value) &&
        !Number.isNaN(Date.parse(value))
        ? undefined
        : "expected a date as YYYY-MM-DD";
    case "datetime":
      return typeof value === "string" &&
        DATETIME.test(value) &&
        !Number.isNaN(Date.parse(value))
        ? undefined
        : "expected an ISO 8601 datetime";
    case "enum":
      return typeof value === "string" &&
        (field.enum_values ?? []).includes(value)
        ? undefined
        : `expected one of ${(field.enum_values ?? []).join(", ")}`;
    case "reference":
      return typeof value === "string" && referenceable?.has(value) === true
        ? undefined
        : `expected the id of a row of ${field.references ?? "the target entity"}`;
  }
};

export interface SeedRow {
  readonly entity_id: string;
  readonly id: string;
  readonly values: MockRow["values"];
  /** Reference fields set after insertion because the target row comes later. */
  readonly deferred: readonly string[];
}

/** Rows ordered so that every referenced row precedes the row referencing it. */
export const seedOrder = (model: ProcessModel, data: MockData): SeedRow[] => {
  const rows = new Map<string, { entity_id: string; row: MockRow }>();
  for (const entity of data.entities) {
    for (const row of entity.rows)
      rows.set(`${entity.entity_id}:${row.id}`, {
        entity_id: entity.entity_id,
        row,
      });
  }
  const references = (entityId: string): Field[] =>
    (
      model.entities.find((entity) => entity.id === entityId)?.fields ?? []
    ).filter(
      (field) => field.type === "reference" && field.references !== undefined,
    );

  const state = new Map<string, "visiting" | "done">();
  const ordered: SeedRow[] = [];
  const visit = (key: string): void => {
    const found = rows.get(key);
    if (found === undefined) return;
    state.set(key, "visiting");
    const deferred: string[] = [];
    for (const field of references(found.entity_id)) {
      const value = found.row.values[field.name];
      if (typeof value !== "string") continue;
      const target = `${field.references}:${value}`;
      if (state.get(target) === "visiting") deferred.push(field.name);
      else if (!state.has(target)) visit(target);
    }
    state.set(key, "done");
    ordered.push({
      entity_id: found.entity_id,
      id: found.row.id,
      values: found.row.values,
      deferred,
    });
  };
  for (const key of rows.keys()) if (!state.has(key)) visit(key);
  return ordered;
};

const rowIssues = (
  entity: Entity,
  row: MockRow,
  idsByEntity: ReadonlyMap<string, ReadonlySet<string>>,
  unique: Map<string, Set<string>>,
): string[] => {
  const issues: string[] = [];
  const where = `${entity.id}.${row.id}`;
  const fieldNames = new Set(entity.fields.map((field) => field.name));
  for (const key of Object.keys(row.values)) {
    if (!fieldNames.has(key)) issues.push(`${where}.${key}: unknown field`);
  }
  for (const field of entity.fields) {
    const value = row.values[field.name] ?? null;
    if (value === null) {
      if (field.required) issues.push(`${where}.${field.name}: required`);
      continue;
    }
    const problem = valueIssue(
      field,
      value,
      field.references === undefined
        ? undefined
        : idsByEntity.get(field.references),
    );
    if (problem !== undefined) {
      issues.push(`${where}.${field.name}: ${problem}`);
      continue;
    }
    if (field.unique === true) {
      const values = unique.get(field.name) ?? new Set<string>();
      if (values.has(String(value)))
        issues.push(`${where}.${field.name}: duplicate value ${String(value)}`);
      values.add(String(value));
      unique.set(field.name, values);
    }
  }
  return issues;
};

const cycleIssues = (model: ProcessModel, data: MockData): string[] =>
  seedOrder(model, data).flatMap((row) => {
    const entity = model.entities.find((item) => item.id === row.entity_id);
    return row.deferred
      .filter(
        (name) =>
          entity?.fields.find((field) => field.name === name)?.required ===
          true,
      )
      .map(
        (name) =>
          `${row.entity_id}.${row.id}.${name}: required references form a cycle`,
      );
  });

/** Problems that make mock data unusable for the process model. */
export const mockDataIssues = (
  model: ProcessModel,
  data: MockData,
): string[] => {
  const issues: string[] = [];
  const known = new Set(model.entities.map((entity) => entity.id));
  const seen = new Set<string>();
  const idsByEntity = new Map<string, Set<string>>();

  for (const entity of data.entities) {
    if (!known.has(entity.entity_id)) {
      issues.push(`${entity.entity_id}: not an entity of the process model`);
      continue;
    }
    if (seen.has(entity.entity_id)) {
      issues.push(`${entity.entity_id}: listed more than once`);
      continue;
    }
    seen.add(entity.entity_id);
    const ids = new Set<string>();
    for (const row of entity.rows) {
      if (ids.has(row.id))
        issues.push(`${entity.entity_id}.${row.id}: duplicate row id`);
      ids.add(row.id);
    }
    idsByEntity.set(entity.entity_id, ids);
  }

  for (const entity of model.entities) {
    if (!seen.has(entity.id)) {
      issues.push(`${entity.id}: no mock rows; every entity needs some`);
    }
  }

  for (const entity of model.entities) {
    const rows = data.entities.find(
      (item) => item.entity_id === entity.id,
    )?.rows;
    if (rows === undefined) continue;
    const unique = new Map<string, Set<string>>();
    for (const row of rows)
      issues.push(...rowIssues(entity, row, idsByEntity, unique));
  }

  return issues.length === 0 ? cycleIssues(model, data) : issues;
};
