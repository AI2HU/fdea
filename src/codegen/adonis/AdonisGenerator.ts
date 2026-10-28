import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, basename, join } from "node:path";
import type {
  ApplicationGenerator,
  GenerationInput,
} from "../../application/ports.js";
import type { GenerationResult } from "../../contracts/project.js";
import type { FdeaError, Result } from "../../domain/result.js";
import { SpawnRunner, tail, type CommandRunner } from "../runner.js";
import {
  execStep,
  generateInto,
  MINUTE,
  StepFailure,
  writeAll,
} from "../workspace.js";
import {
  cloudDatabaseConfig,
  cloudEnvFile,
  cloudEnvSchema,
  gitignoreForLocal,
  localDatabaseConfig,
  stripDatabaseEnvFile,
  stripDatabaseEnvSchema,
  stripDatabaseFromAdonisRc,
} from "./database.js";
import {
  databaseName,
  emitProject,
  KIT_FILES_TO_REMOVE,
} from "./emitProject.js";
import {
  PROTOTYPE_KIT_FILES_TO_REMOVE,
  PROTOTYPE_ROUTES,
} from "./emitPrototype.js";
import { validatorFieldNames } from "./emitData.js";
import { MCP_ROUTE } from "./emitHttp.js";
import { ensureMcpRc } from "./emitMcp.js";
import { uiBacklog } from "./emitUi.js";
import { buildPlan } from "./plan.js";

const SCAFFOLD_ARGS = ["--kit=vue", "--pkg=npm", "--skip-migrations"] as const;
const UI_PACKAGES = [
  "tailwindcss",
  "@tailwindcss/vite",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
] as const;

export interface AdonisGeneratorOptions {
  readonly runner?: CommandRunner;
  readonly nodeVersion?: string;
}

export class AdonisGenerator implements ApplicationGenerator {
  private readonly runner: CommandRunner;
  private readonly nodeVersion: string | undefined;

  constructor(options: AdonisGeneratorOptions = {}) {
    this.runner = options.runner ?? new SpawnRunner();
    this.nodeVersion = options.nodeVersion;
  }

  generate(
    input: GenerationInput,
  ): Promise<Result<GenerationResult, FdeaError>> {
    return generateInto(
      this.runner,
      this.nodeVersion ?? process.versions.node,
      input.outDir,
      (outDir) => this.run(input, outDir),
    );
  }

  private exec(
    step: string,
    cwd: string,
    command: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<string> {
    return execStep(this.runner, step, cwd, command, args, timeoutMs);
  }

  private async run(
    input: GenerationInput,
    outDir: string,
  ): Promise<GenerationResult> {
    const prototype = input.fidelity === "prototype";
    const name = basename(outDir);
    const scaffoldArgs = [
      "create",
      "adonisjs@latest",
      name,
      "--",
      ...SCAFFOLD_ARGS,
    ];
    await this.exec(
      "scaffold",
      dirname(outDir),
      "npm",
      scaffoldArgs,
      15 * MINUTE,
    );
    await this.exec(
      "install_ui_dependencies",
      outDir,
      "npm",
      ["install", "--save", ...UI_PACKAGES],
      10 * MINUTE,
    );
    if (!prototype) {
      await this.exec(
        "install_bouncer",
        outDir,
        "node",
        ["ace", "add", "@adonisjs/bouncer", "--package-manager=npm"],
        10 * MINUTE,
      );
      await this.exec(
        "install_mcp",
        outDir,
        "npm",
        ["install", "--save", "@jrmc/adonis-mcp"],
        10 * MINUTE,
      );
    }

    for (const path of KIT_FILES_TO_REMOVE) {
      await rm(join(outDir, path), { force: true });
    }
    if (prototype) {
      for (const path of PROTOTYPE_KIT_FILES_TO_REMOVE) {
        await rm(join(outDir, path), { force: true });
      }
    }
    const plan = buildPlan(input.model);
    const files = emitProject(input);
    await writeAll(outDir, files);

    if (prototype) {
      await ensureFixtureImport(outDir);
      await replaceRoutes(outDir, PROTOTYPE_ROUTES);
      await this.stripPrototypeDatabase(outDir);
      await this.exec(
        "codegen",
        outDir,
        "node",
        ["ace", "codegen"],
        5 * MINUTE,
      );
    } else {
      await appendFile(
        join(outDir, "start", "validator.ts"),
        validatorFieldNames(plan.entities),
      );
      await this.configureDatabase(input, outDir);

      // Defer MCP provider registration until after migrate: ace boots providers
      // during codegen/migrate, and MCP tools import models that extend
      // #database/schema classes produced by Lucid schemaGeneration on migrate.
      await this.exec(
        "codegen",
        outDir,
        "node",
        ["ace", "codegen"],
        5 * MINUTE,
      );
      await this.exec(
        "migrate",
        outDir,
        "node",
        ["ace", "migration:run"],
        5 * MINUTE,
      );
      await this.configureMcp(outDir);
      await appendFile(join(outDir, "start", "routes.ts"), `\n${MCP_ROUTE}`);
      await rm(join(outDir, "tmp", "db.sqlite3"), { force: true });
      await rm(join(outDir, "storage", "db.sqlite3"), { force: true });

      if (input.deployment === "cloud")
        await this.switchToPostgres(outDir, input.projectName);
    }

    const backlog = uiBacklog(plan);
    const limitations = prototype
      ? [
          "Prototype fidelity: lightweight Adonis + Vue gallery with mock fixtures. No database, process Lucid models, MCP, or RBAC.",
          "Invent each approach under inertia/pages/approaches/<id>/ from PROTOTYPE.md.",
          "When a winner is chosen, generate a foundation into a new empty directory.",
          "The design font is applied by name; web fonts are not bundled.",
        ]
      : [
          "Codegen emits the foundation only (data, HTTP, auth, MCP, design tokens, shell). Process Inertia pages are not generated — implement them from UI.md with full creative freedom.",
          "The foundation shell uses a light theme; process UI may change that.",
          "The design font is applied by name; web fonts are not bundled.",
          "Sign-up is closed; create users with `node ace user:create`.",
          "Agents authenticate to `/mcp` with a bearer access token from `node ace mcp:token`.",
          ...(input.rbac
            ? [
                "MCP tools enforce the same RBAC permissions as the UI through Bouncer policies.",
              ]
            : [
                "RBAC is off: every authenticated MCP token may call every process tool.",
              ]),
        ];
    if (
      !prototype &&
      input.deployment === "local" &&
      input.model.entities.some((entity) =>
        entity.fields.some((field) => field.type === "decimal"),
      )
    ) {
      limitations.push(
        "SQLite stores decimal values as floating-point numbers.",
      );
    }
    if (!prototype && input.deployment === "cloud") {
      limitations.push(
        "Schema classes were generated against SQLite; PostgreSQL was not run during generation.",
        "The PostgreSQL connection uses the DB_* variables without TLS options.",
      );
    }

    const format = await this.runner.run(
      "npx",
      [
        "prettier",
        "--write",
        "app",
        "commands",
        ...(prototype ? [] : ["database"]),
        "start",
        "inertia",
        "config",
      ],
      { cwd: outDir, timeoutMs: 5 * MINUTE },
    );
    if (format.code !== 0) {
      limitations.push(
        `Generated sources were not formatted: ${tail(format.output, 500)}`,
      );
    }

    const typecheck = await this.runner.run("npm", ["run", "typecheck"], {
      cwd: outDir,
      timeoutMs: 10 * MINUTE,
    });
    const passed = typecheck.code === 0 && !typecheck.timedOut;
    if (!passed) {
      limitations.push(
        "The generated application did not pass its TypeScript check; see verification output.",
      );
    }

    let built = true;
    let buildOutput = "";
    if (!prototype) {
      const build = await this.runner.run("node", ["ace", "build"], {
        cwd: outDir,
        timeoutMs: 10 * MINUTE,
      });
      built = build.code === 0 && !build.timedOut;
      buildOutput = build.output;
      await rm(join(outDir, "build"), { recursive: true, force: true });
      await rm(join(outDir, "public", "assets"), {
        recursive: true,
        force: true,
      });
      if (!built) {
        limitations.push(
          "The production build failed; see verification output.",
        );
      }
    }

    return {
      output_dir: outDir,
      generated_at: new Date().toISOString(),
      scaffold: {
        kit: "adonisjs/starter-kits inertia-vue",
        command: `npm ${scaffoldArgs.join(" ")}`,
      },
      fidelity: input.fidelity,
      stack: "fullstack",
      deployment: input.deployment,
      rbac: input.rbac,
      design_kind: input.design.kind,
      files: files.map((generated) => generated.path),
      ui_backlog: backlog.map((item) => ({
        page: item.page,
        route: item.route,
        purpose: item.purpose,
        props: [...item.props],
        ...(item.permission === undefined
          ? {}
          : { permission: item.permission }),
      })),
      verification: {
        typecheck: passed ? "passed" : "failed",
        build: prototype ? "passed" : built ? "passed" : "failed",
        ...(passed && (prototype || built)
          ? {}
          : {
              output: tail(passed ? buildOutput : typecheck.output, 6000),
            }),
      },
      limitations,
    };
  }

  private async configureMcp(outDir: string): Promise<void> {
    const rcPath = join(outDir, "adonisrc.ts");
    const patched = ensureMcpRc(await readFile(rcPath, "utf8"));
    if (patched === undefined) {
      throw new StepFailure(
        "configure_mcp",
        "adonisrc.ts has an unexpected shape after installing Bouncer",
      );
    }
    await writeFile(rcPath, patched);
  }

  private async stripPrototypeDatabase(outDir: string): Promise<void> {
    const rcPath = join(outDir, "adonisrc.ts");
    const patched = stripDatabaseFromAdonisRc(await readFile(rcPath, "utf8"));
    if (patched === undefined) {
      throw new StepFailure(
        "strip_database",
        "adonisrc.ts has an unexpected shape when removing Lucid and Auth",
      );
    }
    await writeFile(rcPath, patched);

    await rm(join(outDir, "config", "database.ts"), { force: true });
    await rm(join(outDir, "database"), { recursive: true, force: true });

    const envSchemaPath = join(outDir, "start", "env.ts");
    await writeFile(
      envSchemaPath,
      stripDatabaseEnvSchema(await readFile(envSchemaPath, "utf8")),
    );
    for (const envFile of [".env.example", ".env"]) {
      const path = join(outDir, envFile);
      const source = await readFile(path, "utf8").catch(() => undefined);
      if (source === undefined) continue;
      await writeFile(path, stripDatabaseEnvFile(source));
    }

    await this.exec(
      "remove_database_packages",
      outDir,
      "npm",
      ["uninstall", "--save", "@adonisjs/lucid", "better-sqlite3"],
      10 * MINUTE,
    );
  }

  private async configureDatabase(
    input: GenerationInput,
    outDir: string,
  ): Promise<void> {
    if (input.deployment !== "local") return;
    const configPath = join(outDir, "config", "database.ts");
    const patched = localDatabaseConfig(await readFile(configPath, "utf8"));
    if (patched === undefined) {
      throw new StepFailure(
        "configure_database",
        "the starter kit database configuration has an unexpected shape",
      );
    }
    await writeFile(configPath, patched);
    await mkdir(join(outDir, "storage"), { recursive: true });
    await writeFile(join(outDir, "storage", ".gitkeep"), "");
    const ignorePath = join(outDir, ".gitignore");
    await writeFile(
      ignorePath,
      gitignoreForLocal(await readFile(ignorePath, "utf8")),
    );
  }

  private async switchToPostgres(outDir: string, name: string): Promise<void> {
    await writeFile(
      join(outDir, "config", "database.ts"),
      cloudDatabaseConfig(),
    );
    const envSchemaPath = join(outDir, "start", "env.ts");
    const schema = cloudEnvSchema(await readFile(envSchemaPath, "utf8"));
    if (schema === undefined) {
      throw new StepFailure(
        "configure_database",
        "start/env.ts has an unexpected shape",
      );
    }
    await writeFile(envSchemaPath, schema);
    for (const envFile of [".env.example", ".env"]) {
      const path = join(outDir, envFile);
      const source = await readFile(path, "utf8").catch(() => undefined);
      if (source === undefined) continue;
      const updated = cloudEnvFile(source, databaseName(name));
      if (updated === undefined) {
        throw new StepFailure(
          "configure_database",
          `${envFile} has an unexpected shape`,
        );
      }
      await writeFile(path, updated);
    }
    await this.exec(
      "install_postgres",
      outDir,
      "npm",
      ["install", "--save", "pg"],
      10 * MINUTE,
    );
    await this.exec(
      "remove_sqlite",
      outDir,
      "npm",
      ["uninstall", "--save", "better-sqlite3"],
      10 * MINUTE,
    );
  }
}

const ensureFixtureImport = async (outDir: string): Promise<void> => {
  const packagePath = join(outDir, "package.json");
  const raw = await readFile(packagePath, "utf8");
  const pkg = JSON.parse(raw) as {
    imports?: Record<string, string>;
  };
  const imports = { ...pkg.imports };
  delete imports["#database/*"];
  imports["#fixtures/*"] = "./app/fixtures/*.js";
  pkg.imports = imports;
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
};

const replaceRoutes = async (
  outDir: string,
  contents: string,
): Promise<void> => {
  await writeFile(join(outDir, "start", "routes.ts"), contents);
};
