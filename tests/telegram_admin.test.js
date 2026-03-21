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
      await expect(dispatchTelegramCommand("/help", [], {})).resolves.toBe("HELP");
      await expect(dispatchTelegramCommand("/status", [], {})).resolves.toBe("STATUS");
      await expect(dispatchTelegramCommand("/health", [], {})).resolves.toBe("HEALTH");
      await expect(dispatchTelegramCommand("/urls", [], {})).resolves.toBe("URLS");
      await expect(dispatchTelegramCommand("/logs", ["7"], {})).resolves.toBe("LOGS:7");
      await expect(dispatchTelegramCommand("/pair_code", ["+33605957785"], {})).resolves.toContain("PAIR1234");
    });

    test("dispatches reconnect without restart", async () => {
      jest.resetModules();
      const handlers = {
        onReconnect: jest.fn().mockResolvedValue(undefined),
        onRestart: jest.fn(),
      };
      const { dispatchTelegramCommand } = require("../src/admin/telegram");
      await expect(dispatchTelegramCommand("/reconnect", [], handlers)).resolves.toBe("whats-mcp reconnect requested");
      expect(handlers.onReconnect).toHaveBeenCalledTimes(1);
      expect(handlers.onRestart).not.toHaveBeenCalled();
    });

    test("dispatches restart via callback", async () => {
      jest.useFakeTimers();
      jest.resetModules();
      const handlers = {
        onReconnect: jest.fn(),
        onRestart: jest.fn(),
      };
      const { dispatchTelegramCommand } = require("../src/admin/telegram");
      await expect(dispatchTelegramCommand("/restart", [], handlers)).resolves.toBe("whats-mcp restart requested");
      jest.runOnlyPendingTimers();
      expect(handlers.onRestart).toHaveBeenCalledTimes(1);
      expect(handlers.onReconnect).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
