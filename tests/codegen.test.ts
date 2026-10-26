import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GenerationInput } from "../src/application/ports.js";
import { AdonisGenerator } from "../src/codegen/adonis/AdonisGenerator.js";
import { emitProject } from "../src/codegen/adonis/emitProject.js";
import type {
  CommandResult,
  CommandRunner,
} from "../src/codegen/adonis/runner.js";
import { atLeast } from "../src/codegen/adonis/toolchain.js";
import { SHADCN_DEFAULT_TOKENS } from "../src/design/infer.js";
import { purchaseModel } from "./fixtures.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "fdea-codegen-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const inputFor = (
  overrides: Partial<GenerationInput> = {},
): GenerationInput => ({
  projectName: "Buy Desk",
  outDir: overrides.outDir ?? join(root, "out"),
  model: purchaseModel("src_01"),
  fidelity: "foundation",
  prototypeVariants: 3,
  rbac: true,
  deployment: "cloud",
  design: {
    kind: "shadcn_default",
    tokens: SHADCN_DEFAULT_TOKENS,
    provenance: [],
  },
  ...overrides,
});

const contentsOf = (
  files: ReturnType<typeof emitProject>,
  path: string,
): string => {
  const found = files.find((file) => file.path === path);
  if (found === undefined) throw new Error(`missing ${path}`);
  return found.contents;
};

describe("emitted application", () => {
  const files = emitProject(inputFor({ outDir: "/unused" }));

  it("grants each actor only the permissions of its steps", () => {
    const seeder = contentsOf(files, "database/seeders/access_seeder.ts");
    expect(seeder).toContain(
      '{ slug: "approver", name: "Approver", permissions: ["purchase_request.approve_request", "purchase_request.list"] }',
    );
    expect(seeder).toContain(
      '"supplier.create", "supplier.list", "supplier.update"',
    );
  });

  it("guards every controller action with its policy", () => {
    const controller = contentsOf(
      files,
      "app/controllers/purchase_requests_controller.ts",
    );
    expect(controller).toContain(
      'bouncer.with(PurchaseRequestPolicy).authorize("approve_request")',
    );
    expect(controller).toContain(
      'bouncer.with(PurchaseRequestPolicy).authorize("create")',
    );
    expect(controller).not.toContain('authorize("delete")');
  });

  it("sets the initial state and keeps the state field out of validators", () => {
    const controller = contentsOf(
      files,
      "app/controllers/purchase_requests_controller.ts",
    );
    expect(controller).toContain('status: "pending"');
    expect(
      contentsOf(files, "app/validators/purchase_request.ts"),
    ).not.toContain("status:");
  });

  it("emits a UI contract instead of process pages", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toContain("UI.md");
    expect(paths).not.toContain("inertia/pages/purchase_requests/index.vue");
    expect(paths).not.toContain(
      "inertia/components/forms/purchase_request_fields.vue",
    );
    const contract = contentsOf(files, "UI.md");
    expect(contract).toContain("purchase_requests/index");
    expect(contract).toContain("purchase_requests.store");
  });

  it("emits a lightweight Vue prototype gallery without Lucid process models", () => {
    const proto = emitProject(
      inputFor({ fidelity: "prototype", rbac: false, deployment: "none" }),
    );
    const paths = proto.map((file) => file.path);
    expect(paths).toContain("PROTOTYPE.md");
    expect(paths).toContain("app/fixtures/process.ts");
    expect(paths).toContain("inertia/pages/approaches/index.vue");
    expect(paths).toContain("inertia/pages/approaches/a/home.vue");
    expect(paths).toContain("start/kernel.ts");
    expect(paths).not.toContain("UI.md");
    expect(paths).not.toContain("inertia/pages/auth/login.vue");
    expect(paths).not.toContain("config/database.ts");
    expect(paths.some((path) => path.startsWith("app/mcp/"))).toBe(false);
    expect(
      paths.some((path) => path.includes("purchase_requests_controller")),
    ).toBe(false);
    expect(contentsOf(proto, "start/kernel.ts")).not.toContain("auth");
    expect(contentsOf(proto, "PROTOTYPE.md")).toContain("No database");
  });

  it("only registers routes for operations the process performs", () => {
    const routes = contentsOf(files, "start/routes.ts");
    expect(routes).toContain('"/purchase-requests/:id/approve-request"');
    expect(routes).not.toMatch(/router\.delete/);
  });

  it("emits no access-control files without RBAC", () => {
    const plain = emitProject(inputFor({ rbac: false }));
    const paths = plain.map((file) => file.path);
    expect(paths.some((path) => path.startsWith("app/policies/"))).toBe(false);
    expect(paths).not.toContain("database/seeders/access_seeder.ts");
    expect(
      contentsOf(plain, "app/controllers/purchase_requests_controller.ts"),
    ).not.toContain("bouncer");
  });

  it("emits an MCP server whose tools reuse RBAC permissions", () => {
    const paths = files.map((file) => file.path);
    expect(paths).toContain("app/mcp/tools/purchase_request_create_tool.ts");
    expect(paths).toContain(
      "app/mcp/tools/purchase_request_approve_request_tool.ts",
    );
    expect(paths).toContain("app/mcp/tools/list_allowed_tools_tool.ts");
    expect(paths).toContain("commands/mcp_token.ts");
    expect(
      contentsOf(files, "app/mcp/tools/purchase_request_create_tool.ts"),
    ).toContain('bouncer.with(PurchaseRequestPolicy).authorize("create")');
    expect(contentsOf(files, "app/models/user.ts")).toContain("accessTokens");
  });

  it("carries the design tokens into the stylesheet", () => {
    const tokens = {
      ...SHADCN_DEFAULT_TOKENS,
      primary: "#0f766e",
      radius: "0.5rem",
    };
    const themed = emitProject(
      inputFor({ design: { kind: "inferred", tokens, provenance: [] } }),
    );
    const css = contentsOf(themed, "inertia/css/app.css");
    expect(css).toContain("--primary: #0f766e;");
    expect(css).toContain("--radius: 0.5rem;");
  });
});

class FakeRunner implements CommandRunner {
  readonly calls: string[] = [];
  constructor(private readonly respond: (line: string) => CommandResult) {}
  async run(command: string, args: readonly string[]): Promise<CommandResult> {
    const line = [command, ...args].join(" ");
    this.calls.push(line);
    return this.respond(line);
  }
}

const success: CommandResult = { code: 0, timedOut: false, output: "11.0.0" };

describe("generator preconditions", () => {
  it("refuses a non-empty output directory before running anything", async () => {
    await mkdir(join(root, "out"), { recursive: true });
    await writeFile(join(root, "out", "keep.txt"), "mine");
    const runner = new FakeRunner(() => success);

    const result = await new AdonisGenerator({
      runner,
      nodeVersion: "24.11.0",
    }).generate(inputFor());

    expect(result).toMatchObject({
      ok: false,
      error: { tag: "output_not_empty" },
    });
    expect(runner.calls).toEqual(["npm --version"]);
  });

  it("removes its partial output when a step fails", async () => {
    const runner = new FakeRunner((line) =>
      line.startsWith("npm create")
        ? { code: 1, timedOut: false, output: "network unreachable" }
        : success,
    );

    const result = await new AdonisGenerator({
      runner,
      nodeVersion: "24.11.0",
    }).generate(inputFor());

    expect(result).toMatchObject({
      ok: false,
      error: { tag: "generation_failed", step: "scaffold" },
    });
    expect(await readdir(root)).toEqual([]);
  });

  it("compares versions numerically", () => {
    expect(atLeast("v24.11.0", [24, 11, 0])).toBe(true);
    expect(atLeast("24.9.9", [24, 11, 0])).toBe(false);
    expect(atLeast("100.0.0", [24, 11, 0])).toBe(true);
  });
});
