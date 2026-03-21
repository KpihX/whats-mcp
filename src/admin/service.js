/**
 * whats-mcp — shared admin helpers.
 */

"use strict";

const { spawn } = require("child_process");
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

const PAIRING_RUNTIME = {
  active: false,
  phone: null,
  started_at: null,
  pairing_code: null,
  last_error: null,
};

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
    "  - POST /admin/reconnect",
    "  - POST /admin/pair-code {\"phone\":\"33612345678\"}",
    "- Telegram:",
    "  - /start",
    "  - /help",
    "  - /status",
    "  - /health",
    "  - /urls",
    "  - /logs [lines]",
    "  - /pair_code <phone>",
    "  - /reconnect",
    "  - /restart",
  ].join("\n");
}

function normalizePhoneNumber(raw) {
  return String(raw || "").replace(/[^\d]/g, "");
}

function pairingRuntimeStatus() {
  return { ...PAIRING_RUNTIME };
}

function requestPairingCode(phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone || !/^\d{8,15}$/.test(normalizedPhone)) {
    throw new Error("Invalid phone number. Use country code; separators are allowed and will be stripped.");
  }
  if (PAIRING_RUNTIME.active) {
    const activeFor = PAIRING_RUNTIME.phone || "another number";
    throw new Error(`A pairing flow is already active for ${activeFor}. Finish or wait for it to time out.`);
  }

  return new Promise((resolve, reject) => {
    const cliEntry = path.join(__dirname, "..", "admin.js");
    const child = spawn(
      process.execPath,
      [cliEntry, "login", "--code", "--phone", normalizedPhone, "--force"],
      {
        cwd: path.resolve(__dirname, ".."),
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    PAIRING_RUNTIME.active = true;
    PAIRING_RUNTIME.phone = normalizedPhone;
    PAIRING_RUNTIME.started_at = Math.floor(Date.now() / 1000);
    PAIRING_RUNTIME.pairing_code = null;
    PAIRING_RUNTIME.last_error = null;

    const cleanup = (errorMessage = null) => {
      PAIRING_RUNTIME.active = false;
      PAIRING_RUNTIME.phone = null;
      PAIRING_RUNTIME.started_at = null;
      if (errorMessage) {
        PAIRING_RUNTIME.last_error = errorMessage;
      }
    };

    let settled = false;
    const handleChunk = (chunk) => {
      const text = String(chunk || "");
      const plainText = text.replace(/\x1B\[[0-9;]*m/g, "");
      const match = plainText.match(/Pairing Code:\s*([A-Z0-9-]+)/i);
      if (!match || settled) return;
      settled = true;
      const code = match[1];
      PAIRING_RUNTIME.pairing_code = code;
      appendAdminLog(`pairing code generated for ${normalizedPhone}`);
      resolve({
        phone: normalizedPhone,
        code,
      });
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", (error) => {
      cleanup(error.message || String(error));
      if (!settled) {
        settled = true;
        reject(error);
      }
    });

    child.on("exit", (code, signal) => {
      const errorMessage =
        code === 0 && !signal
          ? null
          : `pairing helper exited with code=${code ?? "null"} signal=${signal ?? "null"}`;
      cleanup(errorMessage);
      if (!settled) {
        settled = true;
        reject(new Error(PAIRING_RUNTIME.last_error || "Pairing flow ended before a code was produced."));
      }
    });
  });
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
  normalizePhoneNumber,
  pairingRuntimeStatus,
  pidFile,
  requestPairingCode,
  readPid,
  stateDir,
  statusSummaryText,
  urlsSummary,
};
