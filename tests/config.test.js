/**
 * Tests — config.js
 */

const path = require("path");
const { loadConfig, DEFAULTS } = require("../src/config");
const PKG = require("../package.json");

describe("loadConfig", () => {
  test("loads config.json and applies defaults", () => {
    const cfg = loadConfig();
    expect(cfg.server.name).toBe(PKG.name);
    expect(cfg.server.version).toBe(PKG.version);
    expect(cfg.connection.print_qr_in_terminal).toBe(true);
    expect(cfg.connection.sync_full_history).toBe(true);
    expect(cfg.connection.refresh_app_state_on_open).toBe(true);
    expect(cfg.store.max_messages_per_chat).toBe(5000);
    expect(cfg.store.persist).toBe(true);
    expect(cfg.logging.level).toBe("error");
  });

  test("config has all default keys", () => {
    const cfg = loadConfig();
    expect(cfg.server).toBeDefined();
    expect(cfg.connection).toBeDefined();
    expect(cfg.store).toBeDefined();
    expect(cfg.logging).toBeDefined();
  });

  test("env override for state dir", () => {
    process.env.WHATSAPP_STATE_DIR = "/tmp/wa-test";
    const cfg = loadConfig();
    expect(cfg.server.state_directory).toBe("/tmp/wa-test");
    delete process.env.WHATSAPP_STATE_DIR;
  });

  test("env override for log level", () => {
    process.env.WHATSAPP_LOG_LEVEL = "debug";
    const cfg = loadConfig();
    expect(cfg.logging.level).toBe("debug");
    delete process.env.WHATSAPP_LOG_LEVEL;
  });

  test("env override for max reconnect", () => {
    process.env.WHATSAPP_MAX_RECONNECT = "5";
    const cfg = loadConfig();
    expect(cfg.connection.max_reconnect_attempts).toBe(5);
    delete process.env.WHATSAPP_MAX_RECONNECT;
  });

  test("env override for QR printing", () => {
    process.env.WHATSAPP_PRINT_QR = "false";
    const cfg = loadConfig();
    expect(cfg.connection.print_qr_in_terminal).toBe(false);
    delete process.env.WHATSAPP_PRINT_QR;
  });

  test("env override for full history sync", () => {
    process.env.WHATSAPP_SYNC_FULL_HISTORY = "false";
    const cfg = loadConfig();
    expect(cfg.connection.sync_full_history).toBe(false);
    delete process.env.WHATSAPP_SYNC_FULL_HISTORY;
  });

  test("env override for app state refresh", () => {
    process.env.WHATSAPP_REFRESH_APP_STATE = "false";
    const cfg = loadConfig();
    expect(cfg.connection.refresh_app_state_on_open).toBe(false);
    delete process.env.WHATSAPP_REFRESH_APP_STATE;
  });

  test("env override for store persistence", () => {
    process.env.WHATSAPP_PERSIST_STORE = "false";
    const cfg = loadConfig();
    expect(cfg.store.persist).toBe(false);
    delete process.env.WHATSAPP_PERSIST_STORE;
  });

  test("env override for max messages per chat", () => {
    process.env.WHATSAPP_MAX_MESSAGES_PER_CHAT = "1200";
    const cfg = loadConfig();
    expect(cfg.store.max_messages_per_chat).toBe(1200);
    delete process.env.WHATSAPP_MAX_MESSAGES_PER_CHAT;
  });

  test("DEFAULTS has proper structure", () => {
    expect(DEFAULTS.server.name).toBeUndefined();
    expect(DEFAULTS.connection.reconnect_interval_ms).toBe(3000);
    expect(DEFAULTS.store.max_chats).toBe(1000);
  });
});
