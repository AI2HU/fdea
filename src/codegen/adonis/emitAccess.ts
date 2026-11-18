import { file, quote, type GeneratedFile } from "../files.js";
import type { GenerationPlan } from "./plan.js";

export const ACCESS_MIGRATION_BASE = 1_800_000_000_000;

const accessMigration = (
  name: string,
  timestamp: number,
  body: string,
): GeneratedFile => file(`database/migrations/${timestamp}_${name}.ts`, body);

export const accessMigrations = (): GeneratedFile[] => [
  accessMigration(
    "create_roles_table",
    ACCESS_MIGRATION_BASE,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('slug', 64).notNullable().unique()
      table.string('name', 255).notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}`,
  ),
  accessMigration(
    "create_permissions_table",
    ACCESS_MIGRATION_BASE + 1,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permissions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('slug', 128).notNullable().unique()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}`,
  ),
  accessMigration(
    "create_permission_role_table",
    ACCESS_MIGRATION_BASE + 2,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'permission_role'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('permission_id').unsigned().notNullable().references('permissions.id').onDelete('CASCADE')
      table.integer('role_id').unsigned().notNullable().references('roles.id').onDelete('CASCADE')
      table.unique(['permission_id', 'role_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}`,
  ),
  accessMigration(
    "add_role_id_to_users_table",
    ACCESS_MIGRATION_BASE + 3,
    `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('role_id').unsigned().nullable().references('roles.id').onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('role_id')
    })
  }
}`,
  ),
];

export const accessModels = (): GeneratedFile[] => [
  file(
    "app/models/role.ts",
    `import { RoleSchema } from '#database/schema'
import Permission from '#models/permission'
import { manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'

export default class Role extends RoleSchema {
  @manyToMany(() => Permission, { pivotTable: 'permission_role' })
  declare permissions: ManyToMany<typeof Permission>
}`,
  ),
  file(
    "app/models/permission.ts",
    `import { PermissionSchema } from '#database/schema'

export default class Permission extends PermissionSchema {}`,
  ),
];

export const userModelFile = (rbac: boolean, mcp: boolean): GeneratedFile => {
  const tokensImport = mcp
    ? "\nimport { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'"
    : "";
  const tokens = mcp
    ? "  static accessTokens = DbAccessTokensProvider.forModel(User)\n\n"
    : "";
  return file(
    "app/models/user.ts",
    rbac
      ? `import { UserSchema } from '#database/schema'
import Role from '#models/role'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'${tokensImport}

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
${tokens}  private grantedPermissions?: Set<string>

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return \`\${first.charAt(0)}\${last.charAt(0)}\`.toUpperCase()
    }
    return \`\${first.slice(0, 2)}\`.toUpperCase()
  }

  async permissionSlugs() {
    if (!this.grantedPermissions) {
      const role = this.roleId
        ? await Role.query().where('id', this.roleId).preload('permissions').first()
        : null
      this.grantedPermissions = new Set(role?.permissions.map((permission) => permission.slug))
    }
    return this.grantedPermissions
  }

  async can(slug: string) {
    return (await this.permissionSlugs()).has(slug)
  }
}`
      : `import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'${tokensImport}

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
${tokens}  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return \`\${first.charAt(0)}\${last.charAt(0)}\`.toUpperCase()
    }
    return \`\${first.slice(0, 2)}\`.toUpperCase()
  }
}`,
  );
};

export const authConfigFile = (mcp: boolean): GeneratedFile =>
  file(
    "config/auth.ts",
    `import { defineConfig } from '@adonisjs/auth'
import { sessionGuard, sessionUserProvider } from '@adonisjs/auth/session'
${mcp ? "import { tokensGuard, tokensUserProvider } from '@adonisjs/auth/access_tokens'\n" : ""}import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'

const authConfig = defineConfig({
  default: 'web',
  guards: {
    web: sessionGuard({
      useRememberMeTokens: false,
      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
    }),
${
  mcp
    ? `    api: tokensGuard({
      provider: tokensUserProvider({
        tokens: 'accessTokens',
        model: () => import('#models/user'),
      }),
    }),
`
    : ""
}  },
})

export default authConfig

declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}`,
  );

export const shieldConfigFile = (mcp: boolean): GeneratedFile =>
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
    exceptRoutes: [${mcp ? "'/mcp'" : ""}],
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

export const kernelFile = (mcp: boolean): GeneratedFile =>
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
${mcp ? "  mcp: () => import('#middleware/mcp_middleware'),\n" : ""}})`,
  );

export const loginValidatorFile = (): GeneratedFile =>
  file(
    "app/validators/user.ts",
    `import vine from '@vinejs/vine'

export const loginValidator = vine.create({
  email: vine.string().email().maxLength(254),
  password: vine.string(),
})`,
  );

export const seederFile = (plan: GenerationPlan): GeneratedFile => {
  const roles = plan.roles
    .map(
      (role) =>
        `  { slug: ${quote(role.actor.id)}, name: ${quote(role.actor.name)}, permissions: [${role.permissions.map(quote).join(", ")}] },`,
    )
    .join("\n");
  return file(
    "database/seeders/access_seeder.ts",
    `import Permission from '#models/permission'
import Role from '#models/role'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

const permissions = [${plan.permissions.map(quote).join(", ")}]

const roles = [
${roles}
]

export default class extends BaseSeeder {
  async run() {
    for (const slug of permissions) {
      await Permission.updateOrCreate({ slug }, {})
    }

    for (const definition of roles) {
      const role = await Role.updateOrCreate(
        { slug: definition.slug },
        { name: definition.name }
      )
      const granted = await Permission.query().whereIn('slug', definition.permissions)
      await role.related('permissions').sync(granted.map((permission) => permission.id))
    }
  }
}`,
  );
};

export const userCreateCommandFile = (rbac: boolean): GeneratedFile =>
  file(
    "commands/user_create.ts",
    rbac
      ? `import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class UserCreate extends BaseCommand {
  static commandName = 'user:create'
  static description = 'Create a user who can sign in'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Full name' })
  declare fullName?: string

  @flags.string({ description: 'Email address' })
  declare email?: string

  @flags.string({ description: 'Role slug' })
  declare role?: string

  async run() {
    const { default: User } = await import('#models/user')
    const { default: Role } = await import('#models/role')

    const roles = await Role.query().orderBy('name')
    if (roles.length === 0) {
      this.logger.error('No roles found. Run "node ace db:seed" first.')
      this.exitCode = 1
      return
    }

    const email = this.email ?? (await this.prompt.ask('Email address'))
    const fullName = this.fullName ?? (await this.prompt.ask('Full name'))
    const roleSlug =
      this.role ??
      (await this.prompt.choice(
        'Role',
        roles.map((role) => ({ name: role.slug, message: role.name }))
      ))
    const role = roles.find((candidate) => candidate.slug === roleSlug)
    if (!role) {
      this.logger.error(\`Unknown role "\${roleSlug}".\`)
      this.exitCode = 1
      return
    }

    const password = await this.prompt.secure('Password (min 8 characters)')
    if (password.length < 8) {
      this.logger.error('The password must have at least 8 characters.')
      this.exitCode = 1
      return
    }

    await User.create({ email, fullName, password, roleId: role.id })
    this.logger.success(\`User \${email} created with role \${role.name}.\`)
  }
}`
      : `import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class UserCreate extends BaseCommand {
  static commandName = 'user:create'
  static description = 'Create a user who can sign in'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Full name' })
  declare fullName?: string

  @flags.string({ description: 'Email address' })
  declare email?: string

  async run() {
    const { default: User } = await import('#models/user')

    const email = this.email ?? (await this.prompt.ask('Email address'))
    const fullName = this.fullName ?? (await this.prompt.ask('Full name'))
    const password = await this.prompt.secure('Password (min 8 characters)')
    if (password.length < 8) {
      this.logger.error('The password must have at least 8 characters.')
      this.exitCode = 1
      return
    }

    await User.create({ email, fullName, password })
    this.logger.success(\`User \${email} created.\`)
  }
}`,
  );

export const inertiaMiddlewareFile = (rbac: boolean): GeneratedFile =>
  file(
    "app/middleware/inertia_middleware.ts",
    `import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import UserTransformer from '#transformers/user_transformer'
import BaseInertiaMiddleware from '@adonisjs/inertia/inertia_middleware'

export default class InertiaMiddleware extends BaseInertiaMiddleware {
  async share(ctx: HttpContext) {
    const { auth } = ctx as Partial<HttpContext>
    const user = auth?.user
${rbac ? "    const permissions = user ? [...(await user.permissionSlugs())] : []\n" : ""}
    return {
      errors: ctx.inertia.always(this.getValidationErrors(ctx)),
      user: ctx.inertia.always(user ? UserTransformer.transform(user) : undefined),
${rbac ? "      permissions: ctx.inertia.always(permissions),\n" : ""}    }
  }

  flash(ctx: HttpContext) {
    const { session } = ctx as Partial<HttpContext>

    const success: string | undefined = session?.flashMessages.get('success')
    const error: string | undefined = session?.flashMessages.get('error')

    return { success, error }
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
}`,
  );
