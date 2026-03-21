/**
 * whats-mcp — shared MCP server construction.
 *
 * The same logical MCP surface is reused by:
 *   - stdio transport
 *   - HTTP streamable transport
 */

"use strict";

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const pino = require("pino");

const { getSocket, getStore, getConnectionInfo } = require("./connection");
const { listTools, callTool } = require("./tools/registry");

function createLogger(config) {
  return pino({ level: config.logging?.level || "error" }, pino.destination(2));
}

function createMcpServer(config, logger = createLogger(config)) {
  const server = new Server(
    {
      name: config.server.name,
      version: config.server.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const ctx = {
      get sock() {
        return getSocket();
      },
      store: getStore(),
      connectionInfo: getConnectionInfo,
      config,
    };

    logger.info({ tool: name }, "CallTool");
    const result = await callTool(name, args, ctx);
    if (result.isError) {
      logger.warn({ tool: name, result }, "Tool error");
    }
    return result;
  });

  return server;
}

module.exports = {
  createLogger,
  createMcpServer,
};
