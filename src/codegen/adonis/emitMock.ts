import type { MockData } from "../../contracts/mockData.js";
import type { Field, ProcessModel } from "../../contracts/processModel.js";
import { seedOrder, type SeedRow } from "../../process/mockData.js";
import { file, quote, type GeneratedFile } from "../files.js";
import { attribute, type GenerationPlan } from "./plan.js";

const literal = (field: Field, value: string | number | boolean): string => {
  switch (field.type) {
    case "decimal":
      return quote(Number(value).toFixed(2));
    case "date":
    case "datetime":
      return `DateTime.fromISO(${quote(String(value))})`;
    case "reference":
      return `ref(${quote(field.references ?? "")}, ${quote(String(value))})`;
    default:
      return JSON.stringify(value);
  }
};

const statements = (
  plan: GenerationPlan,
  rows: readonly SeedRow[],
): { created: string[]; patched: string[]; usesDates: boolean } => {
  const created: string[] = [];
  const patched: string[] = [];
  let usesDates = false;
  for (const row of rows) {
    const entity = plan.entities.find(
      (item) => item.entity.id === row.entity_id,
    );
    if (entity === undefined) continue;
    const assignments = (fields: readonly Field[]): string[] =>
      fields.flatMap((field) => {
        const value = row.values[field.name];
        if (value === null || value === undefined) return [];
        if (field.type === "date" || field.type === "datetime")
          usesDates = true;
        return [`${attribute(field)}: ${literal(field, value)}`];
      });
    const immediate = entity.entity.fields.filter(
      (field) => !row.deferred.includes(field.name),
    );
    const later = entity.entity.fields.filter((field) =>
      row.deferred.includes(field.name),
    );
    const key = quote(`${row.entity_id}:${row.id}`);
    created.push(
      `ids.set(${key}, (await ${entity.names.model}.create({ ${assignments(immediate).join(", ")} })).id)`,
    );
    if (later.length > 0) {
      patched.push(
        `await ${entity.names.model}.query().where('id', ref(${quote(row.entity_id)}, ${quote(row.id)})).update({ ${assignments(later).join(", ")} })`,
      );
    }
  }
  return { created, patched, usesDates };
};

/** Seeds the mock records of a prototype; safe to re-run. */
export const mockSeederFile = (
  model: ProcessModel,
  plan: GenerationPlan,
  data: MockData,
): GeneratedFile => {
  const rows = seedOrder(model, data);
  const { created, patched, usesDates } = statements(plan, rows);
  const usesRef = [...created, ...patched].some((line) =>
    line.includes("ref("),
  );
  const first = plan.entities[0];
  const models = plan.entities
    .filter((entity) => rows.some((row) => row.entity_id === entity.entity.id))
    .map(
      (entity) =>
        `import ${entity.names.model} from '#models/${entity.entity.id}'`,
    );
  return file(
    "database/seeders/mock_data_seeder.ts",
    `${models.join("\n")}
import { BaseSeeder } from '@adonisjs/lucid/seeders'
${usesDates ? "import { DateTime } from 'luxon'\n" : ""}
export default class extends BaseSeeder {
  async run() {
    ${first === undefined ? "" : `if (await ${first.names.model}.query().first()) return`}

    const ids = new Map<string, number>()
${
  usesRef
    ? `    const ref = (entity: string, key: string): number => {
      const id = ids.get(\`\${entity}:\${key}\`)
      if (id === undefined) throw new Error(\`Missing mock row \${entity}:\${key}\`)
      return id
    }
`
    : ""
}
${[...created, ...patched].map((line) => `    ${line}`).join("\n")}
  }
}`,
  );
};
