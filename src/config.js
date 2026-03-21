/**
 * whats-mcp — Configuration loader.
 *
 * Loads package-internal .env defaults, then config.json, then
 * environment variable overrides.
 */

"use strict";

const fs   = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "config.json");
const PACKAGE_JSON = require(path.join(__dirname, "..", "package.json"));
const ENV_FILE = path.join(__dirname, ".env");

const DEFAULTS = {
  server: {
    state_directory: "~/.mcps/whatsapp",
    http_host: "127.0.0.1",
    http_port: 8092,
    http_mcp_path: "/mcp",
    public_base_url: "https://whats.kpihx-labs.com",
    fallback_base_url: "https://whats.homelab",
  },
  connection: {
    print_qr_in_terminal: true,
    reconnect_interval_ms: 3000,
    max_reconnect_attempts: 10,
    mark_online_on_connect: false,
    sync_full_history: true,
    refresh_app_state_on_open: true,
  },
  store: {
    max_messages_per_chat: 5000,
    max_chats: 1000,
    persist: true,
  },
  logging: {
    level: "error",
  },
  watchlists: {},
};

/**
 * Deep-merge b into a (b wins). Mutates a.
 */
function _merge(a, b) {
  for (const key of Object.keys(b)) {
    if (
      a[key] &&
      typeof a[key] === "object" &&
      !Array.isArray(a[key]) &&
      typeof b[key] === "object" &&
      !Array.isArray(b[key])
    ) {
      _merge(a[key], b[key]);
    } else {
      a[key] = b[key];
    }
  }
  return a;
}

function _loadEnvDefaults() {
  if (!fs.existsSync(ENV_FILE)) {
    return;
  }
  const raw = fs.readFileSync(ENV_FILE, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Load and return the merged configuration.
 */
function loadConfig() {
  _loadEnvDefaults();
  const config = JSON.parse(JSON.stringify(DEFAULTS));
  config.server.name = PACKAGE_JSON.name;
  config.server.version = PACKAGE_JSON.version;

  // Load config.json if it exists
  if (fs.existsSync(CONFIG_FILE)) {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const fileConfig = JSON.parse(raw);
    _merge(config, fileConfig);
  }

  // Environment variable overrides
  if (process.env.WHATSAPP_STATE_DIR) {
    config.server.state_directory = process.env.WHATSAPP_STATE_DIR;
  }
  if (process.env.WHATSAPP_LOG_LEVEL) {
    config.logging.level = process.env.WHATSAPP_LOG_LEVEL;
  }
  if (process.env.WHATSAPP_MAX_RECONNECT) {
    config.connection.max_reconnect_attempts = parseInt(process.env.WHATSAPP_MAX_RECONNECT, 10);
  }
  if (process.env.WHATSAPP_PRINT_QR !== undefined) {
    config.connection.print_qr_in_terminal = process.env.WHATSAPP_PRINT_QR !== "false";
  }
  if (process.env.WHATSAPP_SYNC_FULL_HISTORY !== undefined) {
    config.connection.sync_full_history = process.env.WHATSAPP_SYNC_FULL_HISTORY !== "false";
  }
  if (process.env.WHATSAPP_REFRESH_APP_STATE !== undefined) {
    config.connection.refresh_app_state_on_open = process.env.WHATSAPP_REFRESH_APP_STATE !== "false";
  }
  if (process.env.WHATSAPP_PERSIST_STORE !== undefined) {
    config.store.persist = process.env.WHATSAPP_PERSIST_STORE !== "false";
  }
  if (process.env.WHATSAPP_MAX_MESSAGES_PER_CHAT) {
    config.store.max_messages_per_chat = parseInt(process.env.WHATSAPP_MAX_MESSAGES_PER_CHAT, 10);
  }
  if (process.env.WHATS_MCP_HTTP_HOST) {
    config.server.http_host = process.env.WHATS_MCP_HTTP_HOST;
  }
  if (process.env.WHATS_MCP_HTTP_PORT) {
    config.server.http_port = parseInt(process.env.WHATS_MCP_HTTP_PORT, 10);
  }
  if (process.env.WHATS_MCP_HTTP_MCP_PATH) {
    config.server.http_mcp_path = process.env.WHATS_MCP_HTTP_MCP_PATH;
  }
  if (process.env.WHATS_MCP_PUBLIC_BASE_URL) {
    config.server.public_base_url = process.env.WHATS_MCP_PUBLIC_BASE_URL;
  }
  if (process.env.WHATS_MCP_FALLBACK_BASE_URL) {
    config.server.fallback_base_url = process.env.WHATS_MCP_FALLBACK_BASE_URL;
  }

  return config;
}

module.exports = { loadConfig, DEFAULTS };
