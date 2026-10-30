import type { ToolName } from "./tools.js";

export interface ToolDescription {
  readonly title: string;
  readonly description: string;
  readonly cli: string;
  readonly readOnly: boolean;
}

export const TOOL_DESCRIPTIONS: Record<ToolName, ToolDescription> = {
  create_project: {
    title: "Create a project",
    cli: "init",
    readOnly: false,
    description:
      "Start a project for one piece of software and choose the empty directory it will be generated into. Pass skip_pain when the user wants to skip pain analysis: the sources are then the specification and are applied as asked. Returns project_id used by every other tool.",
  },
  ingest_source: {
    title: "Ingest a document",
    cli: "ingest",
    readOnly: false,
    description:
      "Add a documentation source: a URL, a local file (PDF, DOCX, Markdown, text, HTML) or an image. Text is extracted and stored; images are OCRed. Use role design for brand or UI references so the design can be inferred. Then use read_source to read the text.",
  },
  list_sources: {
    title: "List ingested sources",
    cli: "sources",
    readOnly: true,
    description:
      "List the sources of a project with their kind, size, stored image path and extraction limitations.",
  },
  read_source: {
    title: "Read source text",
    cli: "read",
    readOnly: true,
    description:
      "Read the normalized text of a source, paged by character offset. Read every process source before building the opportunity map and process model.",
  },
  submit_opportunity_map: {
    title: "Submit the opportunity map",
    cli: "submit-opportunities",
    readOnly: false,
    description:
      "Submit the valuable pains and software opportunities found in the documents, each with verbatim evidence. Do not invent ROI. Returns open priority clarifications and a ranking preview.",
  },
  get_opportunity_ranking: {
    title: "Get opportunity ranking",
    cli: "rank-opportunities",
    readOnly: true,
    description:
      "Return an explainable ranking of submitted opportunities from document signals and the user's priority answers. Show the summary to the user before select_opportunity.",
  },
  select_opportunity: {
    title: "Select the build scope",
    cli: "select-opportunity",
    readOnly: false,
    description:
      "Record which opportunity the user chose to implement. Required before submit_process_model, unless the project was created with skip_pain. A new opportunity map invalidates the selection.",
  },
  get_process_model: {
    title: "Get the process model",
    cli: "model",
    readOnly: true,
    description:
      "Return the submitted process model and the clarifications derived from it.",
  },
  submit_process_model: {
    title: "Submit the process model",
    cli: "submit-model",
    readOnly: false,
    description:
      "Submit the process for the selected opportunity: actors, entities with typed fields, and steps with the operations each actor performs. Every element needs verbatim evidence from a source. Anything the sources do not settle or that is out of scope belongs in unknowns. Refuses until an opportunity is selected, unless the project was created with skip_pain — then the model is what the sources ask to build.",
  },
  submit_mock_data: {
    title: "Submit the mock data",
    cli: "submit-mock",
    readOnly: false,
    description:
      "Prototype only. Submit the records the application ships with: rows for every entity of the process model, derived from the context of the sources (their vocabulary, names, places, currencies, volumes, languages, states). Mock data is fictional, never real personal data, and is checked against the model's field types, enums, references and uniqueness. Required before generate_application for a prototype; it survives a new process model only while it still validates.",
  },
  list_clarifications: {
    title: "List clarifications",
    cli: "questions",
    readOnly: true,
    description:
      "List the questions that block generation: opportunity priorities, build scope, fidelity, process gaps and declared unknowns. Projects created with skip_pain omit priority and scope questions. Every build also asks fullstack vs static; fullstack then asks RBAC, cloud vs local, and schema approval. The static stack has no database, so it skips those. A prototype additionally needs submit_mock_data. Ask the user each open question; do not answer for them.",
  },
  answer_clarifications: {
    title: "Answer clarifications",
    cli: "answer",
    readOnly: false,
    description:
      "Record the user's answers by clarification id. Priority answers feed the opportunity ranking. Fidelity and stack answers set directives (the static stack forces no database and ignores RBAC/deployment). Fullstack RBAC and deployment answers set those directives. Answers to process questions require resubmitting the process model. Scope uses select_opportunity.",
  },
  set_implementation_directives: {
    title: "Set implementation directives",
    cli: "directives",
    readOnly: false,
    description:
      "Set fidelity (foundation, or prototype: the same application filled with mock data), stack (fullstack AdonisJS + Vue, or static Astro + Vue), whether the application requires RBAC, and cloud (PostgreSQL) or local (SQLite). The static stack forces no database; deployment and RBAC are ignored.",
  },
  get_design_spec: {
    title: "Get the design specification",
    cli: "design",
    readOnly: true,
    description:
      "Return the design tokens: inferred from design sources, provided by the agent, or the shadcn default when no design is found.",
  },
  submit_design_spec: {
    title: "Submit design tokens",
    cli: "submit-design",
    readOnly: false,
    description:
      "Provide design tokens you derived from design sources, for example after viewing an image's stored file. They replace automatic inference.",
  },
  get_database_schema: {
    title: "Get the database schema",
    cli: "schema",
    readOnly: true,
    description:
      "Fullstack stack only. Return the database schema derived from the process model (tables, columns, foreign keys), including a Mermaid erDiagram and a markdown summary. Show schema.summary to the user, then get their approval before generating. Does not apply to the static stack.",
  },
  approve_database_schema: {
    title: "Approve the database schema",
    cli: "approve-schema",
    readOnly: false,
    description:
      "Fullstack stack only. Record whether the user approved the database schema for the current process model. Required before generate_application on the fullstack stack. Does not apply to the static stack. A new process model invalidates a previous approval.",
  },
  generate_application: {
    title: "Generate the application",
    cli: "generate",
    readOnly: false,
    description:
      "Generate a Vue artifact. fullstack: AdonisJS with Lucid, HTTP, auth, optional RBAC, MCP, design tokens, shell — process pages via UI.md. static: Astro static website with typed content collections, design tokens and layout — pages via UI.md (no server, database, auth or MCP). A prototype is generated the same way and ships the submitted mock data (seeded with db:seed on fullstack, JSON content on static). Refuses until clarifications for the chosen fidelity and stack are settled.",
  },
  project_status: {
    title: "Project status",
    cli: "status",
    readOnly: true,
    description: "Summarize the project and list what still blocks generation.",
  },
};
