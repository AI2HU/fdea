import type { ProcessModel } from "../contracts/processModel.js";
import type {
  DesignSpec,
  Fidelity,
  GenerationResult,
  Stack,
} from "../contracts/project.js";
import type { FdeaError, Result } from "../domain/result.js";

export interface GenerationInput {
  readonly projectName: string;
  readonly outDir: string;
  readonly model: ProcessModel;
  readonly fidelity: Fidelity;
  readonly stack: Stack;
  readonly prototypeVariants: number;
  readonly rbac: boolean;
  readonly deployment: "cloud" | "local" | "none";
  readonly design: DesignSpec;
}

export interface ApplicationGenerator {
  generate(
    input: GenerationInput,
  ): Promise<Result<GenerationResult, FdeaError>>;
}
