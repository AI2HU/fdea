# Forward Deploy Engineering Anything

Give an agent your documentation. FDEA turns it into a tailor-made, production-ready Vue application — [AdonisJS](https://adonisjs.com) fullstack or Astro static — with real data, or as a prototype filled with mock data derived from your documents.

FDEA is an MCP server and a CLI that share one workflow:

1. **Ingest** URLs, PDF, DOCX, Markdown, HTML, text and images (OCR for images).
2. **Discover value**: your agent submits an opportunity map of evidenced pains; FDEA ranks them from document signals and your priority answers; you pick the build scope. Pass `skip_pain` on `create_project` (`fdea init --skip-pain`) to skip this and build what the sources ask for.
3. **Understand** that slice: the agent submits a process model (actors, entities, steps) for the selected opportunity only. Every element carries a verbatim quote from a source, and FDEA verifies it.
4. **Ask** what the documents do not settle. Always asked: opportunity priorities (unless `skip_pain`), _foundation or prototype?_ and the stack. For the fullstack stack also: RBAC, cloud or local, and schema approval.
5. **Fullstack only — validate the database schema** derived from the process model with the user before generating.
6. **Prototype only — mock data**: the agent derives realistic, fictional records for every entity from the context of the sources and submits them; FDEA checks types, enums, references and uniqueness.
7. **Generate** either:
   - **fullstack**: AdonisJS 7 + Vue Inertia with Lucid, auth, optional RBAC, MCP, design tokens, shell; process pages via `UI.md`.
   - **static**: Astro 7 + Vue islands with typed content collections, design tokens, layout; pages via `UI.md`.
     A prototype is generated the same way and ships the mock data (`node ace db:seed`, or JSON under `src/data/`).
8. **Invent the UI**: the agent implements the pages from the contract (`UI.md`).

Nothing optional is added to the process. The foundation encodes the selected opportunity from the documents; anything they leave open is reported as an open question instead of being guessed. Presentation is not constrained by codegen.

## Install

Requires Node.js 24.11+ and npm.

```bash
npm install -g fdea-agents
fdea setup          # shows the plan, then registers the MCP server and the skill
fdea doctor         # checks the toolchain and each agent's registration
```

`fdea setup` supports Cursor, Claude Code, Claude Desktop, Gemini CLI and Windsurf. It only adds or updates its own `fdea` entry, backs up any file it changes, and asks before writing (`--dry-run` shows the plan, `--yes` skips the prompt). Pass `--client <id>` to choose clients.

To register by hand, add this MCP server to your client:

```json
{ "mcpServers": { "fdea": { "command": "fdea", "args": ["mcp"] } } }
```

## Use it from an agent

Ask your agent to build software from your documents. The bundled skill (`skills/forward-deploy-engineering-anything`) walks it through the tools:

| Tool                                    | CLI                       | Purpose                                                                             |
| --------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `create_project`                        | `init`                    | Name the software and an empty output directory (`--skip-pain` skips pain analysis) |
| `ingest_source`                         | `ingest`                  | Add a document; `--role design` for brand and UI references                         |
| `list_sources`, `read_source`           | `sources`, `read`         | Read the extracted text, paged                                                      |
| `submit_opportunity_map`                | `submit-opportunities`    | Submit evidenced pains / software opportunities                                     |
| `get_opportunity_ranking`               | `rank-opportunities`      | Explainable ranking from signals and priority answers                               |
| `select_opportunity`                    | `select-opportunity`      | Pin the build scope (required before the process model)                             |
| `submit_process_model`                  | `submit-model`            | Submit actors, entities and steps for the selected opportunity                      |
| `get_process_model`                     | `model`                   | Return the model and its derived questions                                          |
| `list_clarifications`                   | `questions`               | Questions that block generation                                                     |
| `answer_clarifications`                 | `answer`                  | Record the user's answers (`id=answer`)                                             |
| `submit_mock_data`                      | `submit-mock`             | Prototype only: submit mock records derived from the sources                        |
| `set_implementation_directives`         | `directives`              | Fidelity, stack, RBAC, cloud or local                                               |
| `get_design_spec`, `submit_design_spec` | `design`, `submit-design` | Inspect or provide design tokens                                                    |
| `get_database_schema`                   | `schema`                  | Show the derived DB schema (Mermaid ER + tables) for validation                     |
| `approve_database_schema`               | `approve-schema`          | Record schema approval (required on the fullstack stack)                            |
| `generate_application`                  | `generate`                | Generate the application (with mock data for a prototype)                           |
| `project_status`                        | `status`                  | What still blocks generation                                                        |

Every CLI command prints JSON. Projects live in `~/.fdea` (override with `FDEA_HOME`).

## Design

Design tokens come from sources ingested with the design role (CSS custom properties, theme color, fonts, radius, image palette), or from tokens the agent submits after looking at an image. With no design source, the shadcn default is used.

## What is generated

- **Fullstack**: data layer, HTTP, auth, optional RBAC, design tokens, login/error shell, shadcn-style primitives, and `UI.md` describing the process pages the agent must build.
- **Cloud** applications use PostgreSQL through `DB_*` variables. **Local** applications use a SQLite file under `storage/`.
- Fullstack foundations always use **Amazon SES** for mail (`SES_*`) and **Amazon S3** for file storage (`S3_*`).
- **With RBAC**, each actor becomes a role and each operation a permission (`entity.operation`). A seeder creates roles and permissions; policies guard every action. The agent UI should hide what a user cannot do.
- **AI-native MCP** at `/mcp`: one tool per process operation. Agents authenticate with a bearer access token (`node ace mcp:token`). When RBAC is on, tools call the same Bouncer policies as the UI.
- State changes in the process become transition actions guarded by the allowed source states; the state field is set by the server, not by free-form edits.
- Sign-up is closed. Users are created with `node ace user:create`.
- The generator checks the foundation: a TypeScript check and a production build. Results, `ui_backlog`, and known limitations are returned by `generate_application`.
- Generation on the fullstack stack is blocked until the user approves the database schema for the current process model.
- A prototype is the same application with mock data only; generation is blocked until valid mock data is submitted.

Known limitations are reported with each generation: process UI is agent-owned, the foundation shell is light-themed, fonts are referenced by name, and PostgreSQL is not exercised during generation.

## Development

```bash
npm ci
npm run build      # compile to dist/
npm run check      # typecheck, lint, tests
```

Generation needs network access to the npm registry and GitHub, because it scaffolds with the official AdonisJS starter kit.

## License

MIT
