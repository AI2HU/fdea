import { z } from "zod";
import {
  TOOL_INPUTS,
  type ToolInput,
  type ToolName,
} from "../contracts/tools.js";
import {
  err,
  messageOf,
  type FdeaError,
  type Result,
} from "../domain/result.js";
import type { FdeaService } from "./FdeaService.js";

type Handlers = {
  [N in ToolName]: (
    service: FdeaService,
    input: ToolInput<N>,
  ) => Promise<Result<unknown, FdeaError>>;
};

const HANDLERS: Handlers = {
  create_project: (service, input) => service.createProject(input),
  ingest_source: (service, input) => service.ingestSource(input),
  list_sources: (service, input) => service.listSources(input),
  read_source: (service, input) => service.readSource(input),
  submit_opportunity_map: (service, input) =>
    service.submitOpportunityMap(input),
  get_opportunity_ranking: (service, input) =>
    service.getOpportunityRanking(input),
  select_opportunity: (service, input) => service.selectOpportunity(input),
  get_process_model: (service, input) => service.getProcessModel(input),
  submit_process_model: (service, input) => service.submitProcessModel(input),
  list_clarifications: (service, input) => service.listClarifications(input),
  answer_clarifications: (service, input) =>
    service.answerClarifications(input),
  set_implementation_directives: (service, input) =>
    service.setImplementationDirectives(input),
  get_design_spec: (service, input) => service.getDesignSpec(input),
  submit_design_spec: (service, input) => service.submitDesignSpec(input),
  get_database_schema: (service, input) => service.getDatabaseSchema(input),
  approve_database_schema: (service, input) =>
    service.approveDatabaseSchema(input),
  generate_application: (service, input) => service.generateApplication(input),
  project_status: (service, input) => service.projectStatus(input),
};

export const callTool = async <N extends ToolName>(
  service: FdeaService,
  name: N,
  rawInput: unknown,
): Promise<Result<unknown, FdeaError>> => {
  const parsed = z.object(TOOL_INPUTS[name]).safeParse(rawInput);
  if (!parsed.success) {
    return err({
      tag: "invalid_input",
      message: `Invalid input for ${name}.`,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
      ),
    });
  }
  try {
    const handler = HANDLERS[name] as (
      service: FdeaService,
      input: unknown,
    ) => Promise<Result<unknown, FdeaError>>;
    return await handler(service, parsed.data);
  } catch (cause) {
    return err({
      tag: "storage_failure",
      message: `Unexpected failure: ${messageOf(cause)}`,
    });
  }
};
