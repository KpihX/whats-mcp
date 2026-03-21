"use strict";

jest.mock("../src/admin/service", () => ({
  adminHelpText: jest.fn(() => "HELP"),
  appendAdminLog: jest.fn(),
  getLogsText: jest.fn((limit) => `LOGS:${limit}`),
  healthSummaryText: jest.fn(() => "HEALTH"),
  requestPairingCode: jest.fn(async (phone) => ({ phone, code: "PAIR1234" })),
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

    test("dispatches supported commands", async () => {
      jest.resetModules();
      const { dispatchTelegramCommand } = require("../src/admin/telegram");
      await expect(dispatchTelegramCommand("/help", [], null)).resolves.toBe("HELP");
      await expect(dispatchTelegramCommand("/status", [], null)).resolves.toBe("STATUS");
      await expect(dispatchTelegramCommand("/health", [], null)).resolves.toBe("HEALTH");
      await expect(dispatchTelegramCommand("/urls", [], null)).resolves.toBe("URLS");
      await expect(dispatchTelegramCommand("/logs", ["7"], null)).resolves.toBe("LOGS:7");
      await expect(dispatchTelegramCommand("/pair_code", ["+33605957785"], null)).resolves.toContain("PAIR1234");
    });

    test("dispatches restart via callback", () => {
      jest.useFakeTimers();
      jest.resetModules();
      const restart = jest.fn();
      const { dispatchTelegramCommand } = require("../src/admin/telegram");
      return expect(dispatchTelegramCommand("/restart", [], restart)).resolves.toBe("whats-mcp reconnect requested");
    });
  });
