import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { checkToolchain } from "../codegen/adonis/toolchain.js";
import { SpawnRunner } from "../codegen/adonis/runner.js";
import { PRODUCT_IDENTITY } from "../identity.js";
import {
  clientSpecs,
  defaultEnvironment,
  isClientId,
  type ClientEnvironment,
  type ClientSpec,
} from "./clients.js";

export interface SetupIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface SetupDeps {
  readonly environment?: ClientEnvironment;
  readonly confirm?: (question: string) => Promise<boolean>;
  readonly packageRoot?: string;
  readonly interactive?: boolean;
}

export interface SetupOptions {
  readonly client?: string[] | undefined;
  readonly dryRun?: boolean | undefined;
  readonly yes?: boolean | undefined;
}

const SERVER_KEY = "fdea";
const SKILL_NAME = "forward-deploy-engineering-anything";

const defaultPackageRoot = (): string =>
  fileURLToPath(new URL("../../", import.meta.url));

const serverEntry = (
  packageRoot: string,
): { command: string; args: string[] } => ({
  command: process.execPath,
  args: [join(packageRoot, "scripts", "fdea.mjs"), "mcp"],
});

const exists = async (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

type Json = Record<string, unknown>;

type ConfigRead =
  | { readonly kind: "absent" }
  | { readonly kind: "invalid"; readonly reason: string }
  | { readonly kind: "ok"; readonly value: Json };

const readConfig = async (path: string): Promise<ConfigRead> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT")
      return { kind: "absent" };
    return { kind: "invalid", reason: "cannot be read" };
  }
  if (text.trim() === "") return { kind: "ok", value: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { kind: "invalid", reason: "is not a JSON object" };
    }
    return { kind: "ok", value: parsed as Json };
  } catch {
    return { kind: "invalid", reason: "is not valid JSON" };
  }
};

const sameEntry = (
  current: unknown,
  expected: { command: string; args: string[] },
): boolean =>
  typeof current === "object" &&
  current !== null &&
  JSON.stringify((current as Json)["command"]) ===
    JSON.stringify(expected.command) &&
  JSON.stringify((current as Json)["args"]) === JSON.stringify(expected.args);

type ConfigAction = "add" | "update" | "unchanged" | "invalid";
type SkillAction = "add" | "update" | "unchanged" | "none";

interface ClientPlan {
  readonly spec: ClientSpec;
  readonly config: ConfigAction;
  readonly configNote?: string;
  readonly skill: SkillAction;
  readonly existingConfig?: Json;
}

const skillSource = (packageRoot: string): string =>
  join(packageRoot, "skills", SKILL_NAME, "SKILL.md");

const skillTarget = (spec: ClientSpec): string | undefined =>
  spec.skillsDir === undefined
    ? undefined
    : join(spec.skillsDir, SKILL_NAME, "SKILL.md");

const planClient = async (
  spec: ClientSpec,
  packageRoot: string,
): Promise<ClientPlan> => {
  const entry = serverEntry(packageRoot);
  const read = await readConfig(spec.configPath);
  let config: ConfigAction;
  let note: string | undefined;
  let existing: Json | undefined;
  if (read.kind === "invalid") {
    config = "invalid";
    note = `${spec.configPath} ${read.reason}; it was left untouched`;
  } else if (read.kind === "absent") {
    config = "add";
  } else {
    existing = read.value;
    const servers = read.value["mcpServers"];
    if (
      servers !== undefined &&
      (typeof servers !== "object" ||
        servers === null ||
        Array.isArray(servers))
    ) {
      config = "invalid";
      note = `mcpServers in ${spec.configPath} is not an object; it was left untouched`;
    } else {
      const current = (servers as Json | undefined)?.[SERVER_KEY];
      config =
        current === undefined
          ? "add"
          : sameEntry(current, entry)
            ? "unchanged"
            : "update";
    }
  }

  const target = skillTarget(spec);
  let skill: SkillAction = "none";
  if (target !== undefined && (await exists(skillSource(packageRoot)))) {
    const installed = await readFile(target, "utf8").catch(() => undefined);
    const source = await readFile(skillSource(packageRoot), "utf8");
    skill =
      installed === undefined
        ? "add"
        : installed === source
          ? "unchanged"
          : "update";
  }
  return {
    spec,
    config,
    skill,
    ...(note === undefined ? {} : { configNote: note }),
    ...(existing === undefined ? {} : { existingConfig: existing }),
  };
};

const timestamp = (): string =>
  new Date().toISOString().replaceAll(/[:.]/g, "-");

const backup = async (
  path: string,
  stamp: string,
): Promise<string | undefined> => {
  if (!(await exists(path))) return undefined;
  const target = `${path}.fdea-backup-${stamp}`;
  await copyFile(path, target);
  return target;
};

const describe = (plan: ClientPlan): string[] => {
  const lines: string[] = [];
  const { spec } = plan;
  if (plan.config === "invalid")
    lines.push(`  skip   ${plan.configNote ?? spec.configPath}`);
  else if (plan.config === "unchanged")
    lines.push(`  ok     ${spec.configPath} already registers ${SERVER_KEY}`);
  else {
    lines.push(
      `  ${plan.config === "add" ? "add   " : "update"} ${SERVER_KEY} MCP server in ${spec.configPath}`,
    );
  }
  const target = skillTarget(spec);
  if (target !== undefined && plan.skill !== "none") {
    lines.push(
      plan.skill === "unchanged"
        ? `  ok     skill already installed at ${target}`
        : `  ${plan.skill === "add" ? "add   " : "update"} skill at ${target}`,
    );
  }
  return lines;
};

const defaultConfirm = async (question: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
};

const selectClients = (
  specs: readonly ClientSpec[],
  requested: readonly string[] | undefined,
  io: SetupIo,
): Promise<ClientSpec[] | undefined> =>
  (async () => {
    if (requested !== undefined && requested.length > 0) {
      const unknown = requested.filter((id) => !isClientId(id));
      if (unknown.length > 0) {
        io.stderr(
          `Unknown client: ${unknown.join(", ")}. Known: ${specs.map((spec) => spec.id).join(", ")}\n`,
        );
        return undefined;
      }
      return specs.filter((spec) => requested.includes(spec.id));
    }
    const detected: ClientSpec[] = [];
    for (const spec of specs) {
      if (await exists(dirname(spec.configPath))) detected.push(spec);
    }
    return detected;
  })();

export const runSetup = async (
  options: SetupOptions,
  io: SetupIo,
  deps: SetupDeps = {},
): Promise<number> => {
  const environment = deps.environment ?? defaultEnvironment();
  const packageRoot = deps.packageRoot ?? defaultPackageRoot();
  const selected = await selectClients(
    clientSpecs(environment),
    options.client,
    io,
  );
  if (selected === undefined) return 1;
  if (selected.length === 0) {
    io.stdout(
      "No supported agent client was detected. Pass --client <id> to choose one.\n",
    );
    return 0;
  }

  const plans = await Promise.all(
    selected.map((spec) => planClient(spec, packageRoot)),
  );
  io.stdout(
    `FDEA setup plan (${PRODUCT_IDENTITY.binary} ${PRODUCT_IDENTITY.version})\n`,
  );
  for (const plan of plans) {
    io.stdout(`${plan.spec.label}\n${describe(plan).join("\n")}\n`);
  }
  const pending = plans.filter(
    (plan) =>
      plan.config === "add" ||
      plan.config === "update" ||
      plan.skill === "add" ||
      plan.skill === "update",
  );
  if (pending.length === 0) {
    io.stdout("Nothing to change.\n");
    return plans.some((plan) => plan.config === "invalid") ? 1 : 0;
  }
  if (options.dryRun === true) {
    io.stdout("Dry run: nothing was written.\n");
    return 0;
  }
  if (options.yes !== true) {
    const interactive = deps.interactive ?? Boolean(process.stdin.isTTY);
    if (!interactive && deps.confirm === undefined) {
      io.stderr(
        "Refusing to write without approval. Re-run with --yes, or in a terminal.\n",
      );
      return 1;
    }
    const approved = await (deps.confirm ?? defaultConfirm)(
      "Apply these changes?",
    );
    if (!approved) {
      io.stdout("Cancelled. Nothing was written.\n");
      return 0;
    }
  }

  const stamp = timestamp();
  const entry = serverEntry(packageRoot);
  for (const plan of pending) {
    const { spec } = plan;
    if (plan.config === "add" || plan.config === "update") {
      const saved = await backup(spec.configPath, stamp);
      const document = plan.existingConfig ?? {};
      const servers = (document["mcpServers"] as Json | undefined) ?? {};
      const next = {
        ...document,
        mcpServers: { ...servers, [SERVER_KEY]: entry },
      };
      await mkdir(dirname(spec.configPath), { recursive: true });
      await writeFile(spec.configPath, `${JSON.stringify(next, null, 2)}\n`);
      io.stdout(
        `Wrote ${spec.configPath}${saved === undefined ? "" : ` (backup: ${saved})`}\n`,
      );
    }
    const target = skillTarget(spec);
    if (
      target !== undefined &&
      (plan.skill === "add" || plan.skill === "update")
    ) {
      const saved = await backup(target, stamp);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(skillSource(packageRoot), target);
      io.stdout(
        `Wrote ${target}${saved === undefined ? "" : ` (backup: ${saved})`}\n`,
      );
    }
  }
  return plans.some((plan) => plan.config === "invalid") ? 1 : 0;
};

export const runDoctor = async (
  options: { client?: string[] | undefined },
  io: SetupIo,
  deps: SetupDeps = {},
): Promise<number> => {
  const environment = deps.environment ?? defaultEnvironment();
  const packageRoot = deps.packageRoot ?? defaultPackageRoot();
  let failed = false;

  const toolchain = await checkToolchain(new SpawnRunner(), process.cwd());
  if (toolchain.ok) {
    io.stdout(
      `ok      node ${toolchain.value.node}, npm ${toolchain.value.npm}\n`,
    );
  } else {
    failed = true;
    io.stdout(`fail    ${toolchain.error.message}\n`);
  }

  const entryPoint = join(packageRoot, "scripts", "fdea.mjs");
  const built = await exists(join(packageRoot, "dist", "bin.js"));
  io.stdout(
    `${built ? "ok     " : "fail   "} build output ${built ? "present" : "missing; run npm run build"}\n`,
  );
  if (!built) failed = true;

  const specs = clientSpecs(environment).filter(
    (spec) =>
      options.client === undefined ||
      options.client.length === 0 ||
      options.client.includes(spec.id),
  );
  for (const spec of specs) {
    const plan = await planClient(spec, packageRoot);
    const state =
      plan.config === "unchanged"
        ? "registered"
        : plan.config === "invalid"
          ? "config unreadable"
          : plan.config === "update"
            ? "registered with a different command; run setup"
            : (await exists(spec.configPath))
              ? "not registered; run setup"
              : "not configured";
    io.stdout(
      `${plan.config === "unchanged" ? "ok     " : "info   "} ${spec.label}: ${state}\n`,
    );
    if (plan.config === "invalid") failed = true;
  }
  io.stdout(`entry   ${entryPoint}\n`);
  return failed ? 1 : 0;
};
