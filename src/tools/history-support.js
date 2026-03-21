"use strict";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMessageTimestampSeconds(message) {
  if (!message?.messageTimestamp) return 0;
  return typeof message.messageTimestamp === "number"
    ? message.messageTimestamp
    : Number(message.messageTimestamp);
}

function getMessageTimestampMs(message) {
  return getMessageTimestampSeconds(message) * 1000;
}

async function fetchAdditionalHistory({
  sock,
  store,
  jid,
  beforeId,
  limit = 50,
  historyCount,
  waitMs = 3500,
  enabled = true,
}) {
  const beforeCount = typeof store.countMessages === "function"
    ? store.countMessages(jid)
    : (store.messages.get(jid) || []).length;

  const result = {
    enabled: enabled !== false,
    requested: false,
    received: false,
    reason: null,
    before_count: beforeCount,
    after_count: beforeCount,
    anchor_id: null,
    requested_count: 0,
    wait_ms: Math.max(250, Math.min(waitMs || 3500, 15000)),
  };

  if (enabled === false) {
    result.reason = "disabled";
    return result;
  }

  if (!sock || typeof sock.fetchMessageHistory !== "function") {
    result.reason = "unsupported";
    return result;
  }

  let anchor = beforeId ? store.getMessage(beforeId) : null;
  if (!anchor && typeof store.getOldestMessage === "function") {
    anchor = store.getOldestMessage(jid);
  }

  if (!anchor?.key?.id || !anchor?.key?.remoteJid) {
    result.reason = "no_anchor";
    return result;
  }

  const anchorTimestampSeconds = getMessageTimestampSeconds(anchor);
  if (!anchorTimestampSeconds) {
    result.reason = "missing_anchor_timestamp";
    return result;
  }

  const initialOldest = typeof store.getOldestMessage === "function"
    ? store.getOldestMessage(jid)
    : anchor;
  const initialOldestId = initialOldest?.key?.id || null;
  const initialOldestTs = getMessageTimestampSeconds(initialOldest) || anchorTimestampSeconds;
  const requestedCount = Math.max(1, Math.min(historyCount || Math.max(limit, 50), 200));

  await sock.fetchMessageHistory(requestedCount, anchor.key, getMessageTimestampMs(anchor));
  result.requested = true;
  result.anchor_id = anchor.key.id;
  result.requested_count = requestedCount;

  const deadline = Date.now() + result.wait_ms;
  while (Date.now() < deadline) {
    await sleep(250);

    const afterCount = typeof store.countMessages === "function"
      ? store.countMessages(jid)
      : (store.messages.get(jid) || []).length;
    const oldest = typeof store.getOldestMessage === "function"
      ? store.getOldestMessage(jid)
      : null;
    const oldestId = oldest?.key?.id || null;
    const oldestTs = getMessageTimestampSeconds(oldest);

    if (
      afterCount > beforeCount
      || (oldestId && oldestId !== initialOldestId)
      || (oldestTs && oldestTs < initialOldestTs)
    ) {
      result.received = true;
      break;
    }
  }

  result.after_count = typeof store.countMessages === "function"
    ? store.countMessages(jid)
    : (store.messages.get(jid) || []).length;
  result.reason = result.received ? "history_updated" : "timeout";
  return result;
}

module.exports = {
  fetchAdditionalHistory,
};