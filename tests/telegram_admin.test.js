"use strict";

jest.mock("../src/admin/service", () => ({
  adminHelpText: jest.fn(() => "HELP"),
  appendAdminLog: jest.fn(),
  getLogsText: jest.fn((limit) => `LOGS:${limit}`),
  healthSummaryText: jest.fn(() => "HEALTH"),
  statusSummaryText: jest.fn(() => "STATUS"),
  urlsSummary: jest.fn(() => "URLS"),
}));

describe("telegram admin dispatch", () => {
  test("reports enablement from environment", () => {
    jest.resetModules();
    process.env.TELEGRAM_WHATS_HOMELAB_TOKEN = "token";
    process.env.TELEGRAM_CHAT_IDS = "1,2";
    const { telegramAdminEnabled } = require("../src/admin/telegram");
    expect(telegramAdminEnabled()).toBe(true);
  });

  test("dispatches supported commands", () => {
    jest.resetModules();
    const { dispatchTelegramCommand } = require("../src/admin/telegram");
    expect(dispatchTelegramCommand("/help", [], null)).toBe("HELP");
    expect(dispatchTelegramCommand("/status", [], null)).toBe("STATUS");
    expect(dispatchTelegramCommand("/health", [], null)).toBe("HEALTH");
    expect(dispatchTelegramCommand("/urls", [], null)).toBe("URLS");
    expect(dispatchTelegramCommand("/logs", ["7"], null)).toBe("LOGS:7");
  });

  test("dispatches restart via callback", () => {
    jest.useFakeTimers();
    jest.resetModules();
    const restart = jest.fn();
    const { dispatchTelegramCommand } = require("../src/admin/telegram");
    expect(dispatchTelegramCommand("/restart", [], restart)).toBe("whats-mcp reconnect requested");
  });
});
