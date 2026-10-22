import { spawn } from "node:child_process";

export interface CommandResult {
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly output: string;
}

export interface CommandOptions {
  readonly cwd: string;
  readonly timeoutMs: number;
}

export interface CommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult>;
}

const OUTPUT_TAIL_BYTES = 16_000;
const ANSI = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`,
  "g",
);

export const tail = (text: string, bytes = OUTPUT_TAIL_BYTES): string =>
  text.length <= bytes ? text : `…${text.slice(text.length - bytes)}`;

export const cleanOutput = (text: string): string =>
  text.replace(ANSI, "").replace(/\r/g, "\n");

export class SpawnRunner implements CommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      let output = "";
      let timedOut = false;
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const append = (chunk: Buffer): void => {
        output = tail(output + chunk.toString("utf8"), OUTPUT_TAIL_BYTES * 2);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
      child.on("error", (cause) => {
        clearTimeout(timer);
        resolve({
          code: null,
          timedOut,
          output: `${output}\n${cause.message}`,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, timedOut, output: tail(cleanOutput(output)) });
      });
    });
  }
}
