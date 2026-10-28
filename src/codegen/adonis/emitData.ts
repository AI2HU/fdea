import type { Field } from "../../contracts/processModel.js";
import { camelCase } from "../../process/naming.js";
import { file, quote, quoteList, type GeneratedFile } from "../files.js";
import {
  attribute,
  createFields,
  labelOf,
  relationName,
  updateFields,
  type EntityPlan,
  type GenerationPlan,
} from "./plan.js";

const columnDefinition = (field: Field): string => {
  const column = field.type === "reference" ? `${field.name}_id` : field.name;
  const base = ((): string => {
    switch (field.type) {
      case "string":
        return `table.string(${quote(column)}, 255)`;
      case "text":
        return `table.text(${quote(column)})`;
      case "integer":
        return `table.integer(${quote(column)})`;
      case "decimal":
        return `table.decimal(${quote(column)}, 18, 2)`;
      case "boolean":
        return `table.boolean(${quote(column)})`;
      case "date":
        return `table.date(${quote(column)})`;
      case "datetime":
        return `table.timestamp(${quote(column)})`;
      case "enum":
        return `table.string(${quote(column)}, 64)`;
      case "reference":
        return `table.integer(${quote(column)}).unsigned()`;
    }
  })();
  const nullability = field.required ? ".notNullable()" : ".nullable()";
  return `${base}${nullability}${field.unique === true ? ".unique()" : ""}`;
};

export const migrationFile = (
  plan: EntityPlan,
  timestamp: number,
): GeneratedFile =>
  file(
    `database/migrations/${timestamp}_create_${plan.names.table}_table.ts`,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = ${quote(plan.names.table)}

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
${plan.entity.fields.map((field) => `      ${columnDefinition(field)}`).join("\n")}
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}`,
  );

export const foreignKeyMigrationFile = (
  plans: readonly EntityPlan[],
  timestamp: number,
): GeneratedFile | undefined => {
  const withReferences = plans.filter((plan) => plan.references.length > 0);
  if (withReferences.length === 0) return undefined;
  const up = withReferences
    .map(
      (
        plan,
      ) => `    this.schema.alterTable(${quote(plan.names.table)}, (table) => {
${plan.references
  .map(
    ({ field, target }) =>
      `      table.foreign(${quote(`${field.name}_id`)}).references(${quote(`${target.names.table}.id`)}).onDelete(${quote(field.required ? "RESTRICT" : "SET NULL")})`,
  )
  .join("\n")}
    })`,
    )
    .join("\n\n");
  const down = withReferences
    .map(
      (
        plan,
      ) => `    this.schema.alterTable(${quote(plan.names.table)}, (table) => {
${plan.references.map(({ field }) => `      table.dropForeign([${quote(`${field.name}_id`)}])`).join("\n")}
    })`,
    )
    .join("\n\n");
  return file(
    `database/migrations/${timestamp}_add_foreign_keys_to_process_tables.ts`,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
${up}
  }

  async down() {
${down}
  }
}`,
  );
};

const SCHEMA_RULES: Partial<Record<Field["type"], (field: Field) => string>> = {
  // Always set columnName to the migration column so Lucid snake_case of
  // camelCase attributes (e.g. surfaceM2 → surface_m_2) still hits surface_m2.
  decimal: (field) => `    ${quote(field.name)}: {
      tsType: 'string',
      decorators: [
        {
          name: '@column',
          args: {
            columnName: ${quote(field.name)},
            consume: (value: unknown) => (value === null || value === undefined ? value : String(value)),
          },
        },
      ],
    },`,
  boolean: (field) => `    ${quote(field.name)}: {
      tsType: 'boolean',
      decorators: [
        {
          name: '@column',
          args: {
            columnName: ${quote(field.name)},
            consume: (value: unknown) => (value === null || value === undefined ? value : Boolean(value)),
          },
        },
      ],
    },`,
};

export const schemaRulesFile = (plan: GenerationPlan): GeneratedFile => {
  const tables = plan.entities
    .map((entity) => ({
      entity,
      rules: entity.entity.fields.flatMap((field) => {
        const rule = SCHEMA_RULES[field.type];
        return rule === undefined ? [] : [rule(field)];
      }),
    }))
    .filter(({ rules }) => rules.length > 0);
  const body = tables
    .map(
      ({ entity, rules }) => `  ${quote(entity.names.table)}: {
    columns: {
${rules.join("\n")}
    },
  },`,
    )
    .join("\n");
  return file(
    "database/schema_rules.ts",
    `import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/**
 * Decimal and boolean columns are normalized when read so that the model types
 * hold on every database: SQLite returns numbers for both, PostgreSQL returns
 * strings for decimals.
 */
export default {
  tables: {
${body}
  },
} satisfies SchemaRules`,
  );
};

export const modelFile = (plan: EntityPlan): GeneratedFile => {
  const { names } = plan;
  const hasRelations = plan.references.length > 0;
  const imports = [
    `import { ${names.model}Schema } from '#database/schema'`,
    ...(hasRelations
      ? [
          `import { belongsTo } from '@adonisjs/lucid/orm'`,
          `import type { BelongsTo } from '@adonisjs/lucid/types/relations'`,
        ]
      : []),
    ...[
      ...new Set(plan.references.map(({ target }) => target.names.model)),
    ].map((model) => {
      const target = plan.references.find(
        (ref) => ref.target.names.model === model,
      )?.target;
      return `import ${model} from '#models/${target?.entity.id}'`;
    }),
  ];
  const relations = plan.references
    .map(
      ({ field, target }) => `  @belongsTo(() => ${target.names.model})
  declare ${relationName(field)}: BelongsTo<typeof ${target.names.model}>`,
    )
    .join("\n\n");
  return file(
    `app/models/${plan.entity.id}.ts`,
    `${imports.join("\n")}

export default class ${names.model} extends ${names.model}Schema {${relations === "" ? "" : `\n${relations}\n`}}`,
  );
};

const FIELD_RULES: Record<Field["type"], (field: Field) => string> = {
  string: () => "vine.string().trim().maxLength(255)",
  text: () => "vine.string().trim().maxLength(20000)",
  integer: () => "vine.number().withoutDecimals()",
  decimal: () => "vine.string().trim().regex(/^-?\\d{1,16}(\\.\\d{1,2})?$/)",
  boolean: () => "vine.boolean()",
  date: () => "vine.string().trim().regex(/^\\d{4}-\\d{2}-\\d{2}$/)",
  datetime: () =>
    "vine.string().trim().regex(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2})?/)",
  enum: (field) => `vine.enum(${quoteList(field.enum_values ?? [])} as const)`,
  reference: () => "vine.number().withoutDecimals()",
};

const validatorRule = (
  plan: EntityPlan,
  field: Field,
  mode: "create" | "update",
): string => {
  let rule = FIELD_RULES[field.type](field);
  if (field.type === "reference") {
    const target = plan.references.find(
      (ref) => ref.field.name === field.name,
    )?.target;
    rule += `.exists({ table: ${quote(target?.names.table ?? "")}, column: 'id' })`;
  }
  if (field.unique === true) {
    const column = field.name;
    rule +=
      mode === "create"
        ? `.unique({ table: ${quote(plan.names.table)}, column: ${quote(column)} })`
        : `.unique(async (db, value, field) => {
        const row = await db
          .from(${quote(plan.names.table)})
          .whereNot('id', field.meta.id)
          .where(${quote(column)}, value)
          .first()
        return !row
      })`;
  }
  return field.required ? rule : `${rule}.nullable()`;
};

const attributeKey = (field: Field): string => attribute(field);

export const validatorFile = (plan: EntityPlan): GeneratedFile => {
  const { names } = plan;
  const hasUnique = updateFields(plan).some((field) => field.unique === true);
  const schema = (mode: "create" | "update"): string =>
    (mode === "create" ? createFields(plan) : updateFields(plan))
      .map(
        (field) =>
          `  ${attributeKey(field)}: ${validatorRule(plan, field, mode)},`,
      )
      .join("\n");
  const create = `export const create${names.model}Validator = vine.create({
${schema("create")}
})`;
  const update = hasUnique
    ? `export const update${names.model}Validator = vine
  .withMetaData<{ id: number }>()
  .create({
${schema("update")}
  })`
    : `export const update${names.model}Validator = vine.create({
${schema("update")}
})`;
  return file(
    `app/validators/${plan.entity.id}.ts`,
    `import vine from '@vinejs/vine'

${plan.crud.has("create") ? create : ""}

${plan.crud.has("update") ? update : ""}`,
  );
};

export const transformerFile = (plan: EntityPlan): GeneratedFile => {
  const { names } = plan;
  const picked = [
    "id",
    ...plan.entity.fields.map(attributeKey),
    "createdAt",
    "updatedAt",
  ];
  const labels = plan.references
    .map(({ field, target }) => {
      const display =
        target.displayField === "id" ? "id" : camelCase(target.displayField);
      return `      ${relationName(field)}Label: this.resource.${relationName(field)}?.${display} ?? null,`;
    })
    .join("\n");
  return file(
    `app/transformers/${plan.entity.id}_transformer.ts`,
    `import type ${names.model} from '#models/${plan.entity.id}'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ${names.transformerClass} extends BaseTransformer<${names.model}> {
  toObject() {
    return {
      ...this.pick(this.resource, ${quoteList(picked)}),
${labels}
    }
  }
}`,
  );
};

export const referenceOptionsName = (field: Field): string =>
  `${relationName(field)}Options`;

export const validatorFieldNames = (plans: readonly EntityPlan[]): string => {
  const names = new Map<string, string>();
  for (const plan of plans) {
    for (const field of plan.entity.fields) {
      names.set(attribute(field), labelOf(field).toLowerCase());
    }
  }
  const entries = [...names]
    .map(([key, label]) => `  ${key}: ${quote(label)},`)
    .join("\n");
  return `
import vine, { SimpleMessagesProvider } from '@vinejs/vine'

vine.messagesProvider = new SimpleMessagesProvider(
  {},
  {
${entries}
  }
)
`;
};
