import { runCli } from "./cli.js";
import { createProductionService } from "./composition.js";

export const main = async (args: readonly string[]): Promise<number> => {
  if (args.length === 1 && (args[0] === "mcp" || args[0] === "--mcp")) {
    const { runMcpServer } = await import("./main.js");
    await runMcpServer();
    return 0;
  }
  let service: ReturnType<typeof createProductionService> | undefined;
  return runCli(args, {
    service: () => (service ??= createProductionService()),
    io: {
      stdout: (text) => void process.stdout.write(text),
      stderr: (text) => void process.stderr.write(text),
    },
    cwd: process.cwd(),
  });
};
