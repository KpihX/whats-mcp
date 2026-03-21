/**
 * whats-mcp — Overview & smart search tools (2 tools).
 *
 * whatsup        — full daily overview, watchlist-prioritized, unanswered threads
 * find_messages  — smart semantic search with keyword expansion
 */

"use strict";

const { phoneToJid, isGroupJid, okResult, errResult, formatMessage } = require("../helpers");

// ── Topic expansion map (French + English) ───────────────────────────────────
//
// For each topic, lists keywords to expand the user's query into.
// "ia" → also searches for "llm", "gpt", "machine learning", etc.
// Partial matches are intentional (e.g. "opportunit" catches opportunité/opportunités).

const TOPIC_EXPANSIONS = {
  ia: [
    "ia", "intelligence artificielle", "ai", "machine learning", "llm", "gpt",
    "chatgpt", "neural", "deep learning", "ml", "nlp", "modele", "modèle",
    "mistral", "gemini", "openai", "anthropic", "claude", "transformer",
    "rag", "embedding", "dataset", "data science",
  ],
  stage: [
    "stage", "internship", "alternance", "apprentissage", "stagiaire",
  ],
  offre: [
    "offre", "opportunit", "recrutement", "embauche", "poste", "job",
    "emploi", "cdi", "cdd", "freelance", "mission", "contrat",
  ],
  badminton: [
    "badminton", "binet bad", "tournoi bad", "match bad", "entraîn",
    "raquette", "volant", "terrain bad",
  ],
  sport: [
    "sport", "match", "tournoi", "training", "gym", "running", "course",
    "séance", "terrain",
  ],
  reunion: [
    "réunion", "reunion", "meeting", "présentiel", "visio", "conf",
    "appel", "call", "zoom", "rdv", "rendez-vous", "rencontre",
  ],
  urgence: [
    "urgent", "urgence", "asap", "rapidement", "help", "aide",
    "besoin", "au plus vite", "dès que",
  ],
  evenement: [
    "event", "événement", "soirée", "sortie", "fête", "party",
    "voyage", "trip", "hackathon", "datathon", "conférence",
    "séminaire", "workshop",
  ],
  action: [
    "action à", "peux-tu", "pourras-tu", "peux tu", "merci de",
    "il faut", "n'oublie pas", "to do", "todo", "rappel",
    "reminder", "deadline", "échéance", "date limite", "à faire",
    "pense à",
  ],
  logement: [
    "logement", "appart", "appartement", "coloc", "colocation",
    "loyer", "chambre", "résidence", "hébergement", "housing", "rent",
  ],
  bourse: [
    "bourse", "scholarship", "financement", "aide financière",
    "subvention", "grant", "fellowship",
  ],
  annonce: [
    "annonce", "annoncé", "communiqué", "info", "rappel",
    "important", "attention", "note",
  ],
};

/**
 * Expand a user query to related keywords using the topic map.
 * Returns [original_query, ...expanded_keywords] (deduped, lowercase).
 */
function _expandQuery(query) {
  const lower = query.toLowerCase().trim();
  const keywords = new Set([lower]);

  for (const [topic, expansions] of Object.entries(TOPIC_EXPANSIONS)) {
    const matched =
      lower.includes(topic) ||
      expansions.some((e) => lower.includes(e));
    if (matched) {
      for (const e of expansions) keywords.add(e);
    }
  }

  return Array.from(keywords);
}

/**
 * Collect all JIDs from all watchlists (store + config fallback).
 */
function _allWatchlistJids(store, config) {
  const storeWLs = store.listWatchlists();
  const configWLs = config?.watchlists || {};
  const merged = { ...configWLs, ...storeWLs };
  const jidSet = new Set();
  for (const jids of Object.values(merged)) {
    for (const jid of jids) jidSet.add(phoneToJid(jid));
  }
  return { jidSet, merged };
}

module.exports = [
  // 1. whatsup — Daily overview
  {
    definition: {
      name: "whatsup",
      description:
        "DAILY WHATSAPP OVERVIEW — CALL THIS AUTOMATICALLY when user asks:" +
        " 'what's up', 'quoi de neuf', 'résume ma journée WhatsApp', 'qu'est-ce que j'ai manqué'," +
        " 'donne-moi un résumé', 'c\\'est quoi les news', 'update WhatsApp', 'mon WhatsApp'," +
        " 'koi de neuf', 'les actus WA', 'donne moi l\\'overview', 'briefing whatsapp'," +
        " or any similar request about today's WhatsApp activity." +
        " Returns a complete structured overview from midnight today to now:" +
        " (1) Watchlist chats first (your prioritized groups) with all today's messages;" +
        " (2) Other active chats with today's messages;" +
        " (3) Needs-reply — chats where the last message is incoming, waiting for your response." +
        " No parameters required for default use — call with empty args {}.",
      inputSchema: {
        type: "object",
        properties: {
          since: {
            type: "integer",
            description: "Start Unix timestamp. Default: midnight today.",
          },
          until: {
            type: "integer",
            description: "End Unix timestamp. Default: now.",
          },
          watchlists: {
            type: "array",
            items: { type: "string" },
            description: "Only show these watchlists (default: all).",
          },
          limit_per_chat: {
            type: "integer",
            description: "Max messages per chat (default: 50, max: 200).",
          },
        },
      },
    },
    handler: async ({ since, until, watchlists: wlFilter, limit_per_chat }, { store, config }) => {
      const now = Math.floor(Date.now() / 1000);

      // Default period: since midnight today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const effectiveSince = since || Math.floor(todayStart.getTime() / 1000);
      const effectiveUntil = until || now;
      const lim = Math.min(limit_per_chat || 50, 200);

      // Build JID → watchlist names mapping
      const storeWLs = store.listWatchlists();
      const configWLs = config?.watchlists || {};
      const allWLs = { ...configWLs, ...storeWLs };

      const activeWLs =
        wlFilter && wlFilter.length > 0
          ? Object.fromEntries(Object.entries(allWLs).filter(([n]) => wlFilter.includes(n)))
          : allWLs;

      const jidToWatchlists = new Map();
      for (const [wlName, jids] of Object.entries(activeWLs)) {
        for (const rawJid of jids) {
          const jid = phoneToJid(rawJid);
          if (!jidToWatchlists.has(jid)) jidToWatchlists.set(jid, []);
          jidToWatchlists.get(jid).push(wlName);
        }
      }
      const watchlistJidSet = new Set(jidToWatchlists.keys());

      const filterOpts = {
        since: effectiveSince,
        until: effectiveUntil,
        excludeTypes: ["protocol", "reaction"],
      };

      const watchlistChats = [];
      const otherChats = [];
      const needsReplyChats = [];

      // All JIDs to scan (messages + watchlist JIDs so watched chats always appear)
      const allJids = new Set(store.messages.keys());
      for (const jid of watchlistJidSet) allJids.add(jid);

      for (const jid of allJids) {
        if (jid === "status@broadcast") continue;

        const messages = store.getMessages(jid, lim, undefined, filterOpts);
        const formatted = messages.map(formatMessage).filter(Boolean);
        if (formatted.length === 0) continue;

        const chat = store.getChat(jid);
        const contact = store.getContact(jid);
        const chatName =
          chat?.name || chat?.subject || contact?.name || contact?.notify || jid;

        // "needs reply": last non-protocol message is not from me
        const recent = store.getMessages(jid, 3, undefined, { excludeTypes: ["protocol", "reaction"] });
        const recentFormatted = recent.map(formatMessage).filter(Boolean);
        const lastMsg = recentFormatted[0]; // newest first
        const needsReply = !!lastMsg && !lastMsg.from_me;

        const chatData = {
          jid,
          name: chatName,
          is_group: isGroupJid(jid),
          unread: chat?.unreadCount || 0,
          message_count: formatted.length,
          needs_reply: needsReply,
          last_message_time: formatted[0]?.timestamp || null,
          messages: formatted,
        };

        if (watchlistJidSet.has(jid)) {
          chatData.watchlists = jidToWatchlists.get(jid);
          watchlistChats.push(chatData);
        } else {
          otherChats.push(chatData);
        }

        if (needsReply) {
          needsReplyChats.push({
            jid,
            name: chatName,
            is_group: isGroupJid(jid),
            in_watchlist: watchlistJidSet.has(jid),
            last_message: lastMsg,
          });
        }
      }

      // Sort by latest activity
      const byTime = (a, b) => (b.last_message_time || 0) - (a.last_message_time || 0);
      watchlistChats.sort(byTime);
      otherChats.sort(byTime);
      // needs_reply: watchlist first, then by last activity
      needsReplyChats.sort((a, b) => {
        if (a.in_watchlist !== b.in_watchlist) return b.in_watchlist ? 1 : -1;
        return (b.last_message?.timestamp || 0) - (a.last_message?.timestamp || 0);
      });

      const totalMessages =
        watchlistChats.reduce((s, c) => s + c.message_count, 0) +
        otherChats.reduce((s, c) => s + c.message_count, 0);

      return okResult({
        date: new Date().toLocaleDateString("fr-FR"),
        period: {
          since: effectiveSince,
          until: effectiveUntil,
          from: new Date(effectiveSince * 1000).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          to: new Date(effectiveUntil * 1000).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
        summary: {
          total_active_chats: watchlistChats.length + otherChats.length,
          watchlist_chats: watchlistChats.length,
          other_chats: otherChats.length,
          total_messages: totalMessages,
          needs_reply_count: needsReplyChats.length,
        },
        watchlist_chats: watchlistChats,
        other_chats: otherChats,
        needs_reply: needsReplyChats,
      });
    },
  },

  // 2. find_messages — Smart semantic search
  {
    definition: {
      name: "find_messages",
      description:
        "SMART SEMANTIC MESSAGE SEARCH — CALL THIS when user asks about specific topics:" +
        " 'y a-t-il des messages sur l\\'IA', 'des offres de stage', 'des attentes pour moi'," +
        " 'des actions à faire', 'des events à venir', 'des invitations', 'des urgences'," +
        " 'what about jobs', 'any urgent messages', 'des réunions prévues', 'infos sur X'," +
        " 'des messages importants', 'quoi de neuf sur l\\'IA', 'y a-t-il des stages'." +
        " Performs intelligent multi-keyword search with automatic topic expansion:" +
        " 'ia' also searches for 'machine learning', 'LLM', 'GPT', 'intelligence artificielle', etc." +
        " 'offre' also expands to 'stage', 'emploi', 'recrutement', 'opportunité', etc." +
        " Results are ALWAYS prioritized: watchlist chats first, then all other chats." +
        " Groups results by chat. Covers entire message history by default.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Topic or question to search for (French or English)." +
              " Examples: 'IA', 'stage', 'offres emploi', 'urgence', 'events', 'actions à faire'.",
          },
          since: {
            type: "integer",
            description: "Optional: only include messages after this Unix timestamp.",
          },
          until: {
            type: "integer",
            description: "Optional: only include messages before this Unix timestamp.",
          },
          limit: {
            type: "integer",
            description: "Max total results (default: 80, max: 300).",
          },
          watchlist_only: {
            type: "boolean",
            description: "If true, restrict search to watchlist chats only.",
          },
        },
        required: ["query"],
      },
    },
    handler: async ({ query, since, until, limit, watchlist_only }, { store, config }) => {
      if (!query || !query.trim()) {
        return errResult("Parameter 'query' is required.");
      }

      const capped = Math.min(limit || 80, 300);
      const opts = {
        since: since || undefined,
        until: until || undefined,
      };

      // Build watchlist set
      const { jidSet: watchlistJidSet } = _allWatchlistJids(store, config);

      // Expand query into related keywords
      const keywords = _expandQuery(query);

      // Phase 1: TF-IDF analytics search with expanded query (handles tokenization internally)
      const expandedQuery = keywords.join(" ");
      const analyticsResults = store.analyticsSearch(expandedQuery, null, capped, opts);

      // Phase 2: plain text fallback for original query (phrase match catches more)
      const textResults = store.searchMessages(query, null, Math.floor(capped / 2), opts);

      // Merge: analytics first (higher quality), then add text-only misses
      const seenIds = new Set(analyticsResults.map((r) => r.id));
      const allResults = [...analyticsResults];
      for (const r of textResults) {
        if (!seenIds.has(r.id)) {
          allResults.push({ ...r, score: 0.3, matched_terms: [query] });
          seenIds.add(r.id);
        }
      }

      // Filter by watchlist if requested
      let filtered = watchlist_only
        ? allResults.filter((r) => watchlistJidSet.has(r.from))
        : allResults;

      // Sort: watchlist first → score desc → recency desc
      filtered.sort((a, b) => {
        const aWL = watchlistJidSet.has(a.from) ? 1 : 0;
        const bWL = watchlistJidSet.has(b.from) ? 1 : 0;
        if (aWL !== bWL) return bWL - aWL;
        if (b.score !== a.score) return b.score - a.score;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      filtered = filtered.slice(0, capped);

      // Group by chat JID
      const byChat = new Map();
      for (const r of filtered) {
        const chatJid = r.from; // formatMessage sets from = key.remoteJid = chat JID
        if (!byChat.has(chatJid)) {
          const chat = store.getChat(chatJid);
          const contact = store.getContact(chatJid);
          byChat.set(chatJid, {
            jid: chatJid,
            name: chat?.name || chat?.subject || contact?.name || contact?.notify || chatJid,
            is_group: isGroupJid(chatJid),
            in_watchlist: watchlistJidSet.has(chatJid),
            messages: [],
          });
        }
        byChat.get(chatJid).messages.push({
          id: r.id,
          timestamp: r.timestamp,
          from_me: r.from_me,
          participant: r.participant,
          push_name: r.push_name,
          type: r.type,
          text: r.text,
          matched_keywords: r.matched_terms || [query],
        });
      }

      // Sort chats: watchlist first → most messages first
      const chatResults = Array.from(byChat.values()).sort((a, b) => {
        if (a.in_watchlist !== b.in_watchlist) return b.in_watchlist ? 1 : -1;
        return b.messages.length - a.messages.length;
      });

      return okResult({
        query,
        expanded_keywords: keywords.length > 1 ? keywords.slice(1) : [],
        total_messages: filtered.length,
        total_chats: chatResults.length,
        watchlist_matches: chatResults.filter((c) => c.in_watchlist).length,
        chats: chatResults,
      });
    },
  },
];
