import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type {
  ApplicationGenerator,
  GenerationInput,
} from "../../application/ports.js";
import type { GenerationResult } from "../../contracts/project.js";
import type { FdeaError, Result } from "../../domain/result.js";
import { buildPlan } from "../adonis/plan.js";
import { SpawnRunner, tail, type CommandRunner } from "../runner.js";
import {
  execStep,
  generateInto,
  MINUTE,
  StepFailure,
  writeAll,
} from "../workspace.js";
import { emitSite, staticBacklog, unsupportedOperations } from "./emitSite.js";
import { astroConfig, astroPackageJson, astroTsconfig } from "./kit.js";

const SCAFFOLD_ARGS = [
  "--template",
  "minimal",
  "--install",
  "--no-git",
  "--skip-houston",
  "--yes",
] as const;
const PACKAGES = [
  "@astrojs/vue",
  "vue",
  "tailwindcss",
  "@tailwindcss/vite",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
] as const;
const DEV_PACKAGES = ["@astrojs/check", "typescript", "vue-tsc"] as const;

export interface AstroGeneratorOptions {
  readonly runner?: CommandRunner;
  readonly nodeVersion?: string;
}

export class AstroGenerator implements ApplicationGenerator {
  private readonly runner: CommandRunner;
  private readonly nodeVersion: string | undefined;

  constructor(options: AstroGeneratorOptions = {}) {
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

  private async patch(
    outDir: string,
    path: string,
    transform: (source: string) => string | undefined,
  ): Promise<void> {
    const target = join(outDir, path);
    const patched = transform(await readFile(target, "utf8"));
    if (patched === undefined) {
      throw new StepFailure(
        "configure_astro",
        `the Astro starter ${path} has an unexpected shape`,
      );
    }
    await writeFile(target, patched);
  }

  private async run(
    input: GenerationInput,
    outDir: string,
  ): Promise<GenerationResult> {
    const scaffoldArgs = [
      "create",
      "astro@latest",
      basename(outDir),
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
      ["install", "--save", ...PACKAGES],
      10 * MINUTE,
    );
    await this.exec(
      "install_check_dependencies",
      outDir,
      "npm",
      ["install", "--save-dev", ...DEV_PACKAGES],
      10 * MINUTE,
    );
    await this.patch(outDir, "astro.config.mjs", astroConfig);
    await this.patch(outDir, "tsconfig.json", astroTsconfig);
    await this.patch(outDir, "package.json", astroPackageJson);

    const files = emitSite(input);
    await writeAll(outDir, files);

    const plan = buildPlan(input.model);
    const unsupported = unsupportedOperations(plan);
    const limitations = [
      "Static stack: no server, database, auth, RBAC or MCP. Records live in src/data/*.json, validated by content collections at build time.",
      "Codegen emits the foundation only (content schema, design tokens, layout). Process pages are not generated — implement them from UI.md.",
      "The design font is applied by name; web fonts are not bundled.",
      ...(unsupported.length === 0
        ? []
        : [
            `A static site cannot persist the process writes (${unsupported.join(", ")}); choose the fullstack stack if they are required.`,
          ]),
      ...(input.mockData === undefined
        ? []
        : [
            "Prototype: src/data/*.json holds mock data only; every record is fictional.",
          ]),
    ];

    const typecheck = await this.runner.run("npm", ["run", "typecheck"], {
      cwd: outDir,
      timeoutMs: 10 * MINUTE,
    });
    const passed = typecheck.code === 0 && !typecheck.timedOut;
    if (!passed) {
      limitations.push(
        "The generated site did not pass its type check; see verification output.",
      );
    }

    const build = await this.runner.run("npm", ["run", "build"], {
      cwd: outDir,
      timeoutMs: 10 * MINUTE,
    });
    const built = build.code === 0 && !build.timedOut;
    await rm(join(outDir, "dist"), { recursive: true, force: true });
    if (!built) {
      limitations.push("The static build failed; see verification output.");
    }

    const backlog = staticBacklog(plan);
    return {
      output_dir: outDir,
      generated_at: new Date().toISOString(),
      scaffold: {
        kit: "withastro/astro minimal + @astrojs/vue",
        command: `npm ${scaffoldArgs.join(" ")}`,
      },
      fidelity: input.fidelity,
      stack: "static",
      deployment: "none",
      rbac: false,
      mcp: false,
      design_kind: input.design.kind,
      files: files.map((generated) => generated.path),
      ui_backlog: backlog.map((item) => ({
        page: item.page,
        route: item.route,
        purpose: item.purpose,
        props: [...item.props],
      })),
      verification: {
        typecheck: passed ? "passed" : "failed",
        build: built ? "passed" : "failed",
        ...(passed && built
          ? {}
          : { output: tail(passed ? build.output : typecheck.output, 6000) }),
      },
      limitations,
    };
  }
}
