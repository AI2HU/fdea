import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createProductionService } from "./composition.js";
import { createServer } from "./server/createServer.js";

export const runMcpServer = async (): Promise<void> => {
  const server = createServer(createProductionService());
  await server.connect(new StdioServerTransport());
};
