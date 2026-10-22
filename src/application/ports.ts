import type { ProcessModel } from "../contracts/processModel.js";
import type { DesignSpec, GenerationResult } from "../contracts/project.js";
import type { FdeaError, Result } from "../domain/result.js";

export interface GenerationInput {
  readonly projectName: string;
  readonly outDir: string;
  readonly model: ProcessModel;
  readonly fidelity: "foundation" | "prototype";
  readonly prototypeVariants: number;
  readonly rbac: boolean;
  readonly deployment: "cloud" | "local";
  readonly design: DesignSpec;
}

export interface ApplicationGenerator {
  generate(
    input: GenerationInput,
  ): Promise<Result<GenerationResult, FdeaError>>;
}
