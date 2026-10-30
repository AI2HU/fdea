import type { GenerationInput } from "../../application/ports.js";
import type { MockData } from "../../contracts/mockData.js";
import type { Field } from "../../contracts/processModel.js";
import type { UiPageBacklogItem } from "../adonis/emitUi.js";
import {
  attribute,
  buildPlan,
  labelOf,
  relationName,
  type EntityPlan,
  type GenerationPlan,
} from "../adonis/plan.js";
import { file, quote, quoteList, type GeneratedFile } from "../files.js";
import { astroShellFiles, type NavLink } from "./shared.js";

export const contentKey = (field: Field): string =>
  field.type === "reference" ? relationName(field) : attribute(field);

const zodType = (field: Field, plan: GenerationPlan): string => {
  switch (field.type) {
    case "string":
    case "text":
      return "z.string()";
    case "integer":
      return "z.number().int()";
    case "decimal":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "date":
    case "datetime":
      return "z.coerce.date()";
    case "enum":
      return field.enum_values === undefined
        ? "z.string()"
        : `z.enum(${quoteList(field.enum_values)})`;
    case "reference": {
      const target = targetOf(field, plan);
      return target === undefined
        ? "z.string()"
        : `reference(${quote(target.names.plural)})`;
    }
  }
};

const contentConfigFile = (plan: GenerationPlan): GeneratedFile => {
  const usesReference = plan.entities.some((entity) =>
    entity.entity.fields.some((field) => field.type === "reference"),
  );
  const collections = plan.entities
    .map((entity) => {
      const fields = entity.entity.fields
        .map(
          (field) =>
            `    ${contentKey(field)}: ${zodType(field, plan)}${field.required ? "" : ".optional()"},`,
        )
        .join("\n");
      return `const ${entity.names.pluralVar} = defineCollection({
  loader: file(${quote(dataPath(entity))}),
  schema: z.object({
${fields}
  }),
})`;
    })
    .join("\n\n");
  const registry = plan.entities
    .map((entity) =>
      entity.names.plural === entity.names.pluralVar
        ? `  ${entity.names.pluralVar},`
        : `  ${entity.names.plural}: ${entity.names.pluralVar},`,
    )
    .join("\n");
  return file(
    "src/content.config.ts",
    `import { defineCollection${usesReference ? ", reference" : ""} } from 'astro:content'
import { file } from 'astro/loaders'
import { z } from 'astro/zod'

${collections}

export const collections = {
${registry}
}
`,
  );
};

const dataPath = (entity: EntityPlan): string =>
  `src/data/${entity.names.plural}.json`;

const recordsJson = (
  entity: EntityPlan,
  data: MockData | undefined,
): string => {
  const rows =
    data?.entities.find((item) => item.entity_id === entity.entity.id)?.rows ??
    [];
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      ...Object.fromEntries(
        entity.entity.fields.flatMap((field) => {
          const value = row.values[field.name];
          return value === null || value === undefined
            ? []
            : [[contentKey(field), value]];
        }),
      ),
    })),
    null,
    2,
  );
};

const pagePath = (entity: EntityPlan): string => entity.names.routePath;

export const staticBacklog = (plan: GenerationPlan): UiPageBacklogItem[] =>
  plan.entities.flatMap((entity) => {
    const { names } = entity;
    const items: UiPageBacklogItem[] = [];
    if (entity.crud.has("list")) {
      items.push({
        page: `${pagePath(entity)}/index`,
        route: `/${pagePath(entity)}/`,
        purpose: `List ${names.pluralLabel}`,
        props: [`${names.pluralVar}: CollectionEntry<'${names.plural}'>[]`],
        permission: undefined,
      });
    }
    if (entity.crud.has("view")) {
      items.push({
        page: `${pagePath(entity)}/[id]`,
        route: `/${pagePath(entity)}/[id]/`,
        purpose: `View ${names.label}`,
        props: [`${names.singularVar}: CollectionEntry<'${names.plural}'>`],
        permission: undefined,
      });
    }
    return items;
  });

/** Writes the process performs that a site without a server cannot persist. */
export const unsupportedOperations = (plan: GenerationPlan): string[] =>
  plan.entities.flatMap((entity) => {
    const { names } = entity;
    const kinds = (["create", "update", "delete"] as const)
      .filter((kind) => entity.crud.has(kind))
      .map((kind) => `${kind} ${names.label}`);
    const transitions = entity.transitions.map(
      (transition) => `${transition.label} (${names.label})`,
    );
    return [...kinds, ...transitions];
  });

const navLinks = (plan: GenerationPlan): NavLink[] =>
  plan.entities
    .filter((entity) => entity.crud.has("list"))
    .map((entity) => ({
      label: entity.names.pluralLabel,
      href: `/${pagePath(entity)}/`,
    }));

const homePage = (
  title: string,
  summary: string,
  nav: readonly NavLink[],
): string => `---
import Site from '~/layouts/site.astro'
import PageHeader from '~/components/page_header.astro'

const title = ${quote(title)}
const summary = ${quote(summary)}
const areas = ${JSON.stringify(nav, null, 2)}
---

<Site>
  <PageHeader title={title} description={summary} />
  <p class="mb-6 text-sm text-muted-foreground">
    Process pages are agent-built. Implement the pages listed in
    <code class="rounded bg-muted px-1 py-0.5">UI.md</code>, then replace this home page freely.
  </p>
  <ul class="grid gap-2">
    {
      areas.map((area) => (
        <li>
          <a href={area.href} class="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {area.label}
          </a>
        </li>
      ))
    }
  </ul>
</Site>
`;

const targetOf = (
  field: Field,
  plan: GenerationPlan,
): EntityPlan | undefined =>
  field.type === "reference"
    ? plan.entities.find((entity) => entity.entity.id === field.references)
    : undefined;

const fieldLine = (field: Field, plan: GenerationPlan): string => {
  const reference = targetOf(field, plan);
  const target =
    reference === undefined
      ? ""
      : ` → \`${reference.names.plural}\`, resolve with \`getEntry\``;
  const values =
    field.type === "enum" && field.enum_values !== undefined
      ? `: ${field.enum_values.map((value) => `\`${value}\``).join(", ")}`
      : "";
  return `- \`${contentKey(field)}\` (${field.type}${field.required ? ", required" : ""}${target}${values}): ${labelOf(field)}`;
};

const collectionSection = (
  entity: EntityPlan,
  plan: GenerationPlan,
): string => `### ${entity.names.label} (\`${entity.names.plural}\`)

- Entries: \`${dataPath(entity)}\` (array of objects, each with a unique string \`id\`)
${entity.entity.fields.map((field) => fieldLine(field, plan)).join("\n")}
`;

const uiContractFile = (
  title: string,
  plan: GenerationPlan,
  mock: boolean,
): GeneratedFile => {
  const backlog = staticBacklog(plan);
  const pages =
    backlog.length === 0
      ? "_No process pages required._"
      : backlog
          .map(
            (item) =>
              `- \`src/pages/${item.page}.astro\` (\`${item.route}\`) — ${item.purpose}. Data: ${item.props.map((prop) => `\`${prop}\``).join(", ")}`,
          )
          .join("\n");
  const unsupported = unsupportedOperations(plan);
  const writes =
    unsupported.length === 0
      ? ""
      : `
## Not available on the static stack

The process model includes these write operations. A static site has no server to persist them, so do not fake them. If they are required, regenerate with the fullstack stack into a new empty directory.

${unsupported.map((operation) => `- ${operation}`).join("\n")}
`;

  return file(
    "UI.md",
    `# UI contract — ${title}

Codegen built the **static foundation** (Astro 7, Vue islands, Tailwind design tokens, typed content collections, layout, and shadcn-style Vue primitives). **Process UI is yours to invent.**

There is no server, database, auth, RBAC or MCP. Every page is prerendered at build time from the content collections in \`src/content.config.ts\`.

## Rules

1. Create every backlog page under \`src/pages/\`. Load data with \`getCollection\` / \`getEntry\` from \`astro:content\`; dynamic pages export \`getStaticPaths\`.
2. Write layout and content in \`.astro\`; use Vue components with a \`client:*\` directive only for interactive islands.
3. ${mock ? "The JSON files under `src/data/` hold mock records only. They are fictional; present them as such." : "Author records in the JSON files under `src/data/`. Do not invent records the documents do not provide."}
4. Keep identity values (entry ids, collection names) separate from labels.
5. After UI work: \`npm run typecheck\` and \`npm run build\` in the site directory.
6. Do **not** call FDEA \`generate_application\` again to change UI — edit this site in place. Regenerate only into a new empty directory when the process model changes.

## Backlog

${pages}
${writes}
## Shared foundation

- Design tokens: \`src/styles/global.css\`
- Layout you may replace: \`src/layouts/site.astro\`; header: \`src/components/page_header.astro\`
- Optional Vue primitives: \`src/components/ui/*\`, \`src/components/form_field.vue\`
- Helpers: \`cn\` from \`~/lib/utils\`, formatters from \`~/lib/format\`
- Types: \`import type { CollectionEntry } from 'astro:content'\`

## Collections

${plan.entities.map((entity) => collectionSection(entity, plan)).join("\n")}`,
  );
};

const readme = (input: GenerationInput): GeneratedFile => {
  const { model } = input;
  const steps = model.steps
    .map((step) => {
      const actors = step.actor_ids
        .map((id) => model.actors.find((actor) => actor.id === id)?.name ?? id)
        .join(", ");
      return `- **${step.name}** (${actors}): ${step.description}`;
    })
    .join("\n");
  const unknowns =
    model.unknowns.length === 0
      ? ""
      : `
## Open questions

These were not answered by the documentation and are not implemented:

${model.unknowns.map((unknown) => `- ${unknown.question}`).join("\n")}
`;
  return file(
    "README.md",
    `# ${model.title}

${model.summary}

Generated by Forward Deploy Engineering Anything as a **static website** on Astro 7 (Vue islands, Tailwind CSS, shadcn-style components, typed content collections).

Codegen produced the **foundation** (content schema, design tokens, layout). **Process UI is built by the agent** — see \`UI.md\` for the page backlog.

## Process

${steps}
${unknowns}
## Content

Records live in \`src/data/*.json\` and are validated by \`src/content.config.ts\` at build time.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## Deploy

\`\`\`bash
npm run build
\`\`\`

Upload \`dist/\` to any static host.
`,
  );
};

export const emitSite = (input: GenerationInput): GeneratedFile[] => {
  const plan = buildPlan(input.model);
  const { design, model } = input;
  const nav = navLinks(plan);
  return [
    ...astroShellFiles(model.title, design.tokens, nav),
    contentConfigFile(plan),
    ...plan.entities.map((entity) =>
      file(dataPath(entity), recordsJson(entity, input.mockData)),
    ),
    file("src/pages/index.astro", homePage(model.title, model.summary, nav)),
    uiContractFile(model.title, plan, input.mockData !== undefined),
    readme(input),
  ];
};
