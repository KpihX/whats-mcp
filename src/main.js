#!/usr/bin/env node
/**
 * whats-mcp — transport entrypoint.
 */

"use strict";

const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const { connect, requestReconnect } = require("./connection");
const { loadConfig } = require("./config");
const { createHttpApp, bootstrapHttpRuntime } = require("./http_app");
const { createLogger, createMcpServer } = require("./server");

async function serveStdio() {
  const config = loadConfig();
  const logger = createLogger(config);
  const server = createMcpServer(config, logger);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server connected via stdio");
  connect(config).catch((err) => {
    logger.error({ err }, "WhatsApp connection failed");
  });
}

async function serveHttp() {
  const handlers = {
    onReconnect: () => requestReconnect(),
    onRestart: () => process.exit(0),
  };
  const { app, config } = await createHttpApp(handlers);
  const logger = createLogger(config);
  await bootstrapHttpRuntime(handlers);
  app.listen(config.server.http_port, config.server.http_host, () => {
    logger.info(
      {
        host: config.server.http_host,
        port: config.server.http_port,
        mcpPath: config.server.http_mcp_path,
      },
      "whats-mcp HTTP transport listening",
    );
  });
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "serve";
  if (command === "serve" || command === "stdio") {
    await serveStdio();
    return;
  }
  if (command === "serve-http") {
    await serveHttp();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

module.exports = {
  main,
  serveHttp,
  serveStdio,
};
