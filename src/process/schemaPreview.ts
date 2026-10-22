import type { Field, ProcessModel } from "../contracts/processModel.js";
import { entityNames } from "./naming.js";

export type SqlType =
  | "integer"
  | "string(255)"
  | "string(64)"
  | "text"
  | "decimal(18,2)"
  | "boolean"
  | "date"
  | "timestamp";

export interface SchemaColumn {
  readonly name: string;
  readonly sql_type: SqlType;
  readonly nullable: boolean;
  readonly unique: boolean;
  readonly primary_key?: boolean;
  readonly references?: { readonly table: string; readonly column: string };
  readonly enum_values?: readonly string[];
  readonly label?: string;
}

export interface SchemaTable {
  readonly name: string;
  readonly kind: "auth" | "rbac" | "process";
  readonly entity_id?: string;
  readonly label?: string;
  readonly columns: readonly SchemaColumn[];
}

export interface DatabaseSchemaPreview {
  readonly tables: readonly SchemaTable[];
  readonly mermaid: string;
  readonly summary: string;
  readonly notes: readonly string[];
}

const sqlTypeOf = (field: Field): SqlType => {
  switch (field.type) {
    case "string":
      return "string(255)";
    case "text":
      return "text";
    case "integer":
    case "reference":
      return "integer";
    case "decimal":
      return "decimal(18,2)";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "timestamp";
    case "enum":
      return "string(64)";
  }
};

const idColumn = (): SchemaColumn => ({
  name: "id",
  sql_type: "integer",
  nullable: false,
  unique: true,
  primary_key: true,
});

const timestamps = (): SchemaColumn[] => [
  { name: "created_at", sql_type: "timestamp", nullable: false, unique: false },
  { name: "updated_at", sql_type: "timestamp", nullable: true, unique: false },
];

const authTables = (rbac: boolean | undefined): SchemaTable[] => {
  const users: SchemaTable = {
    name: "users",
    kind: "auth",
    label: "User account",
    columns: [
      idColumn(),
      {
        name: "full_name",
        sql_type: "string(255)",
        nullable: true,
        unique: false,
      },
      {
        name: "email",
        sql_type: "string(255)",
        nullable: false,
        unique: true,
      },
      {
        name: "password",
        sql_type: "string(255)",
        nullable: false,
        unique: false,
      },
      ...(rbac === true
        ? [
            {
              name: "role_id",
              sql_type: "integer" as const,
              nullable: true,
              unique: false,
              references: { table: "roles", column: "id" },
            },
          ]
        : []),
      ...timestamps(),
    ],
  };
  if (rbac !== true) return [users];
  return [
    {
      name: "roles",
      kind: "rbac",
      label: "Access role",
      columns: [
        idColumn(),
        { name: "slug", sql_type: "string(64)", nullable: false, unique: true },
        {
          name: "name",
          sql_type: "string(255)",
          nullable: false,
          unique: false,
        },
        ...timestamps(),
      ],
    },
    {
      name: "permissions",
      kind: "rbac",
      label: "Permission",
      columns: [
        idColumn(),
        {
          name: "slug",
          sql_type: "string(255)",
          nullable: false,
          unique: true,
        },
        ...timestamps(),
      ],
    },
    {
      name: "permission_role",
      kind: "rbac",
      label: "Role permission link",
      columns: [
        idColumn(),
        {
          name: "permission_id",
          sql_type: "integer",
          nullable: false,
          unique: false,
          references: { table: "permissions", column: "id" },
        },
        {
          name: "role_id",
          sql_type: "integer",
          nullable: false,
          unique: false,
          references: { table: "roles", column: "id" },
        },
      ],
    },
    users,
  ];
};

const processTable = (
  model: ProcessModel,
  entityId: string,
): SchemaTable | undefined => {
  const entity = model.entities.find((candidate) => candidate.id === entityId);
  if (entity === undefined) return undefined;
  const names = entityNames(entity);
  const columns: SchemaColumn[] = [
    idColumn(),
    ...entity.fields.map((field): SchemaColumn => {
      if (field.type === "reference") {
        const target = model.entities.find(
          (candidate) => candidate.id === field.references,
        );
        return {
          name: `${field.name}_id`,
          sql_type: "integer",
          nullable: !field.required,
          unique: field.unique === true,
          ...(target === undefined
            ? {}
            : {
                references: {
                  table: entityNames(target).table,
                  column: "id",
                },
              }),
          label: field.label ?? field.name,
        };
      }
      return {
        name: field.name,
        sql_type: sqlTypeOf(field),
        nullable: !field.required,
        unique: field.unique === true,
        ...(field.type === "enum" && field.enum_values !== undefined
          ? { enum_values: field.enum_values }
          : {}),
        label: field.label ?? field.name,
      };
    }),
    ...timestamps(),
  ];
  return {
    name: names.table,
    kind: "process",
    entity_id: entity.id,
    label: entity.name,
    columns,
  };
};

const formatColumn = (column: SchemaColumn): string => {
  const parts = [
    column.name,
    column.sql_type,
    column.primary_key === true
      ? "PK"
      : column.nullable
        ? "nullable"
        : "not null",
  ];
  if (column.unique && column.primary_key !== true) parts.push("unique");
  if (column.references !== undefined) {
    parts.push(`→ ${column.references.table}.${column.references.column}`);
  }
  if (column.enum_values !== undefined && column.enum_values.length > 0) {
    parts.push(`enum: ${column.enum_values.join(" | ")}`);
  }
  return `- ${parts.join(", ")}`;
};

const mermaidType = (sqlType: SqlType): string => {
  switch (sqlType) {
    case "integer":
      return "int";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "timestamp":
      return "datetime";
    case "decimal(18,2)":
      return "float";
    case "text":
    case "string(255)":
    case "string(64)":
      return "string";
  }
};

const mermaidEntityId = (tableName: string): string =>
  tableName.replace(/[^a-zA-Z0-9_]/g, "_");

const mermaidAttrLine = (column: SchemaColumn): string => {
  const keys: string[] = [];
  if (column.primary_key === true) keys.push("PK");
  if (column.references !== undefined) keys.push("FK");
  if (column.unique && column.primary_key !== true) keys.push("UK");
  const keyPart = keys.length === 0 ? "" : ` ${keys.join(",")}`;
  return `    ${mermaidType(column.sql_type)} ${column.name}${keyPart}`;
};

export const formatSchemaMermaid = (tables: readonly SchemaTable[]): string => {
  const entities = tables.map((table) => {
    const id = mermaidEntityId(table.name);
    const attrs = table.columns.map(mermaidAttrLine).join("\n");
    return `  ${id} {\n${attrs}\n  }`;
  });
  const relationships: string[] = [];
  const seen = new Set<string>();
  for (const table of tables) {
    const from = mermaidEntityId(table.name);
    for (const column of table.columns) {
      if (column.references === undefined) continue;
      const to = mermaidEntityId(column.references.table);
      const key = `${to}|${from}|${column.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const edge = column.nullable ? "o|--o{" : "||--o{";
      relationships.push(`  ${to} ${edge} ${from} : "${column.name}"`);
    }
  }
  return ["erDiagram", ...relationships, ...entities].join("\n");
};

export const formatSchemaSummary = (
  preview: Omit<DatabaseSchemaPreview, "summary">,
): string => {
  const blocks = preview.tables.map((table) => {
    const title =
      table.label === undefined ? table.name : `${table.name} (${table.label})`;
    return `### ${title}\n${table.columns.map(formatColumn).join("\n")}`;
  });
  const notes =
    preview.notes.length === 0
      ? ""
      : `\n\n### Notes\n${preview.notes.map((note) => `- ${note}`).join("\n")}`;
  return `# Database schema

\`\`\`mermaid
${preview.mermaid}
\`\`\`

${blocks.join("\n\n")}${notes}`;
};

export const buildDatabaseSchemaPreview = (
  model: ProcessModel,
  rbac: boolean | undefined,
): DatabaseSchemaPreview => {
  const tables = [
    ...authTables(rbac),
    ...model.entities.flatMap((entity) => {
      const table = processTable(model, entity.id);
      return table === undefined ? [] : [table];
    }),
  ];
  const notes: string[] = [
    "Every process table also receives `id`, `created_at` and `updated_at`.",
    "Reference fields become `<name>_id` foreign keys.",
    "Enum fields are stored as short strings with the listed allowed values.",
  ];
  if (rbac === undefined) {
    notes.push(
      "RBAC is not decided yet. If RBAC is enabled, `roles`, `permissions`, `permission_role` and `users.role_id` will be added.",
    );
  } else if (rbac === false) {
    notes.push("RBAC is off: no role or permission tables will be created.");
  } else {
    notes.push(
      "RBAC is on: each process actor becomes a row in `roles`, and each operation a permission slug.",
    );
  }
  const mermaid = formatSchemaMermaid(tables);
  const withoutSummary = { tables, mermaid, notes };
  return { ...withoutSummary, summary: formatSchemaSummary(withoutSummary) };
};
