import { FdeaService } from "./application/FdeaService.js";
import { AdonisGenerator } from "./codegen/adonis/AdonisGenerator.js";
import { AstroGenerator } from "./codegen/astro/AstroGenerator.js";
import { StackGenerator } from "./codegen/StackGenerator.js";
import { TesseractOcr } from "./ingestion/index.js";
import { ProjectStore, resolveHome } from "./store/ProjectStore.js";

export const createProductionService = (
  env: NodeJS.ProcessEnv = process.env,
): FdeaService =>
  new FdeaService({
    store: new ProjectStore(resolveHome(env)),
    ocr: new TesseractOcr(),
    generator: new StackGenerator({
      fullstack: new AdonisGenerator(),
      static: new AstroGenerator(),
    }),
  });
