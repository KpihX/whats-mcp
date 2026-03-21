/**
 * whats-mcp — Digest tools (2 tools).
 *
 * get_messages_multi, daily_digest
 */

"use strict";

const { phoneToJid, isGroupJid, okResult, errResult, formatMessage } = require("../helpers");

module.exports = [
  // 1. get_messages_multi
  {
    definition: {
      name: "get_messages_multi",
      description:
        "Get messages from multiple chats in one call." +
        " Specify JIDs directly or use a named watchlist from config." +
        " Supports time range and message type filters.",
      inputSchema: {
        type: "object",
        properties: {
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Array of chat JIDs or phone numbers to fetch messages from.",
          },
          watchlist: {
            type: "string",
            description: "Name of a watchlist defined in config.json (e.g. 'groups', 'family'). Used if jids is empty.",
          },
          limit_per_chat: {
            type: "integer",
            description: "Max messages per chat (default 50, max 200).",
          },
          since: {
            type: "integer",
            description: "Unix timestamp: only include messages at or after this time.",
          },
          until: {
            type: "integer",
            description: "Unix timestamp: only include messages at or before this time.",
          },
          include_types: {
            type: "array",
            items: { type: "string" },
            description: "Only include messages of these types.",
          },
          exclude_types: {
            type: "array",
            items: { type: "string" },
            description: "Exclude messages of these types.",
          },
        },
      },
    },
    handler: async (
      { jids, watchlist, limit_per_chat, since, until, include_types, exclude_types },
      { store, config },
    ) => {
      // Resolve JIDs from watchlist or explicit list
      let resolvedJids;
      if (jids && jids.length > 0) {
        resolvedJids = jids.map(phoneToJid);
      } else if (watchlist) {
        const wlJids = store.resolveWatchlist(watchlist, config?.watchlists);
        if (wlJids) {
          resolvedJids = wlJids.map(phoneToJid);
        } else {
          const all = [...new Set([
            ...Object.keys(store.listWatchlists()),
            ...Object.keys(config?.watchlists || {}),
          ])];
          return errResult(`Watchlist '${watchlist}' not found. Available: ${all.join(", ") || "none"}`);
        }
      } else {
        return errResult("Provide either 'jids' array or a 'watchlist' name.");
      }

      const lim = Math.min(limit_per_chat || 50, 200);
      const filterOpts = {
        since: since || undefined,
        until: until || undefined,
        types: include_types || undefined,
        excludeTypes: exclude_types || undefined,
      };

      const chats = [];
      let totalMessages = 0;

      for (const jid of resolvedJids) {
        const messages = store.getMessages(jid, lim, undefined, filterOpts);
        const formatted = messages.map(formatMessage).filter(Boolean);
        const chat = store.getChat(jid);
        const contact = store.getContact(jid);

        chats.push({
          jid,
          name: chat?.name || chat?.subject || contact?.name || contact?.notify || jid,
          is_group: isGroupJid(jid),
          count: formatted.length,
          messages: formatted,
        });
        totalMessages += formatted.length;
      }

      return okResult({
        total_chats: chats.length,
        total_messages: totalMessages,
        filters: { since, until, include_types, exclude_types, limit_per_chat: lim },
        chats,
      });
    },
  },

  // 2. daily_digest
  {
    definition: {
      name: "daily_digest",
      description:
        "Generate a structured daily digest of messages across specified chats." +
        " Defaults to the last 24 hours if no time range is given." +
        " Perfect for evening summaries: shows per-chat message counts, active participants, and messages." +
        " Chats with zero messages in the period are excluded.",
      inputSchema: {
        type: "object",
        properties: {
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Array of chat JIDs or phone numbers.",
          },
          watchlist: {
            type: "string",
            description: "Name of a watchlist from config. Used if jids is empty.",
          },
          since: {
            type: "integer",
            description: "Unix timestamp for period start. Default: 24 hours ago.",
          },
          until: {
            type: "integer",
            description: "Unix timestamp for period end. Default: now.",
          },
          limit_per_chat: {
            type: "integer",
            description: "Max messages per chat (default 100, max 500).",
          },
          exclude_types: {
            type: "array",
            items: { type: "string" },
            description: "Exclude these message types from the digest (e.g. reaction, protocol).",
          },
        },
      },
    },
    handler: async (
      { jids, watchlist, since, until, limit_per_chat, exclude_types },
      { store, config },
    ) => {
      // Time range defaults: last 24 hours
      const now = Math.floor(Date.now() / 1000);
      const effectiveSince = since || (now - 86400);
      const effectiveUntil = until || now;

      // Resolve JIDs
      let resolvedJids;
      if (jids && jids.length > 0) {
        resolvedJids = jids.map(phoneToJid);
      } else if (watchlist) {
        const wlJids = store.resolveWatchlist(watchlist, config?.watchlists);
        if (wlJids) {
          resolvedJids = wlJids.map(phoneToJid);
        } else {
          const all = [...new Set([
            ...Object.keys(store.listWatchlists()),
            ...Object.keys(config?.watchlists || {}),
          ])];
          return errResult(`Watchlist '${watchlist}' not found. Available: ${all.join(", ") || "none"}`);
        }
      } else {
        // Default: all chats with messages
        resolvedJids = Array.from(store.messages.keys());
      }

      const lim = Math.min(limit_per_chat || 100, 500);
      const filterOpts = {
        since: effectiveSince,
        until: effectiveUntil,
        excludeTypes: exclude_types || undefined,
      };

      const chatDigests = [];
      let totalMessages = 0;
      let totalFromMe = 0;
      let totalFromOthers = 0;

      for (const jid of resolvedJids) {
        const messages = store.getMessages(jid, lim, undefined, filterOpts);
        const formatted = messages.map(formatMessage).filter(Boolean);
        if (formatted.length === 0) continue;

        const chat = store.getChat(jid);
        const contact = store.getContact(jid);
        const fromMe = formatted.filter((m) => m.from_me).length;

        // Collect unique active participants
        const participants = new Set();
        for (const m of formatted) {
          if (m.sender) participants.add(m.sender);
        }

        chatDigests.push({
          jid,
          name: chat?.name || chat?.subject || contact?.name || contact?.notify || jid,
          is_group: isGroupJid(jid),
          message_count: formatted.length,
          from_me: fromMe,
          from_others: formatted.length - fromMe,
          active_participants: participants.size,
          messages: formatted,
        });

        totalMessages += formatted.length;
        totalFromMe += fromMe;
        totalFromOthers += formatted.length - fromMe;
      }

      // Sort: most active chats first
      chatDigests.sort((a, b) => b.message_count - a.message_count);

      return okResult({
        period: {
          since: effectiveSince,
          until: effectiveUntil,
          since_iso: new Date(effectiveSince * 1000).toISOString(),
          until_iso: new Date(effectiveUntil * 1000).toISOString(),
        },
        summary: {
          total_chats: chatDigests.length,
          total_messages: totalMessages,
          total_from_me: totalFromMe,
          total_from_others: totalFromOthers,
        },
        chats: chatDigests,
      });
    },
  },
];
