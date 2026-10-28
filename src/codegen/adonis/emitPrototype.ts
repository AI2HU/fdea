import type { GenerationInput } from "../../application/ports.js";
import type { Field } from "../../contracts/processModel.js";
import {
  appEntryFile,
  componentsJsonFile,
  cssFile,
  shellFiles,
  viteConfigFile,
} from "./emitShell.js";
import { uiBacklog } from "./emitUi.js";
import { file, quote, type GeneratedFile } from "../files.js";
import {
  attribute,
  buildPlan,
  type EntityPlan,
  type GenerationPlan,
} from "./plan.js";

const VARIANT_LETTERS = ["a", "b", "c", "d", "e"] as const;

export const prototypeVariants = (count: number): string[] =>
  VARIANT_LETTERS.slice(0, Math.min(5, Math.max(2, count)));

export const KIT_FILES_TO_REMOVE_VUE: readonly string[] = [
  "app/controllers/new_account_controller.ts",
  "inertia/pages/auth/signup.vue",
  "inertia/pages/home.vue",
  "inertia/components/logo.vue",
  "inertia/components/nav_link.vue",
  "inertia/components/page.vue",
  "inertia/components/section.vue",
  "inertia/components/theme_toggle.vue",
  "inertia/layouts/marketing.vue",
  "inertia/layouts/settings.vue",
];

/** Auth/user kit files that need a database — dropped for prototypes. */
export const PROTOTYPE_KIT_FILES_TO_REMOVE: readonly string[] = [
  "app/controllers/session_controller.ts",
  "app/models/user.ts",
  "app/transformers/user_transformer.ts",
  "app/validators/user.ts",
  "app/middleware/auth_middleware.ts",
  "app/middleware/guest_middleware.ts",
  "app/middleware/silent_auth_middleware.ts",
  "config/auth.ts",
  "config/database.ts",
  "inertia/pages/auth/login.vue",
  "inertia/pages/auth/signup.vue",
];

const sampleValue = (field: Field, index: number): unknown => {
  switch (field.type) {
    case "string":
      return `${field.label ?? field.name} ${index + 1}`;
    case "text":
      return `Sample ${field.label ?? field.name} for row ${index + 1}.`;
    case "integer":
      return (index + 1) * 10;
    case "decimal":
      return ((index + 1) * 12.5).toFixed(2);
    case "boolean":
      return index % 2 === 0;
    case "date":
      return `2026-0${(index % 9) + 1}-15`;
    case "datetime":
      return `2026-0${(index % 9) + 1}-15T10:00:00.000Z`;
    case "enum":
      return (
        field.enum_values?.[index % (field.enum_values.length || 1)] ?? "value"
      );
    case "reference":
      return (index % 3) + 1;
    default:
      return null;
  }
};

const fixtureRow = (
  entity: EntityPlan,
  index: number,
): Record<string, unknown> => {
  const row: Record<string, unknown> = { id: index + 1 };
  for (const field of entity.entity.fields) {
    row[attribute(field)] = sampleValue(field, index);
  }
  return row;
};

export const fixturesSource = (plan: GenerationPlan): string => {
  const payload: Record<string, unknown[]> = {};
  for (const entity of plan.entities) {
    payload[entity.names.pluralVar] = [0, 1, 2].map((index) =>
      fixtureRow(entity, index),
    );
  }
  return `/** Mock rows for prototype screens. Not persisted. */
export const fixtures = ${JSON.stringify(payload, null, 2)} as const

export type Fixtures = typeof fixtures
`;
};

const fixturesModule = (plan: GenerationPlan): GeneratedFile =>
  file("app/fixtures/process.ts", fixturesSource(plan));

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const inertiaLayout = (title: string): GeneratedFile =>
  file(
    "resources/views/inertia_layout.edge",
    `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title data-inertia>
      ${escapeHtml(title)}
    </title>

    @vite(['inertia/app.ts'])
    @inertiaHead()
    @stack('dumper')
  </head>

  <body>
    @inertia()
  </body>

</html>`,
  );

export const approachHypotheses = (
  variants: readonly string[],
): Record<string, string> => {
  const defaults: Record<string, string> = {
    a: "Dense operational workspace — tables first, quick filters, keyboard-friendly.",
    b: "Guided flow — one primary action per screen, progressive disclosure.",
    c: "Narrative / marketing-led — brand-forward hero, soft process surfaces.",
    d: "Card mosaic — scannable tiles, fewer columns, mobile-first.",
    e: "Conversation-shaped — chat-like steps with confirmations.",
  };
  return Object.fromEntries(
    variants.map((id) => [id, defaults[id] ?? `Approach ${id}`]),
  );
};

/** Encode inertia page path for a URL segment (slashes → dots). */
export const encodeScreen = (page: string): string => page.replaceAll("/", ".");

const prototypeController = (
  plan: GenerationPlan,
  variants: readonly string[],
): GeneratedFile => {
  const backlog = uiBacklog(plan);
  const screenCases = backlog
    .map(
      (item) => `    case ${quote(encodeScreen(item.page))}:
      return inertia.render(${quote(`approaches/`)} + approach + ${quote(`/${item.page}`)}, {
        approach,
        fixtures,
        purpose: ${quote(item.purpose)},
      })`,
    )
    .join("\n");

  const screenList = backlog
    .map(
      (item) =>
        `        { page: ${quote(item.page)}, purpose: ${quote(item.purpose)}, href: \`/approaches/\${approach}/s/${encodeScreen(item.page)}\` }`,
    )
    .join(",\n");

  return file(
    "app/controllers/prototype_controller.ts",
    `import type { HttpContext } from '@adonisjs/core/http'
import { fixtures } from '#fixtures/process'

const variants = ${JSON.stringify([...variants])} as const

export default class PrototypeController {
  async index({ inertia }: HttpContext) {
    return inertia.render('approaches/index', {
      variants: variants.map((id) => ({ id, href: \`/approaches/\${id}\` })),
      fixtures,
    })
  }

  async approach({ inertia, params, response }: HttpContext) {
    const approach = String(params.approach)
    if (!(variants as readonly string[]).includes(approach)) {
      return response.notFound('Unknown approach')
    }
    return inertia.render(\`approaches/\${approach}/home\`, {
      approach,
      fixtures,
      screens: [
${screenList}
      ],
    })
  }

  async screen({ inertia, params, response }: HttpContext) {
    const approach = String(params.approach)
    const page = String(params.screen ?? '')
    if (!(variants as readonly string[]).includes(approach)) {
      return response.notFound('Unknown approach')
    }
    switch (page) {
${screenCases}
      default:
        return response.notFound('Unknown screen')
    }
  }
}
`,
  );
};

export const PROTOTYPE_ROUTES = `import router from '@adonisjs/core/services/router'
const PrototypeController = () => import('#controllers/prototype_controller')

router.get('/', [PrototypeController, 'index']).as('prototype.index')
router.get('/approaches/:approach', [PrototypeController, 'approach']).as('prototype.approach')
router
  .get('/approaches/:approach/s/:screen', [PrototypeController, 'screen'])
  .as('prototype.screen')
`;

const prototypeKernel = (): GeneratedFile =>
  file(
    "start/kernel.ts",
    `import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

server.errorHandler(() => import('#exceptions/handler'))

server.use([
  () => import('#middleware/container_bindings_middleware'),
  () => import('@adonisjs/static/static_middleware'),
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/vite/vite_middleware'),
  () => import('#middleware/inertia_middleware'),
])

router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
])

export const middleware = router.named({})
`,
  );

const prototypeInertiaMiddleware = (): GeneratedFile =>
  file(
    "app/middleware/inertia_middleware.ts",
    `import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  share(ctx: HttpContext) {
    const { session } = ctx as Partial<HttpContext>
    const errorsBag = session?.flashMessages.get('errorsBag') ?? {}
    const error: string | undefined = Object.keys(errorsBag)
      .filter((code) => code !== 'E_VALIDATION_ERROR')
      .map((code) => errorsBag[code])[0]

    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      flash: ctx.inertia.always({ error }),
    }
  }

  async handle(ctx: HttpContext, next: NextFn) {
    await this.init(ctx)
    const output = await next()
    this.dispose(ctx)
    return output
  }
}

declare module '@adonisjs/inertia/types' {
  type MiddlewareSharedProps = InferSharedProps<InertiaMiddleware>
  export interface SharedProps extends MiddlewareSharedProps {}
}
`,
  );

const indexPage = (
  title: string,
  hypotheses: Record<string, string>,
): string => `<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3'
import PageHeader from '~/components/page_header.vue'

defineProps<{
  variants: Array<{ id: string; href: string }>
}>()

const hypotheses = ${JSON.stringify(hypotheses, null, 2)} as Record<string, string>
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12">
    <Head :title="${title.replaceAll('"', '\\"')} — approaches" />
    <PageHeader
      title="${title.replaceAll('"', '\\"')}"
      description="Pick an approach to evaluate. Each folder is a disposable Vue prototype with shared mock fixtures."
    />
    <ul class="grid gap-4">
      <li v-for="variant in variants" :key="variant.id">
        <Link
          :href="variant.href"
          class="block rounded-xl border border-border px-5 py-4 transition-colors hover:bg-accent/40"
        >
          <div class="text-lg font-semibold tracking-tight">Approach {{ variant.id.toUpperCase() }}</div>
          <p class="mt-1 text-sm text-muted-foreground">{{ hypotheses[variant.id] }}</p>
        </Link>
      </li>
    </ul>
  </div>
</template>
`;

const approachHome = (hypothesis: string): string => `<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3'
import PageHeader from '~/components/page_header.vue'

defineProps<{
  approach: string
  screens: Array<{ page: string; purpose: string; href: string }>
}>()
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-12">
    <Head :title="\`Approach \${approach.toUpperCase()}\`" />
    <p class="mb-4 text-sm">
      <Link href="/" class="text-primary underline-offset-4 hover:underline">All approaches</Link>
    </p>
    <PageHeader
      :title="\`Approach \${approach.toUpperCase()}\`"
      description=${quote(hypothesis)}
    />
    <ul class="grid gap-2">
      <li v-for="screen in screens" :key="screen.page">
        <Link :href="screen.href" class="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {{ screen.purpose }}
          <span class="text-muted-foreground"> ({{ screen.page }})</span>
        </Link>
      </li>
    </ul>
  </div>
</template>
`;

const screenStub = (): string => `<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3'
import PageHeader from '~/components/page_header.vue'

defineProps<{
  approach: string
  purpose: string
  fixtures: Record<string, unknown>
}>()
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-10">
    <Head :title="purpose" />
    <p class="mb-4 text-sm">
      <Link :href="\`/approaches/\${approach}\`" class="text-primary underline-offset-4 hover:underline">
        Approach {{ approach.toUpperCase() }}
      </Link>
    </p>
    <PageHeader
      :title="purpose"
      description="Replace this stub with the invented UI for this approach. Fixtures are in props.fixtures."
    />
    <pre class="overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-xs">{{ fixtures }}</pre>
  </div>
</template>
`;

const prototypeContract = (
  title: string,
  plan: GenerationPlan,
  variants: readonly string[],
  hypotheses: Record<string, string>,
): GeneratedFile => {
  const backlog = uiBacklog(plan);
  const screens =
    backlog.length === 0
      ? "_No process screens — invent a single marketing / capture surface._"
      : backlog
          .map(
            (item) =>
              `- \`${item.page}\` — ${item.purpose} (props: \`approach\`, \`fixtures\`, \`purpose\`)`,
          )
          .join("\n");
  const approachList = variants
    .map(
      (id) =>
        `- **${id.toUpperCase()}** (\`inertia/pages/approaches/${id}/\`) — ${hypotheses[id]}`,
    )
    .join("\n");

  return file(
    "PROTOTYPE.md",
    `# Prototype gallery — ${title}

Lightweight AdonisJS 7 + Vue Inertia scaffold. **No database, Lucid process models, MCP, RBAC, or production schema.** Controllers serve mock \`fixtures\` only.

## Approaches

${approachList}

## Screens to invent (per approach)

${screens}

## Rules

1. Keep shared mock data in \`app/fixtures/process.ts\` — do not invent a database for the prototype.
2. Redesign each approach folder freely; keep the route shape (\`/approaches/:id/...\`).
3. Visually strong is enough; not production-ready.
4. When a winner is chosen, generate a **foundation** into a new empty directory — do not promote this prototype in place.
5. \`npm run typecheck\` is enough for prototypes; a production build is optional.

## Shared

- Tokens: \`inertia/css/app.css\`
- Primitives: \`inertia/components/ui/*\`
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

Generated by Forward Deploy Engineering Anything as a **prototype** (AdonisJS 7 + Vue Inertia, mock fixtures, ${variants.length} approaches).

Not production-ready. No database, process Lucid models, MCP, or RBAC.

## Run

\`\`\`bash
npm run dev
\`\`\`

Open \`/\` to compare approaches ${variants.map((id) => id.toUpperCase()).join(", ")}. Invent UI under \`inertia/pages/approaches/<id>/\` using \`PROTOTYPE.md\`.
`,
  );

export const emitPrototype = (input: GenerationInput): GeneratedFile[] => {
  const plan = buildPlan(input.model);
  const variants = prototypeVariants(input.prototypeVariants);
  const hypotheses = approachHypotheses(variants);
  const { design, model } = input;
  const files: GeneratedFile[] = [];

  files.push(fixturesModule(plan));
  files.push(prototypeController(plan, variants));
  files.push(prototypeKernel(), prototypeInertiaMiddleware());
  files.push(cssFile(design.tokens), componentsJsonFile(), viteConfigFile());
  files.push(appEntryFile(model.title), inertiaLayout(model.title));
  files.push(
    ...shellFiles(model.title, model.summary, plan, false).filter(
      (item) =>
        !item.path.endsWith("layouts/app.vue") &&
        !item.path.endsWith("pages/dashboard.vue") &&
        !item.path.endsWith("pages/auth/login.vue") &&
        !item.path.endsWith("layouts/auth.vue") &&
        !item.path.endsWith("hooks/use_can.ts"),
    ),
  );
  files.push(
    file(
      "inertia/pages/approaches/index.vue",
      indexPage(model.title, hypotheses),
    ),
  );
  for (const id of variants) {
    files.push(
      file(
        `inertia/pages/approaches/${id}/home.vue`,
        approachHome(hypotheses[id] ?? `Approach ${id}`),
      ),
    );
    for (const item of uiBacklog(plan)) {
      files.push(
        file(`inertia/pages/approaches/${id}/${item.page}.vue`, screenStub()),
      );
    }
  }
  files.push(prototypeContract(model.title, plan, variants, hypotheses));
  files.push(readme(input, variants));
  return files;
};
