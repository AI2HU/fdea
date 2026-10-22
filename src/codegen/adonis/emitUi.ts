import { referenceOptionsName } from "./emitData.js";
import { file, type GeneratedFile } from "./files.js";
import {
  attribute,
  createFields,
  crudPermission,
  labelOf,
  updateFields,
  type EntityPlan,
  type GenerationPlan,
} from "./plan.js";

export interface UiPageBacklogItem {
  readonly page: string;
  readonly route: string;
  readonly purpose: string;
  readonly props: readonly string[];
  readonly permission: string | undefined;
}

const optionProps = (plan: EntityPlan): string[] => {
  const seen = new Set<string>();
  const props: string[] = [];
  for (const { field } of plan.references) {
    const name = referenceOptionsName(field);
    if (seen.has(name)) continue;
    seen.add(name);
    props.push(`${name}: { id: number | string; label: string }[]`);
  }
  return props;
};

const fieldLines = (fields: ReturnType<typeof createFields>): string =>
  fields.length === 0
    ? "_none (server sets managed values)_"
    : fields
        .map(
          (field) =>
            `- \`${attribute(field)}\` (${field.type}${field.required ? ", required" : ""}): ${labelOf(field)}`,
        )
        .join("\n");

export const uiBacklog = (plan: GenerationPlan): UiPageBacklogItem[] => {
  const items: UiPageBacklogItem[] = [];
  for (const entity of plan.entities) {
    const { names } = entity;
    if (entity.crud.has("list")) {
      items.push({
        page: `${names.pageDir}/index`,
        route: `${names.routeName}.index`,
        purpose: `List ${names.pluralLabel}`,
        props: [`${names.pluralVar}: Data.${names.model}[]`],
        permission: crudPermission(entity.entity.id, "list"),
      });
    }
    if (entity.crud.has("create")) {
      items.push({
        page: `${names.pageDir}/create`,
        route: `${names.routeName}.create`,
        purpose: `Create ${names.label}`,
        props: optionProps(entity),
        permission: crudPermission(entity.entity.id, "create"),
      });
    }
    if (entity.crud.has("view")) {
      items.push({
        page: `${names.pageDir}/show`,
        route: `${names.routeName}.show`,
        purpose: `View ${names.label}`,
        props: [`${names.singularVar}: Data.${names.model}`],
        permission: crudPermission(entity.entity.id, "view"),
      });
    }
    if (entity.crud.has("update")) {
      items.push({
        page: `${names.pageDir}/edit`,
        route: `${names.routeName}.edit`,
        purpose: `Edit ${names.label}`,
        props: [
          `${names.singularVar}: Data.${names.model}`,
          ...optionProps(entity),
        ],
        permission: crudPermission(entity.entity.id, "update"),
      });
    }
  }
  return items;
};

const entitySection = (plan: EntityPlan): string => {
  const { names } = plan;
  const pages = uiBacklog({
    entities: [plan],
    permissions: [],
    roles: [],
  });
  const pageBlock =
    pages.length === 0
      ? "_No Inertia pages (mutations only via MCP or transitions on other entities)._"
      : pages
          .map(
            (item) => `### \`${item.page}.tsx\`

- Route name: \`${item.route}\`
- Purpose: ${item.purpose}
- Permission: ${item.permission === undefined ? "_none_" : `\`${item.permission}\``}
- Props: ${item.props.length === 0 ? "_none_" : item.props.map((prop) => `\`${prop}\``).join(", ")}
`,
          )
          .join("\n");

  const mutations: string[] = [];
  if (plan.crud.has("create")) {
    mutations.push(
      `- Create: \`Form\` → \`${names.routeName}.store\` (POST). Fields:\n${fieldLines(createFields(plan))}`,
    );
  }
  if (plan.crud.has("update")) {
    mutations.push(
      `- Update: \`Form\` → \`${names.routeName}.update\` with \`{ id }\` (PUT). Fields:\n${fieldLines(updateFields(plan))}`,
    );
  }
  if (plan.crud.has("delete")) {
    mutations.push(
      `- Delete: \`Form\` → \`${names.routeName}.destroy\` with \`{ id }\` (DELETE). Permission: \`${crudPermission(plan.entity.id, "delete")}\``,
    );
  }
  for (const transition of plan.transitions) {
    mutations.push(
      `- ${transition.label}: \`Form\` → \`${transition.routeName}\` with \`{ id }\` (POST). Permission: \`${transition.permission}\`${
        transition.from === undefined
          ? ""
          : `. Allowed when \`${transition.field}\` is one of ${transition.from.map((value) => `\`${value}\``).join(", ")}`
      }. Sets \`${transition.field}\` → \`${transition.to}\`.`,
    );
  }

  return `## ${names.label} (\`${plan.entity.id}\`)

${pageBlock}
### Mutations

${mutations.length === 0 ? "_none_" : mutations.join("\n")}
`;
};

export const uiContractFile = (
  title: string,
  plan: GenerationPlan,
  rbac: boolean,
): GeneratedFile => {
  const backlog = uiBacklog(plan);
  const pages =
    backlog.length === 0
      ? "_No process pages required._"
      : backlog
          .map(
            (item) =>
              `- \`inertia/pages/${item.page}.vue\` (\`${item.route}\`)`,
          )
          .join("\n");

  return file(
    "UI.md",
    `# UI contract — ${title}

Codegen built the **foundation** (database, models, validators, controllers, routes, auth,${rbac ? " RBAC," : ""} MCP, design tokens, and shadcn-style primitives). **Process UI is yours to invent.**

Create every page listed below under \`inertia/pages/\`. Controllers already call \`inertia.render\` with these names and props. You may redesign layouts, navigation, dashboard, marketing surfaces, motion, and components however you want. Prefer the product and design sources over generic admin CRUD.

## Rules

1. Implement every backlog page so the matching route works end-to-end.
2. Wire mutations with Adonis Inertia \`Form\` (or \`router\`) to the route names below — do not invent parallel APIs.
3. ${rbac ? "Hide or disable actions the user cannot perform (`useCan` / `permissions` shared props)." : "RBAC is off; every signed-in user may use every action."}
4. Keep identity values and labels separate; use transformer props as provided.
5. After UI work: \`npm run typecheck\` and \`node ace build\` in the app directory.
6. Do **not** call FDEA \`generate_application\` again to change UI — edit this app in place. Regenerate only into a new empty directory when the process model or schema changes.

## Backlog

${pages}

## Shared foundation

- Design tokens: \`inertia/css/app.css\`
- Optional primitives: \`inertia/components/ui/*\`, \`form_field\`, \`page_header\`, \`flash_toasts\`
- Layouts you may replace: \`inertia/layouts/app.vue\`, \`inertia/layouts/auth.vue\`
- Auth page (keep working): \`inertia/pages/auth/login.vue\`
- Client helpers: \`urlFor\` / \`Form\` from \`~/client\` and \`@adonisjs/inertia/vue\`
- Types: \`import type { Data } from '@generated/data'\`

${plan.entities.map(entitySection).join("\n")}
`,
  );
};
