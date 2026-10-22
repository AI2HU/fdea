import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const PRODUCT_IDENTITY = {
  binary: "fdea",
  packageName: "fdea-agents",
  displayName: "Forward Deploy Engineering Anything",
  mcpServerName: "fdea",
  version: packageJson.version,
} as const;
