/**
 * whats-mcp — Telegram admin bridge.
 */

"use strict";

const {
  adminHelpText,
  appendAdminLog,
  getLogsText,
  healthSummaryText,
  statusSummaryText,
  urlsSummary,
} = require("./service");

const TELEGRAM_RUNTIME = {
  enabled: false,
  started: false,
  thread_alive: false,
  allowed_chat_ids: [],
  allowed_chat_count: 0,
  started_at: null,
  last_poll_at: null,
  last_success_at: null,
  last_update_id: null,
  last_chat_id: null,
  last_command: null,
  last_reply_preview: null,
  last_error: null,
};

let pollerHandle = null;

function telegramAdminEnabled() {
  return Boolean(process.env.TELEGRAM_WHATS_HOMELAB_TOKEN && process.env.TELEGRAM_CHAT_IDS);
}

function telegramAdminRuntimeStatus() {
  return { ...TELEGRAM_RUNTIME };
}

async function apiCall(method, body) {
  const token = process.env.TELEGRAM_WHATS_HOMELAB_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.description || `Telegram API call failed: ${method}`);
  }
  return payload.result;
}

async function sendMessage(chatId, text) {
  await apiCall("sendMessage", { chat_id: chatId, text });
}

function parseAllowedChatIds() {
  return String(process.env.TELEGRAM_CHAT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function dispatchTelegramCommand(command, args, onRestart) {
  if (command === "/start" || command === "/help") return adminHelpText();
  if (command === "/status") return statusSummaryText();
  if (command === "/health") return healthSummaryText();
  if (command === "/urls") return urlsSummary();
  if (command === "/logs") {
    const limit = Number.parseInt(args[0] || "20", 10);
    return getLogsText(Number.isNaN(limit) ? 20 : limit);
  }
  if (command === "/restart") {
    if (onRestart) {
      setTimeout(() => onRestart(), 1000);
    }
    return "whats-mcp restart requested";
  }
  return "Unknown command. Use /help.";
}

function startTelegramAdmin(onRestart) {
  if (pollerHandle || !telegramAdminEnabled()) {
    return;
  }
  const allowedChatIds = parseAllowedChatIds();
  TELEGRAM_RUNTIME.enabled = true;
  TELEGRAM_RUNTIME.started = true;
  TELEGRAM_RUNTIME.thread_alive = true;
  TELEGRAM_RUNTIME.allowed_chat_ids = allowedChatIds;
  TELEGRAM_RUNTIME.allowed_chat_count = allowedChatIds.length;
  TELEGRAM_RUNTIME.started_at = Math.floor(Date.now() / 1000);

  let offset = 0;
  pollerHandle = setInterval(async () => {
    TELEGRAM_RUNTIME.last_poll_at = Math.floor(Date.now() / 1000);
    try {
      const updates = await apiCall("getUpdates", {
        timeout: 0,
        offset,
        allowed_updates: ["message"],
      });
      TELEGRAM_RUNTIME.last_success_at = Math.floor(Date.now() / 1000);
      for (const update of updates) {
        offset = update.update_id + 1;
        TELEGRAM_RUNTIME.last_update_id = update.update_id;
        const message = update.message;
        if (!message || !message.text) continue;
        const chatId = String(message.chat.id);
        TELEGRAM_RUNTIME.last_chat_id = chatId;
        if (!allowedChatIds.includes(chatId)) continue;
        const [command, ...args] = message.text.trim().split(/\s+/);
        TELEGRAM_RUNTIME.last_command = command;
        const reply = dispatchTelegramCommand(command, args, onRestart);
        TELEGRAM_RUNTIME.last_reply_preview = reply.slice(0, 120);
        appendAdminLog(`telegram command chat=${chatId} command=${command}`);
        await sendMessage(chatId, reply);
        appendAdminLog(`telegram reply chat=${chatId} preview=${reply.slice(0, 120)}`);
      }
      TELEGRAM_RUNTIME.last_error = null;
    } catch (error) {
      TELEGRAM_RUNTIME.last_error = error.message || String(error);
      appendAdminLog(`telegram error ${TELEGRAM_RUNTIME.last_error}`);
    }
  }, 5000);
}

module.exports = {
  dispatchTelegramCommand,
  startTelegramAdmin,
  telegramAdminEnabled,
  telegramAdminRuntimeStatus,
};
