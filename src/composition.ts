import { FdeaService } from "./application/FdeaService.js";
import { AdonisGenerator } from "./codegen/adonis/AdonisGenerator.js";
import { TesseractOcr } from "./ingestion/index.js";
import { ProjectStore, resolveHome } from "./store/ProjectStore.js";

export const createProductionService = (
  env: NodeJS.ProcessEnv = process.env,
): FdeaService =>
  new FdeaService({
    store: new ProjectStore(resolveHome(env)),
    ocr: new TesseractOcr(),
    generator: new AdonisGenerator(),
  });
