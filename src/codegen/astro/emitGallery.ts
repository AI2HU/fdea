import type { GenerationInput } from "../../application/ports.js";
import {
  approachHypotheses,
  fixturesSource,
  prototypeVariants,
} from "../adonis/emitPrototype.js";
import { uiBacklog, type UiPageBacklogItem } from "../adonis/emitUi.js";
import { buildPlan, type GenerationPlan } from "../adonis/plan.js";
import { file, quote, type GeneratedFile } from "../files.js";
import { astroShellFiles } from "./shared.js";

const screenPath = (page: string): string =>
  page.endsWith("/index") ? page.slice(0, -"/index".length) : page;

export const galleryBacklog = (plan: GenerationPlan): UiPageBacklogItem[] =>
  uiBacklog(plan).map((item) => ({
    page: item.page,
    route: `/approaches/:approach/${screenPath(item.page)}/`,
    purpose: item.purpose,
    props: ["fixtures (import from ~/data/fixtures)"],
    permission: undefined,
  }));

const indexPage = (
  title: string,
  hypotheses: Record<string, string>,
): string => `---
import Site from '~/layouts/site.astro'
import PageHeader from '~/components/page_header.astro'

const title = ${quote(title)}
const hypotheses: Record<string, string> = ${JSON.stringify(hypotheses, null, 2)}
---

<Site title="Approaches">
  <div class="mx-auto max-w-3xl">
    <PageHeader
      title={title}
      description="Pick an approach to evaluate. Each folder is a disposable prototype with shared mock fixtures."
    />
    <ul class="grid gap-4">
      {
        Object.entries(hypotheses).map(([id, hypothesis]) => (
          <li>
            <a
              href={\`/approaches/\${id}/\`}
              class="block rounded-xl border border-border px-5 py-4 transition-colors hover:bg-accent/40"
            >
              <div class="text-lg font-semibold tracking-tight">Approach {id.toUpperCase()}</div>
              <p class="mt-1 text-sm text-muted-foreground">{hypothesis}</p>
            </a>
          </li>
        ))
      }
    </ul>
  </div>
</Site>
`;

const approachHome = (
  approach: string,
  hypothesis: string,
  screens: ReadonlyArray<{ purpose: string; page: string; href: string }>,
): string => `---
import Site from '~/layouts/site.astro'
import PageHeader from '~/components/page_header.astro'

const approach = ${quote(approach)}
const hypothesis = ${quote(hypothesis)}
const screens = ${JSON.stringify(screens, null, 2)}
---

<Site title={\`Approach \${approach.toUpperCase()}\`}>
  <div class="mx-auto max-w-3xl">
    <p class="mb-4 text-sm">
      <a href="/" class="text-primary underline-offset-4 hover:underline">All approaches</a>
    </p>
    <PageHeader title={\`Approach \${approach.toUpperCase()}\`} description={hypothesis} />
    <ul class="grid gap-2">
      {
        screens.map((screen) => (
          <li>
            <a href={screen.href} class="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {screen.purpose}
              <span class="text-muted-foreground"> ({screen.page})</span>
            </a>
          </li>
        ))
      }
    </ul>
  </div>
</Site>
`;

const screenStub = (approach: string, purpose: string): string => `---
import Site from '~/layouts/site.astro'
import PageHeader from '~/components/page_header.astro'
import { fixtures } from '~/data/fixtures'

const approach = ${quote(approach)}
const purpose = ${quote(purpose)}
---

<Site title={purpose}>
  <p class="mb-4 text-sm">
    <a href={\`/approaches/\${approach}/\`} class="text-primary underline-offset-4 hover:underline">
      Approach {approach.toUpperCase()}
    </a>
  </p>
  <PageHeader
    title={purpose}
    description="Replace this stub with the invented UI for this approach. Mock rows come from ~/data/fixtures."
  />
  <pre class="overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs">{JSON.stringify(fixtures, null, 2)}</pre>
</Site>
`;

const prototypeContract = (
  title: string,
  plan: GenerationPlan,
  variants: readonly string[],
  hypotheses: Record<string, string>,
): GeneratedFile => {
  const backlog = galleryBacklog(plan);
  const screens =
    backlog.length === 0
      ? "_No process screens — invent a single marketing / capture surface._"
      : backlog
          .map(
            (item) =>
              `- \`${item.page}.astro\` (\`${item.route}\`) — ${item.purpose}`,
          )
          .join("\n");
  const approachList = variants
    .map(
      (id) =>
        `- **${id.toUpperCase()}** (\`src/pages/approaches/${id}/\`, islands in \`src/components/approaches/${id}/\`) — ${hypotheses[id]}`,
    )
    .join("\n");

  return file(
    "PROTOTYPE.md",
    `# Prototype gallery — ${title}

Lightweight static Astro 7 site with Vue islands. **No server, database, MCP, RBAC, or production schema.** Every screen reads mock \`fixtures\`.

## Approaches

${approachList}

## Screens to invent (per approach)

${screens}

## Rules

1. Keep shared mock data in \`src/data/fixtures.ts\` — do not invent a database for the prototype.
2. Redesign each approach folder freely; keep the route shape (\`/approaches/<id>/...\`).
3. Write pages in \`.astro\`; put interactive parts in Vue components under \`src/components/approaches/<id>/\` and mount them with a \`client:*\` directive.
4. Visually strong is enough; not production-ready.
5. When a winner is chosen, generate a **foundation** into a new empty directory — do not promote this prototype in place.
6. \`npm run typecheck\` is enough for prototypes; a production build is optional.

## Shared

- Tokens: \`src/styles/global.css\`
- Layout: \`src/layouts/site.astro\`; header: \`src/components/page_header.astro\`
- Vue primitives: \`src/components/ui/*\`
- Entry: \`/\` lists approaches
`,
  );
};

const readme = (
  input: GenerationInput,
  variants: readonly string[],
): GeneratedFile =>
  file(
    "README.md",
    `# ${input.model.title}

${input.model.summary}

Generated by Forward Deploy Engineering Anything as a **prototype** (static Astro 7 site, Vue islands, mock fixtures, ${variants.length} approaches).

Not production-ready. No server, database, MCP, or RBAC.

## Run

\`\`\`bash
npm run dev
\`\`\`

Open \`/\` to compare approaches ${variants.map((id) => id.toUpperCase()).join(", ")}. Invent UI under \`src/pages/approaches/<id>/\` using \`PROTOTYPE.md\`.
`,
  );

export const emitGallery = (input: GenerationInput): GeneratedFile[] => {
  const plan = buildPlan(input.model);
  const variants = prototypeVariants(input.prototypeVariants);
  const hypotheses = approachHypotheses(variants);
  const { design, model } = input;
  const backlog = uiBacklog(plan);
  const files: GeneratedFile[] = [
    ...astroShellFiles(
      model.title,
      design.tokens,
      variants.map((id) => ({
        label: `Approach ${id.toUpperCase()}`,
        href: `/approaches/${id}/`,
      })),
    ),
    file("src/data/fixtures.ts", fixturesSource(plan)),
    file("src/pages/index.astro", indexPage(model.title, hypotheses)),
  ];
  for (const id of variants) {
    files.push(
      file(
        `src/pages/approaches/${id}/index.astro`,
        approachHome(
          id,
          hypotheses[id] ?? `Approach ${id}`,
          backlog.map((item) => ({
            purpose: item.purpose,
            page: item.page,
            href: `/approaches/${id}/${screenPath(item.page)}/`,
          })),
        ),
      ),
    );
    for (const item of backlog) {
      files.push(
        file(
          `src/pages/approaches/${id}/${item.page}.astro`,
          screenStub(id, item.purpose),
        ),
      );
    }
  }
  files.push(prototypeContract(model.title, plan, variants, hypotheses));
  files.push(readme(input, variants));
  return files;
};
