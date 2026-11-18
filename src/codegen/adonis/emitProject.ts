import type { GenerationInput } from "../../application/ports.js";
import { snakeCase } from "../../process/naming.js";
import {
  accessMigrations,
  accessModels,
  authConfigFile,
  inertiaMiddlewareFile,
  kernelFile,
  loginValidatorFile,
  seederFile,
  shieldConfigFile,
  userCreateCommandFile,
  userModelFile,
} from "./emitAccess.js";
import {
  foreignKeyMigrationFile,
  migrationFile,
  modelFile,
  schemaRulesFile,
  transformerFile,
  validatorFile,
} from "./emitData.js";
import { controllerFile, policyFile, routesFile } from "./emitHttp.js";
import { mockSeederFile } from "./emitMock.js";
import { mcpFiles } from "./emitMcp.js";
import {
  appEntryFile,
  componentsJsonFile,
  cssFile,
  shellFiles,
  viteConfigFile,
} from "./emitShell.js";
import { uiContractFile } from "./emitUi.js";
import { file, type GeneratedFile } from "../files.js";
import { buildPlan, type GenerationPlan } from "./plan.js";

const ENTITY_MIGRATION_BASE = 1_790_000_000_000;

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

export const KIT_FILES_TO_REMOVE: readonly string[] = [
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

const readme = (
  input: GenerationInput,
  plan: GenerationPlan,
): GeneratedFile => {
  const { model, rbac, mcp, deployment } = input;
  const mock = input.mockData !== undefined;
  const db =
    deployment === "cloud" ? "PostgreSQL" : "SQLite (file under `storage/`)";
  const access = rbac
    ? `
## Access control

Each role is an actor of the process. Roles and permissions are created by \`node ace db:seed\`, which is safe to re-run.

${plan.roles
  .map(
    (role) =>
      `- **${role.actor.name}** (\`${role.actor.id}\`): ${role.permissions.length === 0 ? "no permissions" : role.permissions.map((permission) => `\`${permission}\``).join(", ")}`,
  )
  .join("\n")}
`
    : "";
  const steps = model.steps
    .map((step) => {
      const actors = step.actor_ids
        .map((id) => model.actors.find((actor) => actor.id === id)?.name ?? id)
        .join(", ");
      return `- **${step.name}** (${actors}): ${step.description}`;
    })
    .join("\n");
  const agents = mcp
    ? `
The application is AI-native: it exposes an MCP server at \`/mcp\` so agents can operate the process through tools that reuse the same${rbac ? " RBAC permissions as the UI" : " authenticated API as the UI"}.
`
    : "";
  const mcpSection = mcp
    ? `
## MCP (AI agents)

1. Create a user (\`node ace user:create\`).
2. Issue a bearer token: \`node ace mcp:token --email=you@example.com\`
3. Point your agent at \`\${APP_URL}/mcp\` with \`Authorization: Bearer <token>\`.
${
  rbac
    ? "4. Call `list_allowed_tools` / `whoami` to see which process tools the token's role may use. Every mutating tool checks Bouncer policies.\n"
    : "4. Call `whoami` to confirm the token. Every authenticated user may call every process tool because RBAC is off.\n"
}`
    : "";
  const unknowns =
    model.unknowns.length === 0
      ? ""
      : `
## Open questions

These were not answered by the documentation and are not implemented:

${model.unknowns.map((unknown) => `- ${unknown.question}`).join("\n")}
`;
  const deploy =
    deployment === "cloud"
      ? `## Deployment

1. Provision a PostgreSQL database and set \`DB_HOST\`, \`DB_PORT\`, \`DB_USER\`, \`DB_PASSWORD\`, \`DB_DATABASE\`.
2. Configure Amazon SES (\`SES_ACCESS_KEY_ID\`, \`SES_SECRET_ACCESS_KEY\`, \`SES_REGION\`, \`SES_FROM_ADDRESS\`, \`SES_FROM_NAME\`) and Amazon S3 (\`S3_ACCESS_KEY_ID\`, \`S3_SECRET_ACCESS_KEY\`, \`S3_REGION\`, \`S3_BUCKET\`).
3. Set \`NODE_ENV=production\`, \`HOST=0.0.0.0\`, \`PORT\`, \`APP_URL\` and a secret \`APP_KEY\` (\`node ace generate:key --show\`).
4. \`npm ci && node ace build\`
5. From \`build/\`: \`npm ci --omit=dev\`, \`node ace migration:run --force\`, \`node ace db:seed\`, then \`node bin/server.js\`.
6. Create the first user from \`build/\`: \`node ace user:create\`.`
      : `## Running locally

Run every command from the project root. The database is \`storage/db.sqlite3\`; back it up to keep your data. Mail uses Amazon SES (\`SES_*\`) and file storage uses Amazon S3 (\`S3_*\`); replace the \`changeme\` placeholders in \`.env\` before sending mail or uploading files.

\`\`\`bash
node ace migration:run
${rbac || mock ? "node ace db:seed\n" : ""}node ace user:create
node ace build && cp .env build/.env
npm ci --omit=dev --prefix build
node build/bin/server.js
\`\`\`

Use \`npm run dev\` while changing the application.`;
  return file(
    "README.md",
    `# ${model.title}

${model.summary}

Generated by Forward Deploy Engineering Anything on AdonisJS 7 (Vue, Inertia, Lucid, Tailwind CSS, shadcn-style components). Database: ${db}. Mail: Amazon SES (\`SES_*\`). Storage: Amazon S3 (\`S3_*\`).

${mock ? "This is a **prototype**: the application is production-ready and holds only mock data. `node ace db:seed` loads it from `database/seeders/mock_data_seeder.ts`; every record is fictional.\n\n" : ""}Codegen produced the **foundation** (data layer, HTTP, auth,${rbac ? " RBAC," : ""}${mcp ? " MCP," : ""} SES mail, S3 storage, design tokens). **Process UI is built by the agent** — see \`UI.md\` for the page backlog and prop/route contract.
${agents}
## Process

${steps}
${access}${unknowns}
## UI

Implement every Inertia Vue page listed in \`UI.md\`. Controllers already render those page names. Redesign freely; do not regenerate the app for UI-only work.
${mcpSection}
## Setup

\`\`\`bash
npm install
\`\`\`

${deploy}

Sign-up is closed. Users are created with \`node ace user:create\`.
`,
  );
};

export const emitProject = (input: GenerationInput): GeneratedFile[] => {
  const plan = buildPlan(input.model);
  const { rbac, mcp, design, model } = input;
  const files: GeneratedFile[] = [];

  plan.entities.forEach((entity, index) => {
    files.push(migrationFile(entity, ENTITY_MIGRATION_BASE + index));
    files.push(modelFile(entity));
    files.push(transformerFile(entity));
    if (entity.crud.has("create") || entity.crud.has("update"))
      files.push(validatorFile(entity));
    if (entity.crud.size > 0 || entity.transitions.length > 0) {
      files.push(controllerFile(entity, { rbac }));
      if (rbac) files.push(policyFile(entity));
    }
  });
  const foreignKeys = foreignKeyMigrationFile(
    plan.entities,
    ENTITY_MIGRATION_BASE + plan.entities.length,
  );
  if (foreignKeys !== undefined) files.push(foreignKeys);

  files.push(schemaRulesFile(plan));
  files.push(routesFile(plan));
  files.push(loginValidatorFile());
  files.push(userModelFile(rbac, mcp));
  files.push(userCreateCommandFile(rbac));
  files.push(inertiaMiddlewareFile(rbac));
  files.push(authConfigFile(mcp), shieldConfigFile(mcp), kernelFile(mcp));
  if (rbac) {
    files.push(...accessMigrations(), ...accessModels(), seederFile(plan));
  }
  if (input.mockData !== undefined) {
    files.push(mockSeederFile(model, plan, input.mockData));
  }

  files.push(cssFile(design.tokens), componentsJsonFile(), viteConfigFile());
  files.push(appEntryFile(model.title), inertiaLayout(model.title));
  files.push(...shellFiles(model.title, model.summary, plan, rbac));
  if (mcp) files.push(...mcpFiles(plan, { rbac, title: model.title }));
  files.push(
    uiContractFile(model.title, plan, {
      rbac,
      mcp,
      mock: input.mockData !== undefined,
    }),
  );
  files.push(readme(input, plan));
  return files;
};

export const databaseName = (projectName: string): string =>
  snakeCase(projectName) === "" ? "app" : snakeCase(projectName);
