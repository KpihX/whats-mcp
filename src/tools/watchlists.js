/**
 * whats-mcp — Watchlist management tools (1 tool).
 *
 * manage_watchlist
 */

"use strict";

const { phoneToJid, okResult, errResult } = require("../helpers");

const VALID_ACTIONS = ["set", "add", "remove", "get", "list", "delete"];

module.exports = [
  // manage_watchlist
  {
    definition: {
      name: "manage_watchlist",
      description:
        "Dynamically manage personal chat watchlists — named groups of chats to monitor together." +
        " Watchlists persist across sessions and are used by whatsup and daily_digest." +
        " CALL THIS when user says: 'suis ces groupes', 'ajoute X à ma watchlist', 'track these chats'," +
        " 'enlève X de ma watchlist', 'crée une watchlist famille', 'quelles sont mes watchlists'," +
        " 'follow X group', 'add X to my evening list', 'stop tracking X', 'remove X from watchlist'," +
        " 'mets-moi ça dans la watchlist Y', 'je veux surveiller ces chats'." +
        " Actions: set (define/replace entirely), add (append JIDs), remove (remove JIDs)," +
        " get (view one watchlist with chat names), list (view all watchlists), delete (delete).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: VALID_ACTIONS,
            description: "Action to perform: set | add | remove | get | list | delete.",
          },
          name: {
            type: "string",
            description:
              "Watchlist name (e.g. 'family', 'x24', 'ai', 'morning', 'evening_digest')." +
              " Required for all actions except list.",
          },
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Array of chat JIDs or phone numbers. Required for set/add/remove.",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, name, jids }, { store, config }) => {
      if (!VALID_ACTIONS.includes(action)) {
        return errResult(`Unknown action '${action}'. Valid: ${VALID_ACTIONS.join(", ")}`);
      }

      // list: show all watchlists (store + config merged, store takes precedence)
      if (action === "list") {
        const storeWLs = store.listWatchlists();
        const configWLs = config?.watchlists || {};
        const merged = { ...configWLs, ...storeWLs };
        const entries = Object.entries(merged).map(([n, wjids]) => {
          const chats = wjids.map((jid) => {
            const ch = store.getChat(jid);
            return { jid, name: ch?.name || ch?.subject || jid };
          });
          return {
            name: n,
            count: wjids.length,
            source: storeWLs[n] ? "dynamic" : "config",
            chats,
          };
        });
        return okResult({ total: entries.length, watchlists: entries });
      }

      // All other actions require a name
      if (!name) {
        return errResult(`Parameter 'name' is required for action '${action}'.`);
      }

      if (action === "get") {
        const wjids = store.resolveWatchlist(name, config?.watchlists);
        if (!wjids) {
          const all = [...new Set([
            ...Object.keys(store.listWatchlists()),
            ...Object.keys(config?.watchlists || {}),
          ])];
          return errResult(`Watchlist '${name}' not found. Available: ${all.join(", ") || "none"}`);
        }
        const chats = wjids.map((jid) => {
          const ch = store.getChat(jid);
          return { jid, name: ch?.name || ch?.subject || jid };
        });
        return okResult({ name, count: wjids.length, chats });
      }

      if (action === "delete") {
        const existed = store.deleteWatchlist(name);
        return okResult({ status: existed ? "deleted" : "not_found", name });
      }

      // set / add / remove require jids
      const resolvedJids = (jids || []).map(phoneToJid);
      if (resolvedJids.length === 0) {
        return errResult(`Parameter 'jids' must be a non-empty array for action '${action}'.`);
      }

      if (action === "set") {
        store.setWatchlist(name, resolvedJids);
        const chats = resolvedJids.map((jid) => {
          const ch = store.getChat(jid);
          return { jid, name: ch?.name || ch?.subject || jid };
        });
        return okResult({ status: "set", name, count: resolvedJids.length, chats });
      }

      if (action === "add") {
        store.addToWatchlist(name, resolvedJids);
        const updated = store.getWatchlist(name) || [];
        const chats = updated.map((jid) => {
          const ch = store.getChat(jid);
          return { jid, name: ch?.name || ch?.subject || jid };
        });
        return okResult({ status: "added", name, added: resolvedJids.length, total: updated.length, chats });
      }

      // remove
      store.removeFromWatchlist(name, resolvedJids);
      const updated = store.getWatchlist(name) || [];
      const chats = updated.map((jid) => {
        const ch = store.getChat(jid);
        return { jid, name: ch?.name || ch?.subject || jid };
      });
      return okResult({ status: "removed", name, removed: resolvedJids.length, remaining: updated.length, chats });
    },
  },
];
