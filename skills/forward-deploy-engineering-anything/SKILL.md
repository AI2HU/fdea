---
name: forward-deploy-engineering-anything
description: Turn process documentation (URLs, PDF, DOCX, images, text) into a tailor-made Vue application (fullstack AdonisJS or static Astro website) or lightweight prototype gallery with FDEA. Use when the user wants software, a website or UX prototypes built from documents that describe a process, form, workflow or business operation.
---

# Forward Deploy Engineering Anything

FDEA ingests documentation, ranks the most valuable software opportunities in those documents, builds a process model for the opportunity the user selects, asks what the documents leave open, and generates a **Vue** artifact: a fullstack AdonisJS 7 application or a static Astro 7 website. Use the `fdea` MCP tools; every tool has an equivalent `fdea <command>` CLI command with JSON output.

## Fidelity and stack

Ask `directive:fidelity` before generating. For foundations, then ask `directive:stack`:

| Fidelity + stack         | Output                                                                                                                                                         | Gates                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `foundation` `fullstack` | Production Adonis + Vue foundation (Lucid, auth, optional RBAC, MCP, design tokens, shell). Process pages via `UI.md`.                                         | RBAC, deployment, schema approval |
| `foundation` `static`    | Static Astro + Vue website: typed content collections (JSON in `src/data/`), design tokens, layout, Vue primitives. Pages via `UI.md`. No server, auth or MCP. | Stack only                        |
| `prototype`              | Static Astro + Vue gallery (default): mock fixtures, N approach folders, `PROTOTYPE.md`. No database, MCP, or RBAC.                                            | Fidelity only                     |

A static site cannot persist writes. When the process needs users to create, update or approve records, explain that to the user while asking `directive:stack`; `UI.md` lists the writes a static site cannot perform.

Prototypes are for comparing approaches (including lead-magnet style UX). They use the static stack unless the user explicitly wants an Adonis prototype (`set_implementation_directives` with `stack: "fullstack"`). When a winner is chosen, generate a **foundation** into a **new empty directory** — do not promote a prototype in place.

## Workflow

1. `create_project` with a name and an empty output directory.
2. `ingest_source` for every document. Use `role: "design"` for brand or UI references (a website, a style guide, a screenshot). Check `limitations` in the result and `list_sources`.
3. `read_source` for every process source until you have read all of it. Images are stored on disk; open the stored image yourself when OCR text is thin.
4. `submit_opportunity_map` with the valuable pains grounded in the documents (do this **before** any process model):
   - Each opportunity needs `pain`, `friction_kind`, `affected_actor_labels`, `software_hypothesis`, document `signals` (`none|weak|stated` only — never invent ROI), `confidence` (`stated` or `inferred`), and verbatim `evidence`.
   - Prefer pains with workarounds, re-entry, stalled handoffs, errors, compliance risk or explicit frequency. Put thin guesses as `inferred`, not as top picks.
5. `list_clarifications` and ask every `value:priority:*` question (`high|medium|low|defer`). Never answer for the user.
6. `get_opportunity_ranking`, show `summary` to the user, then `select_opportunity` with their choice. Do not submit a process model until scope is selected. A new opportunity map clears the selection.
7. `submit_process_model` for **only** the selected opportunity:
   - `actors`, `entities` (typed fields, `references` for many-to-one), `steps` (who does what: `list|view|create|update|delete|transition`).
   - Every element needs `evidence` with a verbatim quote and its `source_id`. For images, quote a short observation.
   - Anything the documents leave open, or that is out of the selected scope, goes in `unknowns`. Do not invent optional features, fields, roles or steps.
8. `list_clarifications` and ask the user each remaining open question. Never answer for them. Always asked:
   - `directive:fidelity`: `foundation` or `prototype`
   - When foundation: `directive:stack` (`fullstack` / `static`)
   - When fullstack foundation: `directive:rbac`, `directive:deployment` (`cloud` / `local`), `directive:schema`
9. `answer_clarifications` with the user's answers. Answers to process questions require you to correct the sources or resubmit the model with `submit_process_model`. Scope uses `select_opportunity`, not `answer_clarifications`.
10. **Fullstack foundation only:** `get_database_schema`, show `schema.summary` to the user, then `approve_database_schema`. Do not generate until they approve. A new process model invalidates approval. Prototypes and static sites skip schema tools.
11. `get_design_spec`. If no design source gave tokens and you can derive them from a design image or page, call `submit_design_spec`. Otherwise the shadcn default is used.
12. Optional: `set_implementation_directives` with `prototype_variants` (2–5, default 3) when fidelity is prototype.
13. `generate_application`. It refuses until every blocker is resolved; `project_status` lists them.
14. **Build the UI yourself** in the generated app directory:
    - **Fullstack foundation:** Read `UI.md`, implement every backlog page under `inertia/pages/*.vue`, wire to documented routes. Keep login and error pages working. When RBAC is on, use `useCan` / shared `permissions`. Finish with `npm run typecheck` and `node ace build`.
    - **Static foundation:** Read `UI.md`, implement every backlog page under `src/pages/*.astro` with `getCollection` / `getEntry` (dynamic pages export `getStaticPaths`). Use Vue components with `client:*` only for interactive islands. Do not invent records in `src/data/`. Finish with `npm run typecheck` and `npm run build`.
    - **Prototype:** Read `PROTOTYPE.md`, invent each approach under `src/pages/approaches/<id>/` (Vue islands in `src/components/approaches/<id>/`) using shared `fixtures`. Visually strong is enough; not production-ready. `npm run typecheck` is enough.

## After generation

Report `verification.typecheck`, that every backlog page (or approach stub) exists, your own checks, the `limitations`, and the output directory. Tell the user to run the setup commands from the generated `README.md`.

Fullstack foundations are AI-native: they expose `/mcp` with process tools. Create an access token with `node ace mcp:token`. When RBAC is on, every tool checks the same Bouncer permissions as the UI.

## Rules

- Discover value first: opportunity map → user ranking answers → selected scope → process model. Do not jump straight to entities for everything the documents mention.
- Observations come from the documents; label inferences as such and put gaps in `unknowns`.
- Ask, do not assume, on fidelity, stack, opportunity priority, RBAC and cloud vs local (stack only for foundations; RBAC/deployment only for fullstack foundations).
- Do not invent process features the documents omit; UI presentation is free, process scope is not.
- Do not edit generated foundation files to work around a model problem; fix the model and regenerate into a new empty directory.
- Frontend is Vue (Inertia for fullstack, Astro islands for static), not React.
- Generation needs Node.js 24.11+, npm and network access to the npm registry and GitHub.
