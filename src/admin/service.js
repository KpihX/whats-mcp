/**
 * whats-mcp — shared admin helpers.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadConfig } = require("../config");
const { getConnectionInfo } = require("../connection");

function stateDir() {
  const cfg = loadConfig();
  return (cfg.server?.state_directory || "~/.mcps/whatsapp").replace(/^~/, os.homedir());
}

function authDir() {
  return path.join(stateDir(), "auth");
}

function pidFile() {
  return path.join(stateDir(), "whats-mcp.pid");
}

function logFile() {
  return path.join(stateDir(), "whats-mcp.log");
}

function appendAdminLog(message) {
  fs.mkdirSync(stateDir(), { recursive: true });
  const line = `${new Date().toISOString()} ${message}\n`;
  fs.appendFileSync(logFile(), line, "utf-8");
}

function authExists() {
  const dir = authDir();
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

function readPid() {
  try {
    return parseInt(fs.readFileSync(pidFile(), "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function authSummary() {
  return {
    state_directory: stateDir(),
    auth_directory: authDir(),
    auth_present: authExists(),
    pid: readPid(),
    running: isRunning(readPid()),
    connection: getConnectionInfo(),
  };
}

function statusSummaryText(overrides = {}) {
  const cfg = loadConfig();
  const summary = authSummary();
  const pid = overrides.pid ?? summary.pid;
  const running = overrides.running ?? summary.running;
  const connectionState = overrides.connection_state ?? summary.connection.state;
  const user = overrides.user ?? summary.connection.user;
  const lines = [
    "whats-admin status",
    `- service: ${cfg.server.name} ${cfg.server.version}`,
    `- state directory: ${summary.state_directory}`,
    `- auth persisted: ${summary.auth_present ? "yes" : "no"}`,
    `- server running: ${running ? `yes (pid ${pid})` : "no"}`,
    `- connection state: ${connectionState}`,
  ];
  if (user) {
    lines.push(`- account: ${user.name || "?"} (${user.phone || "?"})`);
  }
  return lines.join("\n");
}

function healthSummaryText() {
  const cfg = loadConfig();
  return [
    "whats-mcp health",
    `- public: ${cfg.server.public_base_url}`,
    `- fallback: ${cfg.server.fallback_base_url}`,
    `- mcp: ${cfg.server.public_base_url}${cfg.server.http_mcp_path}`,
    `- local port: ${cfg.server.http_port}`,
  ].join("\n");
}

function urlsSummary() {
  const cfg = loadConfig();
  return [
    "whats-mcp URLs",
    `- public: ${cfg.server.public_base_url}`,
    `- fallback: ${cfg.server.fallback_base_url}`,
    `- mcp: ${cfg.server.public_base_url}${cfg.server.http_mcp_path}`,
    `- health: ${cfg.server.public_base_url}/health`,
    `- admin status: ${cfg.server.public_base_url}/admin/status`,
    `- admin help: ${cfg.server.public_base_url}/admin/help`,
  ].join("\n");
}

function adminHelpText() {
  return [
    "whats-admin capabilities",
    "- CLI:",
    "  - whats-admin status",
    "  - whats-admin guide",
    "  - whats-admin login [--code] [--phone N]",
    "  - whats-admin logout [-f]",
    "  - whats-admin server status|stop|restart|reconnect|pid|test",
    "  - whats-admin config show|edit|reset|path",
    "  - whats-admin logs show|tail|clean|path",
    "- HTTP:",
    "  - GET /health",
    "  - GET /admin/status",
    "  - GET /admin/help",
    "- Telegram:",
    "  - /start",
    "  - /help",
    "  - /status",
    "  - /health",
    "  - /urls",
    "  - /logs [lines]",
    "  - /reconnect",
    "  - /restart",
  ].join("\n");
}

function getLogsText(limit = 50) {
  const file = logFile();
  if (!fs.existsSync(file)) {
    return "No admin log lines available.";
  }
  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return "No admin log lines available.";
  }
  return lines.slice(-Math.max(1, limit)).join("\n");
}

module.exports = {
  adminHelpText,
  authDir,
  authExists,
  authSummary,
  appendAdminLog,
  getLogsText,
  healthSummaryText,
  isRunning,
  logFile,
  pidFile,
  readPid,
  stateDir,
  statusSummaryText,
  urlsSummary,
};
