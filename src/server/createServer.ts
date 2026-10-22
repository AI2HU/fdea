import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FdeaService } from "../application/FdeaService.js";
import { callTool } from "../application/tools.js";
import { TOOL_DESCRIPTIONS } from "../contracts/toolDescriptions.js";
import { TOOL_INPUTS, TOOL_NAMES } from "../contracts/tools.js";
import { PRODUCT_IDENTITY } from "../identity.js";

export const createServer = (service: FdeaService): McpServer => {
  const server = new McpServer({
    name: PRODUCT_IDENTITY.mcpServerName,
    version: PRODUCT_IDENTITY.version,
  });
  for (const name of TOOL_NAMES) {
    const description = TOOL_DESCRIPTIONS[name];
    server.registerTool(
      name,
      {
        title: description.title,
        description: description.description,
        inputSchema: TOOL_INPUTS[name] as z.ZodRawShape,
        annotations: {
          readOnlyHint: description.readOnly,
          destructiveHint: false,
          openWorldHint:
            name === "ingest_source" ||
            name === "generate_application" ||
            name === "submit_opportunity_map",
        },
      },
      async (args: unknown) => {
        const result = await callTool(service, name, args);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                result.ok ? result.value : { error: result.error },
              ),
            },
          ],
          isError: !result.ok,
        };
      },
    );
  }
  return server;
};
