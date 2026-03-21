/**
 * whats-mcp — Utility tools (6 tools).
 *
 * connection_status, whatsapp_guide, send_presence,
 * read_messages, search_messages, download_media,
 * analytics_overview, analytics_top_chats, analytics_chat_insights,
 * analytics_timeline, analytics_search
 */

"use strict";

const { phoneToJid, okResult, errResult } = require("../helpers");

module.exports = [
  // 1. connection_status
  {
    definition: {
      name: "connection_status",
      description:
        "Check the WhatsApp connection status, account info, and store statistics.",
      inputSchema: { type: "object", properties: {} },
    },
    handler: async (_args, ctx) => {
      // Don't destructure sock — this tool must work even when disconnected
      const info = ctx.connectionInfo();
      return okResult(info);
    },
  },

  // 2. whatsapp_guide
  {
    definition: {
      name: "whatsapp_guide",
      description:
        "Get a comprehensive guide on how to use whats-mcp tools." +
        " Optionally filter by category.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "overview", "messaging", "chats", "contacts",
              "groups", "profile", "channels", "labels", "analytics", "utilities",
            ],
            description: "Category to get help for. Default: overview.",
          },
        },
      },
    },
    handler: async ({ category }, { toolDefs, config }) => {
      const cat = category || "overview";

      if (cat === "overview") {
        const categories = {};
        for (const t of toolDefs) {
          // Derive category from tool placement
          const c = _guessCategory(t.name);
          if (!categories[c]) categories[c] = [];
          categories[c].push(t.name);
        }
        return okResult({
          server: config?.server?.name || "whats-mcp",
          version: config?.server?.version || "0.1.0",
          total_tools: toolDefs.length,
          categories,
          tips: [
            "JIDs: Use phone numbers (e.g. 33612345678) or full JIDs (33612345678@s.whatsapp.net).",
            "Groups: Group JIDs end with @g.us (e.g. 120363xxx@g.us).",
            "Channels: Newsletter JIDs end with @newsletter.",
            "Media: Send images/videos/documents via URL, base64, or local file path.",
            "Batch: Use batch_send_text to send the same message to multiple recipients.",
            "Reactions: Use send_reaction with an emoji to react, empty string to remove.",
            "Reply: Use quoted_id parameter in send_* tools to reply to a specific message.",
          ],
        });
      }

      // Filter tools by category
      const catTools = toolDefs.filter((t) => _guessCategory(t.name) === cat);
      return okResult({
        category: cat,
        tools: catTools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema?.properties
            ? Object.keys(t.inputSchema.properties)
            : [],
          required: t.inputSchema?.required || [],
        })),
      });
    },
  },

  // 3. send_presence
  {
    definition: {
      name: "send_presence",
      description:
        "Send a presence update or typing indicator." +
        " Presence: 'available' (online), 'unavailable' (offline)." +
        " Typing: 'composing' (typing), 'recording' (recording audio), 'paused' (stopped typing).",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["available", "unavailable", "composing", "recording", "paused"],
            description: "Presence type to send.",
          },
          jid: {
            type: "string",
            description: "Chat JID for composing/recording/paused (required for typing indicators).",
          },
        },
        required: ["type"],
      },
    },
    handler: async ({ type, jid }, { sock }) => {
      if (type === "available" || type === "unavailable") {
        await sock.sendPresenceUpdate(type);
        return okResult({ status: type });
      }
      // Typing indicators require a JID
      if (!jid) {
        return errResult("JID is required for typing indicators (composing/recording/paused).");
      }
      const chatJid = phoneToJid(jid);
      await sock.sendPresenceUpdate(type, chatJid);
      return okResult({ status: type, jid: chatJid });
    },
  },

  // 4. read_messages
  {
    definition: {
      name: "read_messages",
      description:
        "Mark specific messages as read (send read receipts)." +
        " Provide the chat JID and message IDs to mark as read.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Chat JID." },
          message_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of message IDs to mark as read.",
          },
          participant: {
            type: "string",
            description: "Sender JID (required for group messages to send proper receipts).",
          },
        },
        required: ["jid", "message_ids"],
      },
    },
    handler: async ({ jid, message_ids, participant }, { sock }) => {
      const chatJid = phoneToJid(jid);
      const keys = message_ids.map((id) => ({
        remoteJid: chatJid,
        id,
        ...(participant ? { participant } : {}),
      }));
      await sock.readMessages(keys);
      return okResult({
        status: "read",
        jid: chatJid,
        count: message_ids.length,
      });
    },
  },

  // 5. search_messages
  {
    definition: {
      name: "search_messages",
      description:
        "Search messages in the local store by text content." +
        " Filter by one or multiple chat JIDs, time range, and message types." +
        " Only searches messages already in memory.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for (case-insensitive)." },
          jid: { type: "string", description: "Optional: limit search to this chat JID or phone number." },
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Optional: search across multiple chat JIDs. Takes precedence over jid.",
          },
          limit: { type: "integer", description: "Max results (default 50, max 200)." },
          since: {
            type: "integer",
            description: "Unix timestamp: only include messages sent at or after this time.",
          },
          until: {
            type: "integer",
            description: "Unix timestamp: only include messages sent at or before this time.",
          },
          include_types: {
            type: "array",
            items: { type: "string" },
            description: "If set, only include messages of these types.",
          },
          exclude_types: {
            type: "array",
            items: { type: "string" },
            description: "Exclude messages of these types.",
          },
        },
        required: ["query"],
      },
    },
    handler: async ({ query, jid, jids, limit, since, until, include_types, exclude_types }, { store }) => {
      let chatJids = null;
      if (jids && jids.length > 0) {
        chatJids = jids.map(phoneToJid);
      } else if (jid) {
        chatJids = phoneToJid(jid);
      }
      const lim = Math.min(limit || 50, 200);
      const results = store.searchMessages(query, chatJids, lim, {
        since: since || undefined,
        until: until || undefined,
        types: include_types || undefined,
        excludeTypes: exclude_types || undefined,
      });
      return okResult({
        query,
        count: results.length,
        messages: results,
      });
    },
  },

  // 6. download_media
  {
    definition: {
      name: "download_media",
      description:
        "Download media (image, video, audio, document, sticker) from a message." +
        " Returns the media as base64-encoded data." +
        " The message must be in the local store.",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Message ID containing media." },
        },
        required: ["message_id"],
      },
    },
    handler: async ({ message_id }, { sock, store }) => {
      const msg = store.getMessage(message_id);
      if (!msg) {
        return errResult(`Message ${message_id} not found in store.`);
      }

      // Find the media content in the message
      const m = msg.message;
      if (!m) return errResult("Message has no content.");

      let mediaMsg = null;
      let mediaType = null;
      const mediaTypes = [
        ["imageMessage", "image"],
        ["videoMessage", "video"],
        ["audioMessage", "audio"],
        ["documentMessage", "document"],
        ["stickerMessage", "sticker"],
        ["documentWithCaptionMessage", "document"],
      ];

      for (const [key, type] of mediaTypes) {
        if (m[key]) {
          mediaMsg = m[key];
          mediaType = type;
          break;
        }
      }

      // Handle nested documentWithCaption
      if (m.documentWithCaptionMessage?.message?.documentMessage) {
        mediaMsg = m.documentWithCaptionMessage.message.documentMessage;
        mediaType = "document";
      }

      if (!mediaMsg) {
        return errResult("Message does not contain downloadable media.");
      }

      // Use Baileys downloadMediaMessage
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const buffer = await downloadMediaMessage(msg, "buffer", {});
      const base64 = buffer.toString("base64");

      return okResult({
        message_id,
        media_type: mediaType,
        mimetype: mediaMsg.mimetype || null,
        filename: mediaMsg.fileName || null,
        file_length: mediaMsg.fileLength ? Number(mediaMsg.fileLength) : buffer.length,
        base64_length: base64.length,
        data: base64,
      });
    },
  },
];

// ── Private: guess tool category from name ──────────────────────────────────

function _guessCategory(name) {
  if (/channel|newsletter/.test(name)) return "channels";
  if (/label/.test(name)) return "labels";
  if (/^analytics_|^daily_digest/.test(name)) return "analytics";
  if (/^connection_status$|^whatsapp_guide$|^send_presence$|^read_messages$|^search_messages$|^download_media$/.test(name)) {
    return "utilities";
  }
  if (/^send_|^edit_|^delete_|^forward_|^batch_/.test(name)) return "messaging";
  if (/^list_chats|^get_messages|^manage_chat$|^star_|^set_disappearing/.test(name)) return "chats";
  if (/^check_phone|^get_contact|^get_profile_picture|^manage_block|^get_business|^list_contacts|^manage_contact_tags/.test(name)) return "contacts";
  if (/^create_group|^get_group|^list_groups|^update_group|^manage_group|^leave_group|^set_group/.test(name)) return "groups";
  if (/^update_display|^update_about|^update_profile_picture|^manage_privacy/.test(name)) return "profile";
  return "utilities";
}
