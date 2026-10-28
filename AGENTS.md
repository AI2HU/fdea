# Repository Guidelines

## Product

Forward Deploy Engineering Anything (FDEA) is an MCP server and CLI that ingest documentation, rank evidence-backed software opportunities, build a verified process model for the opportunity the user selects, ask what the documents leave open, and generate a **Vue** artifact: a fullstack AdonisJS 7 application or a static Astro 7 website. Process UI is built by the agent after generation, not by codegen. Both adapters call the same application service, so behavior must never diverge between them.

- Discover value before modeling: opportunity map → priority clarifications → ranked list → selected scope → process model.
- Never invent optional features or ROI. What the documents do not settle is an `unknown` or a clarification.
- Fidelity is always asked: `foundation` (production) or `prototype` (lightweight approach gallery).
- For foundations the stack is always asked: `fullstack` (AdonisJS + Vue) or `static` (Astro + Vue islands). Prototypes default to `static`; `fullstack` is an explicit directive override.
- For fullstack foundations: RBAC and cloud-or-local are always asked, never defaulted; the derived database schema must be approved before generation. Prototypes and static sites have no database, so none of these apply.
- Fullstack foundation codegen emits data, HTTP, auth, MCP, design tokens and a thin Vue shell; `UI.md` / `ui_backlog` list the Inertia pages the agent must invent.
- Static foundation codegen emits typed content collections (JSON under `src/data/`), design tokens, a layout and Vue primitives; `UI.md` / `ui_backlog` list the Astro pages the agent must invent and the process writes a static site cannot perform.
- Prototype codegen emits a thin static Astro + Vue gallery (or Adonis + Vue when the stack is `fullstack`) with mock fixtures and approach folders (`PROTOTYPE.md`); no database, MCP, or RBAC.
- Generated fullstack foundations are AI-native: they expose an MCP server whose tools reuse the same RBAC permissions as the UI.
- Every opportunity and process-model element carries a verbatim quote that is verified against the stored source text.

## Architecture

Dependencies flow inward: `contracts` and `domain`, then `process` and `design`, then `application`, then adapters (`cli.ts`, `server/`) and composition.

- `src/contracts/`: Zod schemas for the opportunity map, process model, project state and tool inputs. Tool descriptions live next to them.
- `src/process/`: opportunity ranking, naming, integrity validation, completeness gaps and derived clarifications.
- `src/ingestion/`: one extractor per source kind. OCR sits behind the `OcrPort`.
- `src/design/`: color helpers and design-token resolution (agent-provided, then inferred from design sources, then the shadcn default).
- `src/application/`: `FdeaService` workflows and the `ApplicationGenerator` port. `callTool` validates input and is the single entry for CLI and MCP.
- `src/codegen/`: `StackGenerator` routes generation by stack; `workspace.ts`, `runner.ts`, `toolchain.ts` and `files.ts` are shared by both generators.
- `src/codegen/adonis/`: the fullstack Adonis + Vue generator. `plan.ts` derives permissions, roles and transitions once; `emit*.ts` are pure functions returning files (`emitUi.ts` / `emitPrototype.ts` write agent contracts); `AdonisGenerator.ts` scaffolds `--kit=vue`, then foundation or lightweight prototype paths through an injectable `CommandRunner`.
- `src/codegen/astro/`: the static Astro + Vue generator. `kit.ts` patches the minimal starter; `emitSite.ts` (static foundation) and `emitGallery.ts` (prototype) reuse the Adonis plan, theme CSS and Vue primitives.
- `src/store/`: disk-backed project store with atomic writes.
- `src/setup/`: `fdea setup` and `fdea doctor`.

Parse unknown input at the boundary and model expected failures with `Result` and the tagged `FdeaError`. Keep identity values (ids, table names) separate from display labels. Remove superseded code instead of keeping aliases.

## Generated application rules

- Emitters follow the output of the real AdonisJS 7 Vue starter kit and the Astro 7 `minimal` template; verify changes by generating an application, not only by unit tests. A generated foundation must pass `npm run typecheck` and its production build (`node ace build` or `astro build`) before process UI exists. Prototypes skip the production build step.
- Static typechecking runs `astro check && vue-tsc --noEmit`: `astro check` does not check `.vue` files.
- Treat the starter kit as input: patch it with exact-marker replacements that fail loudly when the kit changes shape.
- Do not use the shadcn CLI; foundation UI primitives are emitted directly so generation is deterministic.
- Process screens are agent-owned: do not reintroduce entity page codegen. Keep controllers (or content collections) and `UI.md` aligned on page names and props.

## Development

Use [.nvmrc](.nvmrc) and `package.json#packageManager`.

- `npm ci`, `npm run build`, `npm run check` (typecheck, lint, tests), `npm run format`.
- Generation tests that scaffold a real application need network access and take minutes; keep them out of the default test run.

Never commit credentials, generated applications, `dist/` or `node_modules/`. Use Conventional Commit subjects and PR titles.
