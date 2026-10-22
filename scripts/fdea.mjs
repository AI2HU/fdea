#!/usr/bin/env node

import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(packageRoot, "dist", "bin.js");

try {
  await access(entry);
} catch {
  process.stderr.write(
    `FDEA's compiled runtime is missing. Run \`npm ci && npm run build\` in ${packageRoot}, or reinstall fdea-agents.\n`,
  );
  process.exit(1);
}

const { main } = await import(entry);
process.exitCode = await main(args);
