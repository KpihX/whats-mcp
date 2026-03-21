/**
 * whats-mcp — Helpers & utilities.
 *
 * JID formatting, error wrapping, media resolution, common constants.
 */

"use strict";

const path = require("path");
const fs   = require("fs");

// ── JID helpers ──────────────────────────────────────────────────────────────

/** Normalise a phone number to a WhatsApp personal JID. */
function phoneToJid(phone) {
  const str = String(phone);
  // If it's already a JID (contains @), return as-is — preserve legacy group JIDs like 1234-5678@g.us
  if (str.includes("@")) return str;
  // Strip +, spaces, dashes, parens from plain phone numbers
  const clean = str.replace(/[+\s\-()]/g, "");
  return `${clean}@s.whatsapp.net`;
}

/** Normalise a group JID. */
function groupJid(jid) {
  if (jid.includes("@g.us")) return jid;
  return `${jid}@g.us`;
}

/** Normalise a newsletter/channel JID. */
function newsletterJid(jid) {
  if (jid.includes("@newsletter")) return jid;
  return `${jid}@newsletter`;
}

/** Extract the raw number from a JID. */
function jidToPhone(jid) {
  return (jid || "").split("@")[0].split(":")[0];
}

/** Check if JID is a group. */
function isGroupJid(jid) {
  return (jid || "").endsWith("@g.us");
}

/** Check if JID is a newsletter/channel. */
function isNewsletterJid(jid) {
  return (jid || "").includes("@newsletter");
}

/** Status broadcast JID. */
const STATUS_BROADCAST = "status@broadcast";

// ── Error helpers ────────────────────────────────────────────────────────────

class WhatsAppError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message);
    this.name = "WhatsAppError";
    this.code = code || "WA_ERROR";
  }
}

/** Format an MCP error result. */
function errResult(message) {
  return {
    content: [{ type: "text", text: `❌ ${message}` }],
    isError: true,
  };
}

/** Format an MCP success result. */
function okResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

// ── Media helpers ────────────────────────────────────────────────────────────

/**
 * Resolve a media source — supports:
 * - file:///absolute/path
 * - http(s)://url
 * - base64 data string
 * - local file path
 *
 * Returns an object suitable for Baileys `WAMediaUpload`.
 */
function resolveMedia(source) {
  if (!source) throw new WhatsAppError("Media source is required.");

  // Base64
  if (source.startsWith("data:")) {
    const match = source.match(/^data:[^;]+;base64,(.+)$/);
    if (match) return Buffer.from(match[1], "base64");
    throw new WhatsAppError("Invalid base64 data URI.");
  }

  // Raw base64 (no data: prefix, heuristic)
  if (/^[A-Za-z0-9+/=]{100,}$/.test(source)) {
    return Buffer.from(source, "base64");
  }

  // URL
  if (/^https?:\/\//.test(source)) {
    return { url: source };
  }

  // file:// protocol
  if (source.startsWith("file://")) {
    const filePath = source.replace("file://", "");
    return fs.readFileSync(filePath);
  }

  // Local file path
  if (fs.existsSync(source)) {
    return fs.readFileSync(source);
  }

  throw new WhatsAppError(`Cannot resolve media source: ${source}`);
}

/**
 * Parse a message key from tool arguments.
 * Accepts either a full key object or individual fields.
 */
function parseMessageKey(args) {
  if (args.key) return args.key;
  const { remote_jid, id, from_me, participant } = args;
  if (!remote_jid || !id) {
    throw new WhatsAppError("Message key requires remote_jid and id.");
  }
  return {
    remoteJid: remote_jid,
    id,
    fromMe: from_me ?? false,
    participant: participant || undefined,
  };
}

/**
 * Format a WAMessage for display.
 */
function formatMessage(msg) {
  if (!msg) return null;
  const key = msg.key || {};
  const content = msg.message || {};

  // Determine message type and text
  let type = "unknown";
  let text = "";
  if (content.conversation) {
    type = "text";
    text = content.conversation;
  } else if (content.extendedTextMessage) {
    type = "text";
    text = content.extendedTextMessage.text || "";
  } else if (content.imageMessage) {
    type = "image";
    text = content.imageMessage.caption || "[image]";
  } else if (content.videoMessage) {
    type = "video";
    text = content.videoMessage.caption || "[video]";
  } else if (content.audioMessage) {
    type = content.audioMessage.ptt ? "voice_note" : "audio";
    text = "[audio]";
  } else if (content.documentMessage) {
    type = "document";
    text = content.documentMessage.fileName || "[document]";
  } else if (content.stickerMessage) {
    type = "sticker";
    text = "[sticker]";
  } else if (content.locationMessage) {
    type = "location";
    const loc = content.locationMessage;
    text = `[location: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`;
  } else if (content.contactMessage || content.contactsArrayMessage) {
    type = "contact";
    text = "[contact card]";
  } else if (content.reactionMessage) {
    type = "reaction";
    text = content.reactionMessage.text || "";
  } else if (content.pollCreationMessage || content.pollCreationMessageV3) {
    type = "poll";
    const poll = content.pollCreationMessage || content.pollCreationMessageV3;
    text = poll.name || "[poll]";
  } else if (content.protocolMessage) {
    const proto = content.protocolMessage;
    if (proto.type === 0 || proto.type === "REVOKE") {
      type = "deleted";
      text = "[message deleted]";
    } else if (proto.editedMessage) {
      type = "edited";
      text = "[message edited]";
    } else {
      type = "protocol";
      text = "[system message]";
    }
  } else {
    // Try to find any message type
    const keys = Object.keys(content);
    if (keys.length > 0) {
      type = keys[0].replace("Message", "");
      text = `[${type}]`;
    }
  }

  return {
    id: key.id,
    from: key.remoteJid,
    from_me: key.fromMe || false,
    participant: key.participant || undefined,
    timestamp: msg.messageTimestamp
      ? typeof msg.messageTimestamp === "number"
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp)
      : undefined,
    type,
    text,
    push_name: msg.pushName || undefined,
  };
}

/**
 * Format a chat object for display.
 */
function formatChat(chat) {
  return {
    jid: chat.id,
    name: chat.name || chat.subject || jidToPhone(chat.id),
    unread_count: chat.unreadCount || 0,
    is_group: isGroupJid(chat.id),
    is_newsletter: isNewsletterJid(chat.id),
    archived: chat.archived || false,
    pinned: chat.pinned ? true : false,
    muted: chat.mute ? true : false,
    timestamp: chat.conversationTimestamp
      ? Number(chat.conversationTimestamp)
      : undefined,
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  phoneToJid,
  groupJid,
  newsletterJid,
  jidToPhone,
  isGroupJid,
  isNewsletterJid,
  STATUS_BROADCAST,
  WhatsAppError,
  errResult,
  okResult,
  resolveMedia,
  parseMessageKey,
  formatMessage,
  formatChat,
};
