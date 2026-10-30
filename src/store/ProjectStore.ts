import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProjectStateSchema, type ProjectState } from "../contracts/project.js";
import {
  err,
  messageOf,
  ok,
  type FdeaError,
  type Result,
} from "../domain/result.js";

export const resolveHome = (env: NodeJS.ProcessEnv = process.env): string =>
  env["FDEA_HOME"] !== undefined && env["FDEA_HOME"] !== ""
    ? env["FDEA_HOME"]
    : join(homedir(), ".fdea");

const PROJECT_ID = /^prj_[0-9a-f]{8}$/;

export class ProjectStore {
  constructor(private readonly home: string) {}

  projectDir(id: string): string {
    return join(this.home, "projects", id);
  }

  sourceTextPath(id: string, sourceId: string): string {
    return join(this.projectDir(id), "sources", `${sourceId}.txt`);
  }

  sourceBinaryDir(id: string): string {
    return join(this.projectDir(id), "sources");
  }

  async create(
    name: string,
    outDir: string,
    skipPain = false,
  ): Promise<Result<ProjectState, FdeaError>> {
    const id = `prj_${randomBytes(4).toString("hex")}`;
    const state: ProjectState = {
      version: 1,
      id,
      name,
      out_dir: outDir,
      skip_pain: skipPain,
      created_at: new Date().toISOString(),
      seq: 0,
      directives: {},
      sources: [],
      opportunity_seq: 0,
      model_seq: 0,
      answers: [],
    };
    try {
      await mkdir(join(this.projectDir(id), "sources"), { recursive: true });
    } catch (cause) {
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
    const saved = await this.save(state);
    return saved.ok ? ok(state) : saved;
  }

  async load(id: string): Promise<Result<ProjectState, FdeaError>> {
    if (!PROJECT_ID.test(id)) {
      return err({
        tag: "project_not_found",
        message: `Unknown project ${id}`,
      });
    }
    let raw: string;
    try {
      raw = await readFile(join(this.projectDir(id), "project.json"), "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return err({
          tag: "project_not_found",
          message: `Unknown project ${id}`,
        });
      }
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
    try {
      return ok(ProjectStateSchema.parse(JSON.parse(raw)));
    } catch (cause) {
      return err({
        tag: "storage_failure",
        message: `Project ${id} state is unreadable: ${messageOf(cause)}`,
      });
    }
  }

  async save(state: ProjectState): Promise<Result<void, FdeaError>> {
    const target = join(this.projectDir(state.id), "project.json");
    const temporary = `${target}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(temporary, target);
      return ok(undefined);
    } catch (cause) {
      await rm(temporary, { force: true });
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
  }

  async writeSourceText(
    id: string,
    sourceId: string,
    text: string,
  ): Promise<Result<void, FdeaError>> {
    try {
      await writeFile(this.sourceTextPath(id, sourceId), text, "utf8");
      return ok(undefined);
    } catch (cause) {
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
  }

  async readSourceText(
    id: string,
    sourceId: string,
  ): Promise<Result<string, FdeaError>> {
    try {
      return ok(await readFile(this.sourceTextPath(id, sourceId), "utf8"));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
        return err({
          tag: "source_not_found",
          message: `Unknown source ${sourceId}`,
        });
      }
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
  }

  async writeSourceBinary(
    id: string,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<Result<string, FdeaError>> {
    const path = join(this.sourceBinaryDir(id), fileName);
    try {
      await writeFile(path, bytes);
      return ok(path);
    } catch (cause) {
      return err({ tag: "storage_failure", message: messageOf(cause) });
    }
  }
}
