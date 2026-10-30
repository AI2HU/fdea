---
name: forward-deploy-engineering-anything
description: Turn process documentation (URLs, PDF, DOCX, images, text) into a tailor-made Vue application (fullstack AdonisJS or static Astro website), with real data or with mock data as a prototype, using FDEA. Use when the user wants software, a website or a prototype built from documents that describe a process, form, workflow or business operation.
---

# Forward Deploy Engineering Anything

FDEA ingests documentation, ranks the most valuable software opportunities in those documents, builds a process model for the opportunity the user selects, asks what the documents leave open, and generates a **Vue** artifact: a fullstack AdonisJS 7 application or a static Astro 7 website. When the user asks to skip pain analysis, create the project with `skip_pain`: the sources are the specification and are applied as asked. Use the `fdea` MCP tools; every tool has an equivalent `fdea <command>` CLI command with JSON output.

## Fidelity and stack

Ask `directive:fidelity` and then `directive:stack` before generating. A prototype is the same production-ready application as a foundation; the only difference is that its data is mock data you derive from the sources.

| Stack       | Output                                                                                                                                                         | Gates                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `fullstack` | Production Adonis + Vue foundation (Lucid, auth, optional RBAC, MCP, design tokens, shell). Process pages via `UI.md`.                                         | RBAC, deployment, schema approval |
| `static`    | Static Astro + Vue website: typed content collections (JSON in `src/data/`), design tokens, layout, Vue primitives. Pages via `UI.md`. No server, auth or MCP. | Stack only                        |

| Fidelity     | Data                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `foundation` | Real data only; no records are invented.                                                                                   |
| `prototype`  | Mock data you submit with `submit_mock_data`: seeded by `node ace db:seed` (fullstack) or written to `src/data/` (static). |

A static site cannot persist writes. When the process needs users to create, update or approve records, explain that to the user while asking `directive:stack`; `UI.md` lists the writes a static site cannot perform.

## Workflow

1. `create_project` with a name and an empty output directory. Pass `skip_pain: true` only when the user asks to skip pain analysis and build what the input asks for (CLI: `fdea init <name> --out <dir> --skip-pain`).
2. `ingest_source` for every document. Use `role: "design"` for brand or UI references (a website, a style guide, a screenshot). Check `limitations` in the result and `list_sources`.
3. `read_source` for every process source until you have read all of it. Images are stored on disk; open the stored image yourself when OCR text is thin.
4. Unless the project has `skip_pain`, `submit_opportunity_map` with the valuable pains grounded in the documents (do this **before** any process model):
   - Each opportunity needs `pain`, `friction_kind`, `affected_actor_labels`, `software_hypothesis`, document `signals` (`none|weak|stated` only — never invent ROI), `confidence` (`stated` or `inferred`), and verbatim `evidence`.
   - Prefer pains with workarounds, re-entry, stalled handoffs, errors, compliance risk or explicit frequency. Put thin guesses as `inferred`, not as top picks.
5. Unless the project has `skip_pain`, `list_clarifications` and ask every `value:priority:*` question (`high|medium|low|defer`). Never answer for the user.
6. Unless the project has `skip_pain`, `get_opportunity_ranking`, show `summary` to the user, then `select_opportunity` with their choice. Do not submit a process model until scope is selected. A new opportunity map clears the selection.
7. `submit_process_model` for **only** the selected opportunity (with `skip_pain`, for the process the sources ask to build — the whole requested scope, not a ranked pain):
   - `actors`, `entities` (typed fields, `references` for many-to-one), `steps` (who does what: `list|view|create|update|delete|transition`).
   - Every element needs `evidence` with a verbatim quote and its `source_id`. For images, quote a short observation.
   - Anything the documents leave open, or that is out of the selected scope, goes in `unknowns`. Do not invent optional features, fields, roles or steps.
8. `list_clarifications` and ask the user each remaining open question. Never answer for them. Always asked:
   - `directive:fidelity`: `foundation` or `prototype`
   - `directive:stack` (`fullstack` / `static`)
   - When fullstack: `directive:rbac`, `directive:deployment` (`cloud` / `local`), `directive:schema`
9. `answer_clarifications` with the user's answers. Answers to process questions require you to correct the sources or resubmit the model with `submit_process_model`. Scope uses `select_opportunity`, not `answer_clarifications`.
10. **Fullstack only:** `get_database_schema`, show `schema.summary` to the user, then `approve_database_schema`. Do not generate until they approve. A new process model invalidates approval. Static sites skip schema tools.
11. `get_design_spec`. If no design source gave tokens and you can derive them from a design image or page, call `submit_design_spec`. Otherwise the shadcn default is used.
12. **Prototype only:** `submit_mock_data` with realistic records for every entity, derived from the context of the sources: their vocabulary, names, places, currencies, volumes, languages and states. Fictional only, never real personal data. FDEA checks types, enums, references and uniqueness. It stays valid across a new process model only while it still validates.
13. `generate_application`. It refuses until every blocker is resolved; `project_status` lists them.
14. **Build the UI yourself** in the generated app directory:
    - **Fullstack:** Read `UI.md`, implement every backlog page under `inertia/pages/*.vue`, wire to documented routes. Keep login and error pages working. When RBAC is on, use `useCan` / shared `permissions`. Finish with `npm run typecheck` and `node ace build`.
    - **Static:** Read `UI.md`, implement every backlog page under `src/pages/*.astro` with `getCollection` / `getEntry` (dynamic pages export `getStaticPaths`). Use Vue components with `client:*` only for interactive islands. Do not invent records in `src/data/` beyond the submitted mock data. Finish with `npm run typecheck` and `npm run build`.

## After generation

Report `verification.typecheck`, that every backlog page exists, your own checks, the `limitations`, and the output directory. Tell the user to run the setup commands from the generated `README.md`.

Fullstack foundations are AI-native: they expose `/mcp` with process tools. Create an access token with `node ace mcp:token`. When RBAC is on, every tool checks the same Bouncer permissions as the UI.

## Skip pain analysis

When the user asks to skip pain analysis, create the project with `skip_pain: true`. The sources are the specification: ingest and read every source, then `submit_process_model` for everything they ask to build, as asked. Do not call `submit_opportunity_map`, `get_opportunity_ranking`, or `select_opportunity`. Priority and scope questions are not asked. Evidence, unknowns, fidelity, stack, and schema rules still apply. Do not invent features the sources omit. For a prototype, find the mock data in the context of the sources.

## Rules

- Discover value first: opportunity map → user ranking answers → selected scope → process model. Do not jump straight to entities for everything the documents mention. With `skip_pain`, model what the sources ask to build and skip the opportunity map.
- Observations come from the documents; label inferences as such and put gaps in `unknowns`.
- Ask, do not assume, on fidelity, stack, opportunity priority, RBAC and cloud vs local (RBAC/deployment only for the fullstack stack).
- Do not invent process features the documents omit; UI presentation is free, process scope is not. Mock data is the only thing a prototype invents, and it stays fictional.
- Do not edit generated files to work around a model problem; fix the model and regenerate into a new empty directory.
- Frontend is Vue (Inertia for fullstack, Astro islands for static), not React.
- Generation needs Node.js 24.11+, npm and network access to the npm registry and GitHub.
