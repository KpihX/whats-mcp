/**
 * whats-mcp — HTTP surface.
 */

"use strict";

const crypto = require("crypto");
const express = require("express");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const { connect, getConnectionInfo } = require("./connection");
const { loadConfig } = require("./config");
const { createLogger, createMcpServer } = require("./server");
const {
  adminHelpText,
  authSummary,
  healthSummaryText,
  statusSummaryText,
  urlsSummary,
} = require("./admin/service");
const {
  startTelegramAdmin,
  telegramAdminEnabled,
  telegramAdminRuntimeStatus,
} = require("./admin/telegram");

function basePayload(config) {
  const summary = authSummary();
  return {
    ok: true,
    product: "whats-mcp",
    service: "WhatsApp MCP transport bridge",
    version: config.server.version,
    transport: "streamable-http",
    mcp_path: config.server.http_mcp_path,
    public_base_url: config.server.public_base_url,
    fallback_base_url: config.server.fallback_base_url,
    listen_port: config.server.http_port,
    pid: process.pid,
    running: true,
  };
}

function healthHandler(config) {
  return async (_req, res) => {
    const payload = basePayload(config);
    payload.auth = {
      state_directory: authSummary().state_directory,
      auth_directory: authSummary().auth_directory,
      auth_persisted: authSummary().auth_present,
      connection_state: getConnectionInfo().state,
    };
    res.json(payload);
  };
}

function adminStatusHandler(config) {
  return async (_req, res) => {
    const payload = basePayload(config);
    payload.admin = {
      ssh_admin: {
        supported: true,
        examples: [
          "docker compose exec -T whats-mcp whats-admin status",
          "docker compose logs --tail=100 whats-mcp",
        ],
      },
      telegram_admin: {
        supported: true,
        token_env: "TELEGRAM_WHATS_HOMELAB_TOKEN",
        allowed_chat_ids_env: "TELEGRAM_CHAT_IDS",
        configured: telegramAdminEnabled(),
        enabled: telegramAdminEnabled(),
        runtime: telegramAdminRuntimeStatus(),
      },
      auth_probe: {
        state_directory: authSummary().state_directory,
        auth_directory: authSummary().auth_directory,
        auth_persisted: authSummary().auth_present,
        connection_state: getConnectionInfo().state,
      },
      status_summary: statusSummaryText({
        pid: process.pid,
        running: true,
        connection_state: getConnectionInfo().state,
        user: getConnectionInfo().user,
      }),
    };
    payload.routes = {
      health: "/health",
      admin_status: "/admin/status",
      admin_help: "/admin/help",
      mcp: config.server.http_mcp_path,
    };
    res.json(payload);
  };
}

function adminHelpHandler(config) {
  return async (_req, res) => {
    const payload = basePayload(config);
    payload.help = {
      text: adminHelpText(),
      summaries: {
        status: statusSummaryText(),
        health: healthSummaryText(),
        urls: urlsSummary(),
      },
      routes: {
        health: "/health",
        admin_status: "/admin/status",
        admin_help: "/admin/help",
        mcp: config.server.http_mcp_path,
      },
    };
    res.json(payload);
  };
}

async function createHttpApp() {
  const config = loadConfig();
  const logger = createLogger(config);
  const app = express();
  const transports = new Map();

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", healthHandler(config));
  app.get("/admin/status", adminStatusHandler(config));
  app.get("/admin/help", adminHelpHandler(config));

  const mcpPostHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    try {
      let transport;
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && req.body && req.body.method === "initialize") {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) {
            transports.delete(transport.sessionId);
          }
        };
        const server = createMcpServer(config, logger);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error({ err: error }, "Error handling HTTP MCP POST request");
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  app.post(config.server.http_mcp_path, mcpPostHandler);
  app.get(config.server.http_mcp_path, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports.get(sessionId).handleRequest(req, res);
  });
  app.delete(config.server.http_mcp_path, async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await transports.get(sessionId).handleRequest(req, res);
  });

  return { app, config };
}

async function bootstrapHttpRuntime(onRestart) {
  const config = loadConfig();
  await connect(config).catch(() => {});
  startTelegramAdmin(onRestart);
}

module.exports = {
  adminHelpHandler,
  adminStatusHandler,
  bootstrapHttpRuntime,
  createHttpApp,
  healthHandler,
};
