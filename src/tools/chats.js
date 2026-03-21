/**
 * whats-mcp — Chat management tools (5 tools).
 *
 * list_chats, get_messages, manage_chat, star_message, set_disappearing
 */

"use strict";

const {
  phoneToJid, isGroupJid, okResult, errResult, formatChat, formatMessage,
} = require("../helpers");
const { fetchAdditionalHistory } = require("./history-support");

module.exports = [
  // 1. list_chats
  {
    definition: {
      name: "list_chats",
      description:
        "List recent chats from the in-memory store." +
        " Returns chat JIDs, names, timestamps, unread counts, and other metadata." +
        " Results are sorted by most recent activity.",
      inputSchema: {
        type: "object",
        properties: {
          limit:  { type: "integer", description: "Max number of chats to return (default 50, max 500)." },
          offset: { type: "integer", description: "Offset for pagination (default 0)." },
          filter: {
            type: "string",
            enum: ["all", "groups", "contacts", "unread"],
            description: "Filter chats: all (default), groups, contacts, unread.",
          },
        },
      },
    },
    handler: async ({ limit, offset, filter }, { store }) => {
      let chats = store.listChats(10000);

      // Apply filter
      const f = filter || "all";
      if (f === "groups")   chats = chats.filter((c) => isGroupJid(c.id));
      if (f === "contacts") chats = chats.filter((c) => !isGroupJid(c.id));
      if (f === "unread")   chats = chats.filter((c) => (c.unreadCount || 0) > 0);

      const total = chats.length;
      const off = offset || 0;
      const lim = Math.min(limit || 50, 500);
      const page = chats.slice(off, off + lim);

      return okResult({
        total,
        offset: off,
        count: page.length,
        chats: page.map(formatChat),
      });
    },
  },

  // 2. get_messages
  {
    definition: {
      name: "get_messages",
      description:
        "Get recent messages from a specific chat." +
        " Messages come from the local store and can trigger an on-demand history fetch for older messages." +
        " Use before_id for pagination toward older messages.",
      inputSchema: {
        type: "object",
        properties: {
          jid:       { type: "string", description: "Chat JID or phone number." },
          limit:     { type: "integer", description: "Max number of messages to return (default 50, max 200)." },
          before_id: { type: "string", description: "Message ID cursor: return messages older than this. For pagination." },
          fetch_history: {
            type: "boolean",
            description: "If true (default), request additional older history from WhatsApp when the local cache is insufficient.",
          },
          history_count: {
            type: "integer",
            description: "How many older messages to request from WhatsApp during on-demand history sync (default: max(limit, 50), max 200).",
          },
          history_wait_ms: {
            type: "integer",
            description: "How long to wait for history sync events after requesting older messages (default 3500ms, max 15000ms).",
          },
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
            description: "If set, only include messages of these types (e.g. text, image, video, audio, document, voice_note, sticker, location, contact, poll).",
          },
          exclude_types: {
            type: "array",
            items: { type: "string" },
            description: "Exclude messages of these types (e.g. reaction, protocol, senderKeyDistribution, unknown).",
          },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid, limit, before_id, fetch_history, history_count, history_wait_ms, since, until, include_types, exclude_types }, { sock, store }) => {
      const chatJid = phoneToJid(jid);
      const lim = Math.min(limit || 50, 200);
      const filterOpts = {
        since: since || undefined,
        until: until || undefined,
        types: include_types || undefined,
        excludeTypes: exclude_types || undefined,
      };
      let historySync = {
        enabled: fetch_history !== false,
        requested: false,
        received: false,
        reason: "cache_sufficient",
        before_count: store.countMessages(chatJid),
        after_count: store.countMessages(chatJid),
      };

      let messages = store.getMessages(chatJid, lim, before_id, filterOpts);
      const shouldFetchHistory = fetch_history !== false && (before_id || messages.length < lim);
      if (shouldFetchHistory) {
        historySync = await fetchAdditionalHistory({
          sock,
          store,
          jid: chatJid,
          beforeId: before_id,
          limit: lim,
          historyCount: history_count,
          waitMs: history_wait_ms,
          enabled: fetch_history !== false,
        });
        messages = store.getMessages(chatJid, lim, before_id, filterOpts);
      }

      return okResult({
        jid: chatJid,
        count: messages.length,
        messages: messages.map(formatMessage),
        history_sync: historySync,
      });
    },
  },

  // 3. manage_chat
  {
    definition: {
      name: "manage_chat",
      description:
        "Perform a chat management action: archive, unarchive, pin, unpin," +
        " mute, unmute, mark_read, mark_unread, delete, or clear.",
      inputSchema: {
        type: "object",
        properties: {
          jid:    { type: "string", description: "Chat JID or phone number." },
          action: {
            type: "string",
            enum: [
              "archive", "unarchive",
              "pin", "unpin",
              "mute", "unmute",
              "mark_read", "mark_unread",
              "delete", "clear",
            ],
            description: "Action to perform.",
          },
          mute_duration: {
            type: "integer",
            description: "For 'mute' action: duration in seconds. 0 = 8 hours, -1 = forever. Default 8 hours.",
          },
        },
        required: ["jid", "action"],
      },
    },
    handler: async ({ jid, action, mute_duration }, { sock, store }) => {
      const chatJid = phoneToJid(jid);
      const now = Date.now();

      // Get last messages for read/unread operations
      let lastMessages;
      if (action === "mark_read" || action === "mark_unread") {
        const msgs = store.getMessages(chatJid, 1);
        if (msgs.length > 0) {
          lastMessages = [{ id: msgs[0].key.id, remoteJid: chatJid, fromMe: msgs[0].key.fromMe }];
        }
      }

      const modMap = {
        archive:      { archive: true, lastMessages: undefined },
        unarchive:    { archive: false, lastMessages: undefined },
        pin:          { pin: true },
        unpin:        { pin: false },
        mute:         {
          mute: mute_duration === -1
            ? undefined // Will be handled below
            : (mute_duration || 8 * 3600) * 1000 + now,
        },
        unmute:       { mute: null },
        mark_read:    { markRead: true, lastMessages },
        mark_unread:  { markRead: false, lastMessages },
        delete:       { delete: true, lastMessages },
        clear:        { clear: { messages: [] } }, // clears all messages flag
      };

      if (action === "mute" && mute_duration === -1) {
        modMap.mute.mute = 0; // 0 = mute forever in Baileys
      }

      const mod = modMap[action];
      if (!mod) return errResult(`Unknown action: ${action}`);

      // Baileys chatModify takes (modification, jid)
      await sock.chatModify(mod, chatJid);

      return okResult({ status: action, jid: chatJid });
    },
  },

  // 4. star_message
  {
    definition: {
      name: "star_message",
      description: "Star or unstar a message.",
      inputSchema: {
        type: "object",
        properties: {
          jid:        { type: "string", description: "Chat JID." },
          message_id: { type: "string", description: "Message ID to star/unstar." },
          star:       { type: "boolean", description: "true to star, false to unstar. Default true." },
          from_me:    { type: "boolean", description: "Whether the message was sent by you. Default false." },
        },
        required: ["jid", "message_id"],
      },
    },
    handler: async ({ jid, message_id, star, from_me }, { sock }) => {
      const chatJid = phoneToJid(jid);
      const shouldStar = star !== false;
      await sock.chatModify(
        {
          star: {
            messages: [{ id: message_id, fromMe: from_me ?? false }],
            star: shouldStar,
          },
        },
        chatJid,
      );
      return okResult({
        status: shouldStar ? "starred" : "unstarred",
        jid: chatJid,
        message_id,
      });
    },
  },

  // 5. set_disappearing
  {
    definition: {
      name: "set_disappearing",
      description:
        "Set disappearing messages timer for a chat." +
        " Available durations: 0 (off), 86400 (24h), 604800 (7 days), 7776000 (90 days).",
      inputSchema: {
        type: "object",
        properties: {
          jid:      { type: "string", description: "Chat JID." },
          duration: {
            type: "integer",
            enum: [0, 86400, 604800, 7776000],
            description: "Disappearing timer in seconds: 0=off, 86400=24h, 604800=7d, 7776000=90d.",
          },
        },
        required: ["jid", "duration"],
      },
    },
    handler: async ({ jid, duration }, { sock }) => {
      const chatJid = phoneToJid(jid);
      await sock.sendMessage(chatJid, { disappearingMessagesInChat: duration });
      const labels = { 0: "off", 86400: "24 hours", 604800: "7 days", 7776000: "90 days" };
      return okResult({
        status: "set",
        jid: chatJid,
        disappearing: labels[duration] || `${duration}s`,
      });
    },
  },
];
