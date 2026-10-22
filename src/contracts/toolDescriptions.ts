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
      "Start a project for one piece of software and choose the empty directory it will be generated into. Returns project_id used by every other tool.",
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
      "Record which opportunity the user chose to implement. Required before submit_process_model. A new opportunity map invalidates the selection.",
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
      "Submit the process for the selected opportunity: actors, entities with typed fields, and steps with the operations each actor performs. Every element needs verbatim evidence from a source. Anything the sources do not settle or that is out of scope belongs in unknowns. Refuses until an opportunity is selected.",
  },
  list_clarifications: {
    title: "List clarifications",
    cli: "questions",
    readOnly: true,
    description:
      "List the questions that block generation: opportunity priorities, build scope, RBAC, cloud vs local, process gaps and declared unknowns. Ask the user each open question; do not answer for them.",
  },
  answer_clarifications: {
    title: "Answer clarifications",
    cli: "answer",
    readOnly: false,
    description:
      "Record the user's answers by clarification id. Priority answers feed the opportunity ranking. Fidelity, RBAC and deployment answers set the implementation directives. Answers to process questions require resubmitting the process model. Scope uses select_opportunity.",
  },
  set_implementation_directives: {
    title: "Set implementation directives",
    cli: "directives",
    readOnly: false,
    description:
      "Set fidelity (foundation or prototype), optional prototype variant count, whether the application requires RBAC, and cloud (PostgreSQL) or local (SQLite). Prototypes force local SQLite without RBAC.",
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
      "Return the database schema derived from the process model (tables, columns, foreign keys), including a Mermaid erDiagram and a markdown summary. Show schema.summary (or schema.mermaid in a mermaid fence) to the user so they can see the diagram, then get their approval before generating.",
  },
  approve_database_schema: {
    title: "Approve the database schema",
    cli: "approve-schema",
    readOnly: false,
    description:
      "Record whether the user approved the database schema for the current process model. Required before generate_application. A new process model invalidates a previous approval.",
  },
  generate_application: {
    title: "Generate the application foundation or prototype",
    cli: "generate",
    readOnly: false,
    description:
      "Generate an AdonisJS + Vue artifact. foundation: Lucid, HTTP, auth, optional RBAC, MCP, design tokens, shell — process pages via UI.md. prototype: lightweight gallery with mock fixtures and approach folders via PROTOTYPE.md (no process Lucid/MCP/RBAC). Refuses until clarifications for the chosen fidelity are settled.",
  },
  project_status: {
    title: "Project status",
    cli: "status",
    readOnly: true,
    description: "Summarize the project and list what still blocks generation.",
  },
};
