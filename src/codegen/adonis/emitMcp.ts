import type { Field } from "../../contracts/processModel.js";
import { camelCase, pascalCase } from "../../process/naming.js";
import { file, quote, type GeneratedFile } from "./files.js";
import {
  attribute,
  createFields,
  crudPermission,
  initialValues,
  labelOf,
  relationName,
  updateFields,
  type CrudKind,
  type EntityPlan,
  type GenerationPlan,
} from "./plan.js";

export interface McpOptions {
  readonly rbac: boolean;
  readonly title: string;
}

const jsonType = (
  field: Field,
): { type: string; description: string; enum?: string[] } => {
  const description = labelOf(field);
  switch (field.type) {
    case "string":
    case "text":
    case "date":
    case "datetime":
    case "decimal":
      return { type: "string", description };
    case "integer":
    case "reference":
      return { type: "integer", description };
    case "boolean":
      return { type: "boolean", description };
    case "enum":
      return {
        type: "string",
        description,
        ...(field.enum_values === undefined
          ? {}
          : { enum: [...field.enum_values] }),
      };
  }
};

const schemaProperties = (fields: readonly Field[]): string =>
  fields
    .map((field) => {
      const key = attribute(field);
      const schema = jsonType(field);
      const enumPart =
        schema.enum === undefined
          ? ""
          : `,\n          enum: ${JSON.stringify(schema.enum)}`;
      return `        ${key}: {
          type: ${quote(schema.type)},
          description: ${quote(schema.description)}${enumPart}
        },`;
    })
    .join("\n");

const requiredList = (fields: readonly Field[]): string =>
  JSON.stringify(
    fields.filter((field) => field.required).map((field) => attribute(field)),
  );

const authorize = (plan: EntityPlan, action: string, rbac: boolean): string =>
  rbac
    ? `    await bouncer.with(${plan.names.policyClass}).authorize(${quote(action)})\n`
    : "";

const dateConversions = (
  plan: EntityPlan,
  mode: "create" | "update",
): string => {
  const dates = (
    mode === "create" ? createFields(plan) : updateFields(plan)
  ).filter((field) => field.type === "date" || field.type === "datetime");
  const initials = mode === "create" ? initialValues(plan) : [];
  if (dates.length === 0 && initials.length === 0) return "args!";
  const parts = [
    ...dates.map((field) => {
      const key = attribute(field);
      return field.required
        ? `${key}: DateTime.fromISO(args!.${key})`
        : `${key}: args!.${key} ? DateTime.fromISO(args!.${key}) : null`;
    }),
    ...initials.map(
      ({ field, value }) => `${attribute(field)}: ${quote(value)}`,
    ),
  ];
  return `{ ...args!, ${parts.join(", ")} }`;
};

const toolClassName = (parts: string[]): string =>
  `${parts.map((part) => pascalCase(part)).join("")}Tool`;

const crudTool = (
  plan: EntityPlan,
  kind: CrudKind,
  rbac: boolean,
): GeneratedFile | undefined => {
  if (!plan.crud.has(kind)) return undefined;
  const { names } = plan;
  const toolName = `${plan.entity.id}_${kind}`;
  const className = toolClassName([plan.entity.id, kind]);
  const needsDateTime =
    (kind === "create" || kind === "update") &&
    (kind === "create" ? createFields(plan) : updateFields(plan)).some(
      (field) => field.type === "date" || field.type === "datetime",
    );
  const preloads = plan.references
    .map(({ field }) => `.preload(${quote(relationName(field))})`)
    .join("");

  let body: string;
  let schemaBlock: string;
  let annotations = "";

  if (kind === "list") {
    annotations = "@isReadOnly()\n";
    schemaBlock = "";
    body = `${authorize(plan, "list", rbac)}    const rows = await ${names.model}.query()${preloads}.orderBy('id', 'desc')
    return response.structured({
      ${names.pluralVar}: ${names.transformerClass}.transform(rows),
    })`;
  } else if (kind === "view") {
    annotations = "@isReadOnly()\n";
    schemaBlock = `  schema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Record id' },
      },
      required: ['id'],
    } as Schema
  }`;
    body = `${authorize(plan, "view", rbac)}    const ${names.singularVar} = await ${names.model}.query()${preloads}.where('id', args!.id).firstOrFail()
    return response.structured({
      ${names.singularVar}: ${names.transformerClass}.transform(${names.singularVar}),
    })`;
  } else if (kind === "create") {
    const fields = createFields(plan);
    schemaBlock = `  schema() {
    return {
      type: 'object',
      properties: {
${schemaProperties(fields)}
      },
      required: ${requiredList(fields)},
    } as Schema
  }`;
    body = `${authorize(plan, "create", rbac)}    const ${names.singularVar} = await ${names.model}.create(${dateConversions(plan, "create")})
    return response.structured({
      ${names.singularVar}: ${names.transformerClass}.transform(
        await ${names.model}.query()${preloads}.where('id', ${names.singularVar}.id).firstOrFail()
      ),
    })`;
  } else if (kind === "update") {
    const fields = updateFields(plan);
    const mergeExpr = dateConversions(plan, "update").replace(
      /\bargs\b/g,
      "payload",
    );
    schemaBlock = `  schema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Record id' },
${schemaProperties(fields)}
      },
      required: ${JSON.stringify(["id", ...fields.filter((field) => field.required).map((field) => attribute(field))])},
    } as Schema
  }`;
    body = `${authorize(plan, "update", rbac)}    const ${names.singularVar} = await ${names.model}.findOrFail(args!.id)
    const { id: _id, ...payload } = args!
    ${names.singularVar}.merge(${mergeExpr})
    await ${names.singularVar}.save()
    return response.structured({
      ${names.singularVar}: ${names.transformerClass}.transform(
        await ${names.model}.query()${preloads}.where('id', ${names.singularVar}.id).firstOrFail()
      ),
    })`;
  } else {
    annotations = "@isDestructive()\n";
    schemaBlock = `  schema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Record id' },
      },
      required: ['id'],
    } as Schema
  }`;
    body = `${authorize(plan, "delete", rbac)}    const ${names.singularVar} = await ${names.model}.findOrFail(args!.id)
    await ${names.singularVar}.delete()
    return response.structured({ deleted: true, id: args!.id })`;
  }

  const schemaType =
    kind === "list"
      ? ""
      : `type Schema = BaseSchema<{
${
  kind === "view" || kind === "delete"
    ? "  id: { type: 'integer' }"
    : kind === "create"
      ? createFields(plan)
          .map(
            (field) =>
              `  ${attribute(field)}: { type: '${jsonType(field).type}' }`,
          )
          .join("\n")
      : [
          "  id: { type: 'integer' }",
          ...updateFields(plan).map(
            (field) =>
              `  ${attribute(field)}: { type: '${jsonType(field).type}' }`,
          ),
        ].join("\n")
}
}>

`;

  const imports = [
    `import type { ToolContext } from '@jrmc/adonis-mcp/types/context'`,
    ...(kind === "list"
      ? []
      : [`import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'`]),
    `import { Tool } from '@jrmc/adonis-mcp'`,
    ...(annotations.includes("isReadOnly")
      ? [`import { isReadOnly } from '@jrmc/adonis-mcp/tool_annotations'`]
      : []),
    ...(annotations.includes("isDestructive")
      ? [`import { isDestructive } from '@jrmc/adonis-mcp/tool_annotations'`]
      : []),
    ...(needsDateTime ? [`import { DateTime } from 'luxon'`] : []),
    `import ${names.model} from '#models/${plan.entity.id}'`,
    `import ${names.transformerClass} from '#transformers/${plan.entity.id}_transformer'`,
    ...(rbac
      ? [
          `import ${names.policyClass} from '#policies/${plan.entity.id}_policy'`,
        ]
      : []),
  ];

  return file(
    `app/mcp/tools/${toolName}_tool.ts`,
    `${imports.join("\n")}

${schemaType}${annotations}export default class ${className} extends Tool${kind === "list" ? "" : "<Schema>"} {
  name = ${quote(toolName)}
  title = ${quote(`${kind} ${names.label}`)}
  description = ${quote(`${kind} ${names.pluralLabel.toLowerCase()} through the process API. Requires permission ${crudPermission(plan.entity.id, kind)}.`)}

  async handle({ ${kind === "list" ? "" : "args, "}response${rbac ? ", bouncer" : ""} }: ToolContext${kind === "list" ? "" : "<Schema>"}) {
${body}
  }
${schemaBlock === "" ? "" : `\n${schemaBlock}`}
}`,
  );
};

const transitionTool = (plan: EntityPlan, rbac: boolean): GeneratedFile[] =>
  plan.transitions.map((transition) => {
    const { names } = plan;
    const toolName = `${plan.entity.id}_${transition.stepId}`;
    const className = toolClassName([plan.entity.id, transition.stepId]);
    const field = camelCase(transition.field);
    const guard =
      transition.from === undefined
        ? ""
        : `    if (!${JSON.stringify(transition.from)}.includes(${names.singularVar}.${field})) {
      return response.error(${quote(`${transition.label} is not available in the current state.`)})
    }
`;
    return file(
      `app/mcp/tools/${toolName}_tool.ts`,
      `import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import type { BaseSchema } from '@jrmc/adonis-mcp/types/method'
import { Tool } from '@jrmc/adonis-mcp'
import ${names.model} from '#models/${plan.entity.id}'
import ${names.transformerClass} from '#transformers/${plan.entity.id}_transformer'
${rbac ? `import ${names.policyClass} from '#policies/${plan.entity.id}_policy'\n` : ""}
type Schema = BaseSchema<{
  id: { type: 'integer' }
}>

export default class ${className} extends Tool<Schema> {
  name = ${quote(toolName)}
  title = ${quote(transition.label)}
  description = ${quote(`${transition.label} on a ${names.label.toLowerCase()}. Requires permission ${transition.permission}.`)}

  async handle({ args, response${rbac ? ", bouncer" : ""} }: ToolContext<Schema>) {
${authorize(plan, transition.stepId, rbac)}    const ${names.singularVar} = await ${names.model}.findOrFail(args!.id)
${guard}    ${names.singularVar}.${field} = ${quote(transition.to)}
    await ${names.singularVar}.save()
    return response.structured({
      ${names.singularVar}: ${names.transformerClass}.transform(${names.singularVar}),
    })
  }

  schema() {
    return {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Record id' },
      },
      required: ['id'],
    } as Schema
  }
}`,
    );
  });

const whoamiTool = (rbac: boolean): GeneratedFile =>
  file(
    "app/mcp/tools/whoami_tool.ts",
    `import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import { Tool } from '@jrmc/adonis-mcp'
import { isReadOnly } from '@jrmc/adonis-mcp/tool_annotations'

@isReadOnly()
export default class WhoamiTool extends Tool {
  name = 'whoami'
  title = 'Who am I'
  description = 'Return the authenticated agent identity${rbac ? " and granted permission slugs" : ""}.'

  async handle({ auth, response }: ToolContext) {
    const user = auth.user
    if (!user) return response.error('Not authenticated')
    return response.structured({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
${rbac ? "      permissions: [...(await user.permissionSlugs())],\n" : ""}    })
  }
}`,
  );

const listToolsCatalog = (plan: GenerationPlan): GeneratedFile => {
  const tools = plan.entities.flatMap((entity) => {
    const ops = [
      ...[...entity.crud].map((kind) => ({
        name: `${entity.entity.id}_${kind}`,
        permission: crudPermission(entity.entity.id, kind),
      })),
      ...entity.transitions.map((transition) => ({
        name: `${entity.entity.id}_${transition.stepId}`,
        permission: transition.permission,
      })),
    ];
    return ops;
  });
  return file(
    "app/mcp/tools/list_allowed_tools_tool.ts",
    `import type { ToolContext } from '@jrmc/adonis-mcp/types/context'
import { Tool } from '@jrmc/adonis-mcp'
import { isReadOnly } from '@jrmc/adonis-mcp/tool_annotations'

const catalog = ${JSON.stringify(tools, null, 2)} as const

@isReadOnly()
export default class ListAllowedToolsTool extends Tool {
  name = 'list_allowed_tools'
  title = 'List allowed tools'
  description = 'List MCP tools this authenticated agent may call, based on RBAC permissions.'

  async handle({ auth, response }: ToolContext) {
    const user = auth.user
    if (!user) return response.error('Not authenticated')
    const granted = new Set(await user.permissionSlugs())
    return response.structured({
      tools: catalog.filter((tool) => granted.has(tool.permission)),
    })
  }
}`,
  );
};

export const mcpConfigFile = (title: string): GeneratedFile =>
  file(
    "config/mcp.ts",
    `import { defineConfig } from '@jrmc/adonis-mcp'

export default defineConfig({
  name: ${quote(title)},
  version: '1.0.0',
})`,
  );

export const mcpMiddlewareFile = (rbac: boolean): GeneratedFile =>
  file(
    "app/middleware/mcp_middleware.ts",
    `import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isModernProtocolRequest } from '@jrmc/adonis-mcp/protocols/version'
${
  rbac
    ? `import type * as abilities from '#abilities/main'
import type { policies } from '#generated/policies'
import type McpBouncer from '@jrmc/adonis-mcp/bouncer'
`
    : ""
}import crypto from 'node:crypto'

export default class McpMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const body = ctx.request.body()
    const method = body.method

    const contentType = ctx.request.header('Content-Type')?.split(';', 1)[0]
    if (contentType !== 'application/json') {
      return ctx.response.badRequest('Content-Type header must be application/json')
    }

    const headerVersion = ctx.request.header('MCP-Protocol-Version')
    const metadataVersion = body.params?._meta?.['io.modelcontextprotocol/protocolVersion']

    if (isModernProtocolRequest(headerVersion, metadataVersion)) {
      return next()
    }

    if (method === 'initialize') {
      ctx.response.safeHeader('MCP-Session-Id', crypto.randomUUID())
    } else {
      const sessionId = ctx.request.header('MCP-Session-Id')
      if (!sessionId) {
        return ctx.response.badRequest('MCP-Session-Id header is required')
      }
      ctx.response.safeHeader('MCP-Session-Id', sessionId)
    }

    return next()
  }
}

declare module '@jrmc/adonis-mcp/types/context' {
  export interface McpContext {
    auth: {
      user: HttpContext['auth']['user']
    }
${
  rbac
    ? `    bouncer: McpBouncer<
      Exclude<HttpContext['auth']['user'], undefined>,
      typeof abilities,
      typeof policies
    >`
    : ""
}
  }
}`,
  );

export const authConfigFile = (): GeneratedFile =>
  file(
    "config/auth.ts",
    `import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

const authConfig = defineConfig({
  default: 'web',
  guards: {
    web: sessionGuard({
      useRememberMeTokens: false,
      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
    }),
    api: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
    }),
  },
})

export default authConfig

declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}`,
  );

export const shieldConfigFile = (): GeneratedFile =>
  file(
    "config/shield.ts",
    `import { defineConfig } from '@adonisjs/shield'

const shieldConfig = defineConfig({
  csp: {
    enabled: false,
    directives: {},
    reportOnly: false,
  },
  csrf: {
    enabled: true,
    exceptRoutes: ['/mcp'],
    enableXsrfCookie: true,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },
  hsts: {
    enabled: true,
    maxAge: '180 days',
  },
  contentTypeSniffing: {
    enabled: true,
  },
})

export default shieldConfig`,
  );

export const kernelFile = (): GeneratedFile =>
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
  () => import('@adonisjs/auth/initialize_auth_middleware'),
  () => import('#middleware/silent_auth_middleware'),
  () => import('#middleware/initialize_bouncer_middleware'),
])

export const middleware = router.named({
  guest: () => import('#middleware/guest_middleware'),
  auth: () => import('#middleware/auth_middleware'),
  mcp: () => import('#middleware/mcp_middleware'),
})`,
  );

export const accessTokensMigration = (timestamp: number): GeneratedFile =>
  file(
    `database/migrations/${timestamp}_create_auth_access_tokens_table.ts`,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .notNullable()
        .unsigned()
        .references('users.id')
        .onDelete('CASCADE')
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}`,
  );

export const mcpTokenCommandFile = (): GeneratedFile =>
  file(
    "commands/mcp_token.ts",
    `import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class McpToken extends BaseCommand {
  static commandName = 'mcp:token'
  static description = 'Create an access token for the MCP server'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Email of the user that owns the token' })
  declare email?: string

  @flags.string({ description: 'Token name' })
  declare name?: string

  async run() {
    const { default: User } = await import('#models/user')
    const email = this.email ?? (await this.prompt.ask('User email'))
    const user = await User.findBy('email', email)
    if (!user) {
      this.logger.error(\`No user with email "\${email}".\`)
      this.exitCode = 1
      return
    }
    const tokenName = this.name ?? 'mcp'
    const token = await User.accessTokens.create(user, ['*'], { name: tokenName })
    this.logger.success(\`MCP token for \${email} (role permissions still apply):\`)
    this.logger.info(token.value!.release())
  }
}`,
  );

export const ensureMcpRc = (source: string): string | undefined => {
  let next = source;
  if (!next.includes("@jrmc/adonis-mcp/commands")) {
    if (!next.includes("@adonisjs/bouncer/commands")) return undefined;
    next = next.replace(
      "() => import('@adonisjs/bouncer/commands')",
      "() => import('@adonisjs/bouncer/commands'),\n    () => import('@jrmc/adonis-mcp/commands')",
    );
  }
  if (!next.includes("@jrmc/adonis-mcp/mcp_provider")) {
    if (!next.includes("@adonisjs/bouncer/bouncer_provider")) return undefined;
    next = next.replace(
      "() => import('@adonisjs/bouncer/bouncer_provider')",
      "() => import('@adonisjs/bouncer/bouncer_provider'),\n    () => import('@jrmc/adonis-mcp/mcp_provider'),\n    () => import('@jrmc/adonis-mcp/vinejs_provider')",
    );
  }
  return next === source ? source : next;
};

export const mcpFiles = (
  plan: GenerationPlan,
  options: McpOptions,
): GeneratedFile[] => {
  const files: GeneratedFile[] = [
    mcpConfigFile(options.title),
    mcpMiddlewareFile(options.rbac),
    authConfigFile(),
    shieldConfigFile(),
    kernelFile(),
    accessTokensMigration(1_810_000_000_000),
    mcpTokenCommandFile(),
    whoamiTool(options.rbac),
  ];
  if (options.rbac) files.push(listToolsCatalog(plan));
  for (const entity of plan.entities) {
    for (const kind of [
      "list",
      "view",
      "create",
      "update",
      "delete",
    ] as const) {
      const tool = crudTool(entity, kind, options.rbac);
      if (tool !== undefined) files.push(tool);
    }
    files.push(...transitionTool(entity, options.rbac));
  }
  return files;
};
