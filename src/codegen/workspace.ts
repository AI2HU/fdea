import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { GenerationResult } from "../contracts/project.js";
import {
  err,
  messageOf,
  ok,
  type FdeaError,
  type Result,
} from "../domain/result.js";
import type { GeneratedFile } from "./files.js";
import type { CommandRunner } from "./runner.js";
import { checkToolchain } from "./toolchain.js";

export const MINUTE = 60_000;

export class StepFailure extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly output?: string,
  ) {
    super(message);
  }
}

export const execStep = async (
  runner: CommandRunner,
  step: string,
  cwd: string,
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<string> => {
  const result = await runner.run(command, args, { cwd, timeoutMs });
  if (result.timedOut) throw new StepFailure(step, "timed out", result.output);
  if (result.code !== 0) {
    throw new StepFailure(
      step,
      `exit code ${result.code ?? "none"}`,
      result.output,
    );
  }
  return result.output;
};

const outputState = async (
  outDir: string,
): Promise<"absent" | "empty" | "occupied" | "unreadable"> => {
  try {
    const entries = await readdir(outDir);
    return entries.length === 0 ? "empty" : "occupied";
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    return code === "ENOENT" ? "absent" : "unreadable";
  }
};

/**
 * Checks the toolchain and that the output directory is absent or empty, runs
 * the generation, and removes the partial output when it fails.
 */
export const generateInto = async (
  runner: CommandRunner,
  nodeVersion: string,
  requestedOutDir: string,
  work: (outDir: string) => Promise<GenerationResult>,
): Promise<Result<GenerationResult, FdeaError>> => {
  const outDir = resolve(requestedOutDir);
  const parent = dirname(outDir);
  await mkdir(parent, { recursive: true }).catch(() => undefined);

  const toolchain = await checkToolchain(runner, parent, nodeVersion);
  if (!toolchain.ok) return toolchain;

  const state = await outputState(outDir);
  if (state === "occupied") {
    return err({
      tag: "output_not_empty",
      message: `The output directory ${outDir} exists and is not empty. Choose an empty or new directory.`,
    });
  }
  if (state === "unreadable") {
    return err({
      tag: "storage_failure",
      message: `The output directory ${outDir} cannot be inspected.`,
    });
  }
  await mkdir(outDir, { recursive: true });

  try {
    return ok(await work(outDir));
  } catch (cause) {
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
    if (cause instanceof StepFailure) {
      return err({
        tag: "generation_failed",
        step: cause.step,
        message: `${cause.step} failed: ${cause.message}. The partial output was removed.`,
        ...(cause.output === undefined ? {} : { output: cause.output }),
      });
    }
    return err({
      tag: "generation_failed",
      step: "unknown",
      message: messageOf(cause),
    });
  }
};

export const writeAll = async (
  outDir: string,
  files: readonly GeneratedFile[],
): Promise<void> => {
  for (const generated of files) {
    const target = join(outDir, generated.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, generated.contents);
  }
};
