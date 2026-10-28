import type {
  ApplicationGenerator,
  GenerationInput,
} from "../application/ports.js";
import type { GenerationResult, Stack } from "../contracts/project.js";
import type { FdeaError, Result } from "../domain/result.js";

/** Routes generation to the generator of the chosen stack. */
export class StackGenerator implements ApplicationGenerator {
  constructor(
    private readonly generators: Readonly<Record<Stack, ApplicationGenerator>>,
  ) {}

  generate(
    input: GenerationInput,
  ): Promise<Result<GenerationResult, FdeaError>> {
    return this.generators[input.stack].generate(input);
  }
}
