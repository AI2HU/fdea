const ENV_SCHEMA_MARKER = "  // Session";
const ENV_FILE_MARKER = "# Session";

export const mailConfig = (): string => `import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailConfig = defineConfig({
  default: 'ses',

  from: {
    address: env.get('SES_FROM_ADDRESS'),
    name: env.get('SES_FROM_NAME'),
  },

  mailers: {
    ses: transports.ses({
      apiVersion: '2010-12-01',
      region: env.get('SES_REGION'),
      credentials: {
        accessKeyId: env.get('SES_ACCESS_KEY_ID'),
        secretAccessKey: env.get('SES_SECRET_ACCESS_KEY'),
      },
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
`;

export const driveConfig = (): string => `import env from '#start/env'
import { defineConfig, services } from '@adonisjs/drive'

const driveConfig = defineConfig({
  default: 's3',

  services: {
    s3: services.s3({
      credentials: {
        accessKeyId: env.get('S3_ACCESS_KEY_ID'),
        secretAccessKey: env.get('S3_SECRET_ACCESS_KEY'),
      },
      region: env.get('S3_REGION'),
      bucket: env.get('S3_BUCKET'),
      visibility: 'private',
    }),
  },
})

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
`;

export const mailDriveEnvSchema = (source: string): string | undefined =>
  source.includes(ENV_SCHEMA_MARKER)
    ? source.replace(
        ENV_SCHEMA_MARKER,
        `  // Amazon SES
  SES_ACCESS_KEY_ID: Env.schema.string(),
  SES_SECRET_ACCESS_KEY: Env.schema.string(),
  SES_REGION: Env.schema.string(),
  SES_FROM_ADDRESS: Env.schema.string(),
  SES_FROM_NAME: Env.schema.string(),

  // Amazon S3
  S3_ACCESS_KEY_ID: Env.schema.string(),
  S3_SECRET_ACCESS_KEY: Env.schema.string(),
  S3_REGION: Env.schema.string(),
  S3_BUCKET: Env.schema.string(),

${ENV_SCHEMA_MARKER}`,
      )
    : undefined;

export const mailDriveEnvFile = (
  source: string,
  fromName: string,
): string | undefined =>
  source.includes(ENV_FILE_MARKER)
    ? source.replace(
        ENV_FILE_MARKER,
        `# Amazon SES
SES_ACCESS_KEY_ID=changeme
SES_SECRET_ACCESS_KEY=changeme
SES_REGION=eu-west-1
SES_FROM_ADDRESS=app@example.com
SES_FROM_NAME=${fromName}

# Amazon S3
S3_ACCESS_KEY_ID=changeme
S3_SECRET_ACCESS_KEY=changeme
S3_REGION=eu-west-1
S3_BUCKET=changeme

${ENV_FILE_MARKER}`,
      )
    : undefined;

export const ensureMailDriveRc = (source: string): string | undefined => {
  let next = source;
  if (!next.includes("@adonisjs/mail/commands")) {
    if (!next.includes("commands: [")) return undefined;
    next = next.replace(
      "commands: [",
      "commands: [\n    () => import('@adonisjs/mail/commands'),",
    );
  }
  if (!next.includes("@adonisjs/mail/mail_provider")) {
    if (!next.includes("providers: [")) return undefined;
    next = next.replace(
      "providers: [",
      "providers: [\n    () => import('@adonisjs/mail/mail_provider'),",
    );
  }
  if (!next.includes("@adonisjs/drive/drive_provider")) {
    if (!next.includes("@adonisjs/mail/mail_provider")) return undefined;
    next = next.replace(
      "() => import('@adonisjs/mail/mail_provider'),",
      "() => import('@adonisjs/mail/mail_provider'),\n    () => import('@adonisjs/drive/drive_provider'),",
    );
  }
  return next;
};
