import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ApplicationGenerator,
  GenerationInput,
} from "../src/application/ports.js";
import { FdeaService } from "../src/application/FdeaService.js";
import { callTool } from "../src/application/tools.js";
import { ok } from "../src/domain/result.js";
import { ProjectStore } from "../src/store/ProjectStore.js";
import {
  PROCESS_TEXT,
  purchaseMockData,
  purchaseModel,
  purchaseOpportunityMap,
} from "./fixtures.js";

let home: string;
let generated: GenerationInput[];
let service: FdeaService;

const generator: ApplicationGenerator = {
  generate: async (input) => {
    generated.push(input);
    return ok({
      output_dir: input.outDir,
      generated_at: "2026-01-01T00:00:00.000Z",
      scaffold: { kit: "fake", command: "fake" },
      fidelity: input.fidelity,
      stack: input.stack,
      deployment: input.deployment,
      rbac: input.rbac,
      mcp: input.mcp,
      design_kind: input.design.kind,
      files: [],
      ui_backlog: [],
      verification: { typecheck: "passed", build: "passed" },
      limitations: [],
    });
  },
};

const call = async (name: Parameters<typeof callTool>[1], input: unknown) => {
  const result = await callTool(service, name, input);
  if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
  return result.value as Record<string, unknown>;
};

const failure = async (
  name: Parameters<typeof callTool>[1],
  input: unknown,
) => {
  const result = await callTool(service, name, input);
  if (result.ok) throw new Error(`${name} unexpectedly succeeded`);
  return result.error;
};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "fdea-test-"));
  generated = [];
  service = new FdeaService({
    store: new ProjectStore(home),
    ocr: {
      recognize: async () => ({ text: "", confidence: 0, limitation: "stub" }),
    },
    generator,
  });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const startProject = async () => {
  const project = await call("create_project", {
    name: "Buy Desk",
    out_dir: join(home, "out"),
  });
  const projectId = project["project_id"] as string;
  const source = await call("ingest_source", {
    project_id: projectId,
    inline: { name: "process.md", text: PROCESS_TEXT },
  });
  return { projectId, sourceId: source["id"] as string };
};

const selectPurchaseScope = async (projectId: string, sourceId: string) => {
  await call("submit_opportunity_map", {
    project_id: projectId,
    map: purchaseOpportunityMap(sourceId),
  });
  await call("answer_clarifications", {
    project_id: projectId,
    answers: [
      { id: "value:priority:digitize_purchase_requests", answer: "high" },
      { id: "value:priority:approval_visibility", answer: "medium" },
    ],
  });
  await call("select_opportunity", {
    project_id: projectId,
    opportunity_id: "digitize_purchase_requests",
  });
};

describe("clarification gate", () => {
  it("refuses to generate until opportunities, model, RBAC, MCP, deployment, schema and access are settled", async () => {
    const { projectId, sourceId } = await startProject();

    const early = await failure("generate_application", {
      project_id: projectId,
    });
    expect(early.tag).toBe("not_ready");

    const beforeScope = await failure("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    expect(beforeScope.tag).toBe("not_ready");

    await selectPurchaseScope(projectId, sourceId);

    await call("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    const blocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (blocked.tag !== "not_ready")
      throw new Error(`unexpected ${blocked.tag}`);
    expect(blocked.blockers.join(" ")).toMatch(/fidelity/i);

    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "foundation" },
        { id: "directive:stack", answer: "fullstack" },
      ],
    });
    const rbacBlocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (rbacBlocked.tag !== "not_ready")
      throw new Error(`unexpected ${rbacBlocked.tag}`);
    expect(rbacBlocked.blockers.join(" ")).toMatch(/rbac/i);

    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:rbac", answer: "true" },
        { id: "directive:deployment", answer: "cloud" },
      ],
    });
    const mcpBlocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (mcpBlocked.tag !== "not_ready")
      throw new Error(`unexpected ${mcpBlocked.tag}`);
    expect(mcpBlocked.blockers.join(" ")).toContain("directive:mcp");

    await call("answer_clarifications", {
      project_id: projectId,
      answers: [{ id: "directive:mcp", answer: "true" }],
    });
    const schemaBlocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (schemaBlocked.tag !== "not_ready")
      throw new Error(`unexpected ${schemaBlocked.tag}`);
    expect(schemaBlocked.blockers.join(" ")).toMatch(/schema/i);

    const schema = await call("get_database_schema", { project_id: projectId });
    expect(schema["approved"]).toBe(false);
    const preview = schema["schema"] as {
      summary: string;
      mermaid: string;
    };
    expect(preview.summary).toContain("```mermaid");
    expect(preview.summary).toContain("purchase_requests");
    expect(preview.mermaid).toContain("erDiagram");
    expect(preview.mermaid).toContain(
      'suppliers ||--o{ purchase_requests : "supplier_id"',
    );

    await call("approve_database_schema", {
      project_id: projectId,
      approved: true,
    });
    const accessBlocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (accessBlocked.tag !== "not_ready")
      throw new Error(`unexpected ${accessBlocked.tag}`);
    expect(accessBlocked.blockers.join(" ")).toContain("directive:access");

    const matrix = await call("get_access_matrix", { project_id: projectId });
    expect(matrix["approved"]).toBe(false);
    const access = matrix["access"] as {
      roles: Array<{ id: string; permissions: string[] }>;
      summary: string;
    };
    expect(access.roles.find((role) => role.id === "approver")).toEqual({
      id: "approver",
      name: "Approver",
      permissions: [
        "purchase_request.approve_request",
        "purchase_request.list",
      ],
    });
    expect(access.summary).toContain("# Who can do what");
    expect(access.summary).toContain(
      "### Employee (`employee`)\n- Create Purchase request (`purchase_request.create`)",
    );
    expect(access.summary).toContain(
      "| Permission | Employee | Approver | Buyer |",
    );

    const answered = await failure("answer_clarifications", {
      project_id: projectId,
      answers: [{ id: "directive:access", answer: "approved" }],
    });
    expect(answered.tag).toBe("invalid_input");

    await call("approve_access_matrix", {
      project_id: projectId,
      approved: true,
    });
    await call("generate_application", { project_id: projectId });

    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      fidelity: "foundation",
      stack: "fullstack",
      rbac: true,
      mcp: true,
      deployment: "cloud",
      projectName: "Buy Desk",
    });
    expect(generated[0]?.design.kind).toBe("shadcn_default");
  });

  it("asks again who can do what after a new process model", async () => {
    const { projectId, sourceId } = await startProject();
    await selectPurchaseScope(projectId, sourceId);
    await call("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "foundation" },
        { id: "directive:stack", answer: "fullstack" },
        { id: "directive:rbac", answer: "true" },
        { id: "directive:mcp", answer: "false" },
        { id: "directive:deployment", answer: "local" },
      ],
    });
    await call("approve_access_matrix", {
      project_id: projectId,
      approved: true,
    });
    const approved = await call("project_status", { project_id: projectId });
    expect(approved["access_approved"]).toBe(true);

    const model = purchaseModel(sourceId);
    const raise = model.steps.find((step) => step.id === "raise_request");
    if (raise === undefined) throw new Error("fixture has no raise_request");
    raise.actor_ids = ["employee", "buyer"];
    await call("submit_process_model", { project_id: projectId, model });

    const status = await call("project_status", { project_id: projectId });
    expect(status["access_approved"]).toBe(false);
    const matrix = await call("get_access_matrix", { project_id: projectId });
    const roles = (
      matrix["access"] as {
        roles: Array<{ id: string; permissions: string[] }>;
      }
    ).roles;
    expect(roles.find((role) => role.id === "buyer")?.permissions).toContain(
      "purchase_request.create",
    );
  });

  it("skips the access matrix without RBAC and turns MCP off", async () => {
    const { projectId, sourceId } = await startProject();
    await selectPurchaseScope(projectId, sourceId);
    await call("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "foundation" },
        { id: "directive:stack", answer: "fullstack" },
        { id: "directive:rbac", answer: "false" },
        { id: "directive:mcp", answer: "false" },
        { id: "directive:deployment", answer: "local" },
      ],
    });
    const questions = await call("list_clarifications", {
      project_id: projectId,
    });
    const ids = (questions["clarifications"] as Array<{ id: string }>).map(
      (item) => item.id,
    );
    expect(ids).toContain("directive:mcp");
    expect(ids).not.toContain("directive:access");
    const refused = await failure("get_access_matrix", {
      project_id: projectId,
    });
    expect(refused.tag).toBe("invalid_input");

    await call("approve_database_schema", {
      project_id: projectId,
      approved: true,
    });
    await call("generate_application", { project_id: projectId });
    expect(generated[0]).toMatchObject({ rbac: false, mcp: false });
  });

  it("generates a prototype from submitted mock data", async () => {
    const { projectId, sourceId } = await startProject();
    await selectPurchaseScope(projectId, sourceId);
    await call("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "prototype" },
        { id: "directive:stack", answer: "static" },
      ],
    });
    const blocked = await failure("generate_application", {
      project_id: projectId,
    });
    if (blocked.tag !== "not_ready")
      throw new Error(`unexpected ${blocked.tag}`);
    expect(blocked.blockers.join(" ")).toMatch(/mock data/i);

    await call("submit_mock_data", {
      project_id: projectId,
      mock_data: purchaseMockData,
    });
    const questions = await call("list_clarifications", {
      project_id: projectId,
    });
    const ids = (questions["clarifications"] as Array<{ id: string }>).map(
      (item) => item.id,
    );
    expect(ids).not.toContain("directive:mcp");
    expect(ids).not.toContain("directive:access");

    await call("generate_application", { project_id: projectId });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      fidelity: "prototype",
      stack: "static",
      rbac: false,
      mcp: false,
      deployment: "none",
      mockData: purchaseMockData,
    });
  });

  it("ranks opportunities from document signals and user priority answers", async () => {
    const { projectId, sourceId } = await startProject();
    await call("submit_opportunity_map", {
      project_id: projectId,
      map: purchaseOpportunityMap(sourceId),
    });
    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "value:priority:digitize_purchase_requests", answer: "high" },
        { id: "value:priority:approval_visibility", answer: "defer" },
      ],
    });
    const ranking = await call("get_opportunity_ranking", {
      project_id: projectId,
    });
    const rows = ranking["ranking"] as Array<{
      opportunity: { id: string };
      score: number;
    }>;
    expect(rows[0]?.opportunity.id).toBe("digitize_purchase_requests");
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
    expect(ranking["summary"] as string).toContain("Opportunity ranking");
  });

  it("rejects opportunity evidence whose quote is not in the source", async () => {
    const { projectId, sourceId } = await startProject();
    const map = purchaseOpportunityMap(sourceId);
    const [first] = map.opportunities;
    if (first === undefined) throw new Error("fixture has no opportunities");
    first.evidence = [
      { source_id: sourceId, quote: "Robots invent purchase software" },
    ];
    const error = await failure("submit_opportunity_map", {
      project_id: projectId,
      map,
    });
    if (error.tag !== "invalid_opportunity_map")
      throw new Error(`unexpected ${error.tag}`);
    expect(error.issues.join(" ")).toContain("quote not found");
  });

  it("rejects model elements whose evidence quote is not in the source", async () => {
    const { projectId, sourceId } = await startProject();
    await selectPurchaseScope(projectId, sourceId);
    const model = purchaseModel(sourceId);
    const [actor] = model.actors;
    if (actor === undefined) throw new Error("fixture has no actors");
    actor.evidence = [
      { source_id: sourceId, quote: "Robots raise purchase requests" },
    ];

    const error = await failure("submit_process_model", {
      project_id: projectId,
      model,
    });
    if (error.tag !== "invalid_process_model")
      throw new Error(`unexpected ${error.tag}`);
    expect(error.issues.join(" ")).toContain("quote not found");
  });

  it("derives clarifications from process gaps instead of guessing", async () => {
    const { projectId, sourceId } = await startProject();
    await selectPurchaseScope(projectId, sourceId);
    const model = purchaseModel(sourceId);
    model.steps = model.steps.filter(
      (step) => step.id !== "maintain_suppliers",
    );

    await call("submit_process_model", { project_id: projectId, model });
    const questions = await call("list_clarifications", {
      project_id: projectId,
    });
    const ids = (questions["clarifications"] as Array<{ id: string }>).map(
      (item) => item.id,
    );
    expect(ids).toContain("gap:actor_without_steps:buyer");
    expect(ids).toContain("directive:fidelity");
    expect(ids).toContain("directive:scope");
    expect(ids).not.toContain("directive:rbac");
    expect(ids).not.toContain("directive:schema");

    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "foundation" },
        { id: "directive:stack", answer: "fullstack" },
      ],
    });
    const after = await call("list_clarifications", { project_id: projectId });
    const afterIds = (after["clarifications"] as Array<{ id: string }>).map(
      (item) => item.id,
    );
    expect(afterIds).toContain("directive:rbac");
    expect(afterIds).toContain("directive:mcp");
    expect(afterIds).toContain("directive:schema");
  });

  it("builds the requested process when pain analysis is skipped", async () => {
    const project = await call("create_project", {
      name: "Buy Desk",
      out_dir: join(home, "direct"),
      skip_pain: true,
    });
    const projectId = project["project_id"] as string;
    expect(project["skip_pain"]).toBe(true);
    const source = await call("ingest_source", {
      project_id: projectId,
      inline: { name: "process.md", text: PROCESS_TEXT },
    });
    const sourceId = source["id"] as string;

    const rejected = await failure("submit_opportunity_map", {
      project_id: projectId,
      map: purchaseOpportunityMap(sourceId),
    });
    expect(rejected.tag).toBe("invalid_input");

    await call("submit_process_model", {
      project_id: projectId,
      model: purchaseModel(sourceId),
    });
    const questions = await call("list_clarifications", {
      project_id: projectId,
    });
    const ids = (questions["clarifications"] as Array<{ id: string }>).map(
      (item) => item.id,
    );
    expect(ids.some((id) => id.startsWith("value:priority:"))).toBe(false);
    expect(ids).not.toContain("directive:scope");

    const status = await call("project_status", { project_id: projectId });
    expect(status["skip_pain"]).toBe(true);
    expect((status["blockers"] as string[]).join(" ")).not.toMatch(
      /opportunity/i,
    );

    await call("answer_clarifications", {
      project_id: projectId,
      answers: [
        { id: "directive:fidelity", answer: "prototype" },
        { id: "directive:stack", answer: "static" },
      ],
    });
    await call("submit_mock_data", {
      project_id: projectId,
      mock_data: purchaseMockData,
    });
    await call("generate_application", { project_id: projectId });
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      fidelity: "prototype",
      projectName: "Buy Desk",
      mockData: purchaseMockData,
    });
  });
});
