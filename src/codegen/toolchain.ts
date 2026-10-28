import { err, ok, type FdeaError, type Result } from "../domain/result.js";
import type { CommandRunner } from "./runner.js";

export const MIN_NODE = [24, 11, 0] as const;
export const MIN_NPM = [10, 0, 0] as const;

const parse = (version: string): number[] | undefined => {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
  return match === null
    ? undefined
    : [Number(match[1]), Number(match[2]), Number(match[3])];
};

export const atLeast = (
  version: string,
  minimum: readonly number[],
): boolean => {
  const parsed = parse(version);
  if (parsed === undefined) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    const actual = parsed[index] ?? 0;
    const required = minimum[index] ?? 0;
    if (actual !== required) return actual > required;
  }
  return true;
};

export interface Toolchain {
  readonly node: string;
  readonly npm: string;
}

export const checkToolchain = async (
  runner: CommandRunner,
  cwd: string,
  nodeVersion: string = process.versions.node,
): Promise<Result<Toolchain, FdeaError>> => {
  if (!atLeast(nodeVersion, MIN_NODE)) {
    return err({
      tag: "toolchain_unsupported",
      message: `Node.js ${MIN_NODE.join(".")} or newer is required to generate an application; found ${nodeVersion}.`,
    });
  }
  const npm = await runner.run("npm", ["--version"], {
    cwd,
    timeoutMs: 30_000,
  });
  const npmVersion = npm.output.trim().split("\n").at(-1) ?? "";
  if (npm.code !== 0 || !atLeast(npmVersion, MIN_NPM)) {
    return err({
      tag: "toolchain_unsupported",
      message: `npm ${MIN_NPM.join(".")} or newer is required; ${npm.code === 0 ? `found ${npmVersion}` : "npm was not found on PATH"}.`,
    });
  }
  return ok({ node: nodeVersion, npm: npmVersion });
};
