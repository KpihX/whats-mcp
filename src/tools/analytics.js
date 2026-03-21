/**
 * whats-mcp — Analytics tools (5 tools).
 *
 * analytics_overview, analytics_top_chats, analytics_chat_insights,
 * analytics_timeline, analytics_search
 */

"use strict";

const { phoneToJid, okResult, errResult } = require("../helpers");

module.exports = [
  {
    definition: {
      name: "analytics_overview",
      description:
        "Return a local analytics summary built from the cached WhatsApp store." +
        " Includes totals, top chats, top tokens, top senders, and activity trends.",
      inputSchema: {
        type: "object",
        properties: {
          top_chats: { type: "integer", description: "Number of top chats to include. Default 10." },
          top_tokens: { type: "integer", description: "Number of top tokens to include. Default 20." },
          top_senders: { type: "integer", description: "Number of top senders to include. Default 10." },
          days: { type: "integer", description: "Number of daily activity buckets to include. Default 30." },
        },
      },
    },
    handler: async (args, { store }) => okResult(store.getAnalyticsOverview(args)),
  },

  {
    definition: {
      name: "analytics_top_chats",
      description:
        "Rank chats using the local analytics index." +
        " Can sort by message count, last activity, active days, or participant count.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Maximum number of chats to return. Default 20." },
          sort_by: {
            type: "string",
            enum: ["message_count", "last_activity", "active_days", "participants"],
            description: "Sort criterion. Default message_count.",
          },
        },
      },
    },
    handler: async ({ limit, sort_by }, { store }) => okResult({
      count: Math.min(limit || 20, 200),
      chats: store.listAnalyticsTopChats({ limit, sort_by }),
    }),
  },

  {
    definition: {
      name: "analytics_chat_insights",
      description:
        "Return detailed local analytics for one chat, including top tokens, senders, activity, and recent messages.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Chat JID or phone number." },
          top_tokens: { type: "integer", description: "Maximum number of top tokens to include. Default 15." },
          top_senders: { type: "integer", description: "Maximum number of top senders to include. Default 10." },
          days: { type: "integer", description: "Number of daily activity buckets to include. Default 30." },
          recent_messages: { type: "integer", description: "Number of recent messages to include. Default 5." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid, ...options }, { store }) => {
      const chatJid = phoneToJid(jid);
      const result = store.getChatAnalytics(chatJid, options)
        || store.getChatAnalytics(jid, options);
      if (!result) {
        return errResult(`No analytics available for chat ${jid}.`);
      }
      return okResult(result);
    },
  },

  {
    definition: {
      name: "analytics_timeline",
      description:
        "Return a daily activity timeline from the local analytics index, globally or for one chat.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Optional chat JID or phone number." },
          days: { type: "integer", description: "Number of days to include. Default 30." },
        },
      },
    },
    handler: async ({ jid, days }, { store }) => {
      const result = store.getActivityTimeline({
        jid: jid ? phoneToJid(jid) : undefined,
        days,
      }) || (jid ? store.getActivityTimeline({ jid, days }) : null);
      if (!result) {
        return errResult(`No timeline available for chat ${jid}.`);
      }
      return okResult(result);
    },
  },

  {
    definition: {
      name: "analytics_search",
      description:
        "Run a ranked search over the local analytics index using token matches, phrase matches, and recency." +
        " Supports time range and multi-JID filtering.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          jid: { type: "string", description: "Optional chat JID or phone number." },
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Optional: search across multiple chat JIDs. Takes precedence over jid.",
          },
          limit: { type: "integer", description: "Maximum number of results. Default 20." },
          since: {
            type: "integer",
            description: "Unix timestamp: only include messages at or after this time.",
          },
          until: {
            type: "integer",
            description: "Unix timestamp: only include messages at or before this time.",
          },
        },
        required: ["query"],
      },
    },
    handler: async ({ query, jid, jids, limit, since, until }, { store }) => {
      let chatJids = undefined;
      if (jids && jids.length > 0) {
        chatJids = jids.map(phoneToJid);
      } else if (jid) {
        chatJids = phoneToJid(jid);
      }
      const opts = {
        since: since || undefined,
        until: until || undefined,
      };
      const messages = store.analyticsSearch(query, chatJids, limit, opts);
      return okResult({
        query,
        count: messages.length,
        messages,
      });
    },
  },
];
