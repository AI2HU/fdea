import { isAbsolute, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Command, InvalidArgumentError } from "commander";
import type { FdeaService } from "./application/FdeaService.js";
import { callTool } from "./application/tools.js";
import { TOOL_DESCRIPTIONS } from "./contracts/toolDescriptions.js";
import type { ToolName } from "./contracts/tools.js";
import { messageOf } from "./domain/result.js";
import { PRODUCT_IDENTITY } from "./identity.js";
import { runDoctor, runSetup } from "./setup/commands.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliDeps {
  readonly service: () => FdeaService;
  readonly io: CliIo;
  readonly cwd: string;
}

const readJsonFile = async (path: string, cwd: string): Promise<unknown> => {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  try {
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch (cause) {
    throw new InvalidArgumentError(
      `Cannot read JSON from ${absolute}: ${messageOf(cause)}`,
    );
  }
};

const parseInteger = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("expected a non-negative integer");
  }
  return parsed;
};

export const runCli = async (
  argv: readonly string[],
  deps: CliDeps,
): Promise<number> => {
  let exitCode = 0;
  const emit = (value: unknown, compact: boolean): void => {
    deps.io.stdout(`${JSON.stringify(value, null, compact ? undefined : 2)}\n`);
  };
  const run = async (
    tool: ToolName,
    input: unknown,
    compact: boolean,
  ): Promise<void> => {
    const result = await callTool(deps.service(), tool, input);
    if (result.ok) {
      emit(result.value, compact);
    } else {
      exitCode = 1;
      deps.io.stderr(
        `${JSON.stringify({ error: result.error }, null, compact ? undefined : 2)}\n`,
      );
    }
  };
  const describe = (tool: ToolName): string =>
    TOOL_DESCRIPTIONS[tool].description;

  const program = new Command()
    .name(PRODUCT_IDENTITY.binary)
    .description(PRODUCT_IDENTITY.displayName)
    .version(PRODUCT_IDENTITY.version)
    .option("--json", "print compact single-line JSON")
    .exitOverride()
    .configureOutput({
      writeOut: deps.io.stdout,
      writeErr: deps.io.stderr,
    });
  const compact = (): boolean =>
    program.opts<{ json?: boolean }>().json === true;

  program
    .command(TOOL_DESCRIPTIONS.create_project.cli)
    .description(describe("create_project"))
    .argument("<name>", "name of the software")
    .requiredOption("--out <dir>", "directory to generate into")
    .action(async (name: string, options: { out: string }) => {
      await run(
        "create_project",
        { name, out_dir: resolve(deps.cwd, options.out) },
        compact(),
      );
    });

  program
    .command(TOOL_DESCRIPTIONS.ingest_source.cli)
    .description(describe("ingest_source"))
    .argument("<project_id>")
    .argument("<source>", "URL or file path")
    .option("--role <role>", "process or design", "process")
    .action(
      async (projectId: string, source: string, options: { role: string }) => {
        const isUrl = /^https?:\/\//i.test(source);
        await run(
          "ingest_source",
          {
            project_id: projectId,
            ...(isUrl ? { url: source } : { path: resolve(deps.cwd, source) }),
            role: options.role,
          },
          compact(),
        );
      },
    );

  program
    .command(TOOL_DESCRIPTIONS.list_sources.cli)
    .description(describe("list_sources"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("list_sources", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.read_source.cli)
    .description(describe("read_source"))
    .argument("<project_id>")
    .argument("<source_id>")
    .option("--offset <n>", "character offset", parseInteger)
    .option("--limit <n>", "maximum characters", parseInteger)
    .action(
      async (
        projectId: string,
        sourceId: string,
        options: { offset?: number; limit?: number },
      ) =>
        run(
          "read_source",
          { project_id: projectId, source_id: sourceId, ...options },
          compact(),
        ),
    );

  program
    .command(TOOL_DESCRIPTIONS.submit_opportunity_map.cli)
    .description(describe("submit_opportunity_map"))
    .argument("<project_id>")
    .argument("<map.json>", "file containing the opportunity map")
    .action(async (projectId: string, file: string) =>
      run(
        "submit_opportunity_map",
        { project_id: projectId, map: await readJsonFile(file, deps.cwd) },
        compact(),
      ),
    );

  program
    .command(TOOL_DESCRIPTIONS.get_opportunity_ranking.cli)
    .description(describe("get_opportunity_ranking"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("get_opportunity_ranking", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.select_opportunity.cli)
    .description(describe("select_opportunity"))
    .argument("<project_id>")
    .argument("<opportunity_id>")
    .action(async (projectId: string, opportunityId: string) =>
      run(
        "select_opportunity",
        { project_id: projectId, opportunity_id: opportunityId },
        compact(),
      ),
    );

  program
    .command(TOOL_DESCRIPTIONS.get_process_model.cli)
    .description(describe("get_process_model"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("get_process_model", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.submit_process_model.cli)
    .description(describe("submit_process_model"))
    .argument("<project_id>")
    .argument("<model.json>", "file containing the process model")
    .action(async (projectId: string, file: string) =>
      run(
        "submit_process_model",
        { project_id: projectId, model: await readJsonFile(file, deps.cwd) },
        compact(),
      ),
    );

  program
    .command(TOOL_DESCRIPTIONS.list_clarifications.cli)
    .description(describe("list_clarifications"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("list_clarifications", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.answer_clarifications.cli)
    .description(describe("answer_clarifications"))
    .argument("<project_id>")
    .argument("<answers...>", "id=answer pairs")
    .action(async (projectId: string, pairs: string[]) => {
      const answers = pairs.map((pair) => {
        const split = pair.indexOf("=");
        if (split < 1)
          throw new InvalidArgumentError(`Expected id=answer, got ${pair}`);
        return { id: pair.slice(0, split), answer: pair.slice(split + 1) };
      });
      await run(
        "answer_clarifications",
        { project_id: projectId, answers },
        compact(),
      );
    });

  program
    .command(TOOL_DESCRIPTIONS.set_implementation_directives.cli)
    .description(describe("set_implementation_directives"))
    .argument("<project_id>")
    .option("--fidelity <kind>", "foundation or prototype")
    .option("--stack <kind>", "fullstack or static")
    .option("--prototype-variants <n>", "number of prototype approaches (2-5)")
    .option("--rbac", "the application requires RBAC")
    .option("--no-rbac", "the application does not require RBAC")
    .option("--deployment <kind>", "cloud or local")
    .action(
      async (
        projectId: string,
        options: {
          fidelity?: string;
          stack?: string;
          prototypeVariants?: string;
          rbac?: boolean;
          deployment?: string;
        },
      ) =>
        run(
          "set_implementation_directives",
          {
            project_id: projectId,
            ...(options.fidelity === undefined
              ? {}
              : { fidelity: options.fidelity }),
            ...(options.stack === undefined ? {} : { stack: options.stack }),
            ...(options.prototypeVariants === undefined
              ? {}
              : {
                  prototype_variants: Number.parseInt(
                    options.prototypeVariants,
                    10,
                  ),
                }),
            ...(options.rbac === undefined ? {} : { rbac: options.rbac }),
            ...(options.deployment === undefined
              ? {}
              : { deployment: options.deployment }),
          },
          compact(),
        ),
    );

  program
    .command(TOOL_DESCRIPTIONS.get_design_spec.cli)
    .description(describe("get_design_spec"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("get_design_spec", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.submit_design_spec.cli)
    .description(describe("submit_design_spec"))
    .argument("<project_id>")
    .argument("<design.json>", "file containing tokens and provenance")
    .action(async (projectId: string, file: string) =>
      run(
        "submit_design_spec",
        { project_id: projectId, design: await readJsonFile(file, deps.cwd) },
        compact(),
      ),
    );

  program
    .command(TOOL_DESCRIPTIONS.get_database_schema.cli)
    .description(describe("get_database_schema"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("get_database_schema", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.approve_database_schema.cli)
    .description(describe("approve_database_schema"))
    .argument("<project_id>")
    .option("--yes", "record that the user approved the schema")
    .option("--no", "record that the user rejected the schema")
    .action(
      async (projectId: string, options: { yes?: boolean; no?: boolean }) => {
        if (options.yes === true && options.no === true) {
          throw new InvalidArgumentError("Pass either --yes or --no");
        }
        if (options.yes !== true && options.no !== true) {
          throw new InvalidArgumentError("Pass --yes or --no");
        }
        await run(
          "approve_database_schema",
          { project_id: projectId, approved: options.yes === true },
          compact(),
        );
      },
    );

  program
    .command(TOOL_DESCRIPTIONS.generate_application.cli)
    .description(describe("generate_application"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("generate_application", { project_id: projectId }, compact()),
    );

  program
    .command(TOOL_DESCRIPTIONS.project_status.cli)
    .description(describe("project_status"))
    .argument("<project_id>")
    .action(async (projectId: string) =>
      run("project_status", { project_id: projectId }, compact()),
    );

  program
    .command("setup")
    .description(
      "Register FDEA's MCP server and skill with your agents. Shows the plan and asks before writing.",
    )
    .option("--client <id...>", "agent client ids (default: all detected)")
    .option("--dry-run", "print the plan without writing")
    .option("--yes", "apply the plan without prompting")
    .action(
      async (options: {
        client?: string[];
        dryRun?: boolean;
        yes?: boolean;
      }) => {
        exitCode = await runSetup(options, deps.io);
      },
    );

  program
    .command("doctor")
    .description("Check the toolchain and each agent's FDEA registration.")
    .option("--client <id...>", "agent client ids (default: all)")
    .action(async (options: { client?: string[] }) => {
      exitCode = await runDoctor(options, deps.io);
    });

  try {
    await program.parseAsync(["node", PRODUCT_IDENTITY.binary, ...argv]);
  } catch (cause) {
    const code = (cause as { exitCode?: number }).exitCode;
    if (code !== undefined) return code;
    deps.io.stderr(`${messageOf(cause)}\n`);
    return 1;
  }
  return exitCode;
};
