const LOCAL_DB_PATH = "app.tmpPath('db.sqlite3')";
const LOCAL_DB_TARGET = "`${process.cwd()}/storage/db.sqlite3`";

const APP_IMPORT = "import app from '@adonisjs/core/services/app'\n";

export const localDatabaseConfig = (source: string): string | undefined =>
  source.includes(LOCAL_DB_PATH) && source.includes(APP_IMPORT)
    ? source.replace(LOCAL_DB_PATH, LOCAL_DB_TARGET).replace(APP_IMPORT, "")
    : undefined;

export const cloudDatabaseConfig = (): string => `import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'pg',

  connections: {
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      schemaGeneration: {
        enabled: true,
        rulesPaths: ['./database/schema_rules.js'],
      },
      debug: app.inDev,
    },
  },
})

export default dbConfig
`;

const ENV_SCHEMA_MARKER = "  // Session";

export const cloudEnvSchema = (source: string): string | undefined =>
  source.includes(ENV_SCHEMA_MARKER)
    ? source.replace(
        ENV_SCHEMA_MARKER,
        `  // Database
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

${ENV_SCHEMA_MARKER}`,
      )
    : undefined;

const ENV_FILE_MARKER = "# Session";

export const cloudEnvFile = (
  source: string,
  database: string,
): string | undefined =>
  source.includes(ENV_FILE_MARKER)
    ? source.replace(
        ENV_FILE_MARKER,
        `# Database
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_DATABASE=${database}

${ENV_FILE_MARKER}`,
      )
    : undefined;

export const gitignoreForLocal = (source: string): string =>
  `${source.endsWith("\n") ? source : `${source}\n`}
# Local database
storage/*
!storage/.gitkeep
`;
