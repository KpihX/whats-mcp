/**
 * whats-mcp — Tool Registry.
 *
 * Collects all tool definitions from category modules and provides:
 *   - listTools() → array of MCP tool definitions
 *   - callTool(name, args, context) → MCP CallTool result
 */

"use strict";

const messagingTools = require("./messaging");
const chatsTools     = require("./chats");
const contactsTools  = require("./contacts");
const groupsTools    = require("./groups");
const profileTools   = require("./profile");
const channelsTools  = require("./channels");
const labelsTools    = require("./labels");
const analyticsTools = require("./analytics");
const utilsTools     = require("./utils");
const digestTools    = require("./digest");
const tagsTools      = require("./tags");
const watchlistsTools = require("./watchlists");
const overviewTools  = require("./overview");

// ── Collect all tools ────────────────────────────────────────────────────────

const ALL_TOOLS = [
  ...messagingTools,
  ...chatsTools,
  ...contactsTools,
  ...groupsTools,
  ...profileTools,
  ...channelsTools,
  ...labelsTools,
  ...analyticsTools,
  ...utilsTools,
  ...digestTools,
  ...tagsTools,
  ...watchlistsTools,
  ...overviewTools,
];

// Build lookup maps
const _definitions = ALL_TOOLS.map((t) => t.definition);
const _handlers    = new Map();
for (const t of ALL_TOOLS) {
  if (_handlers.has(t.definition.name)) {
    throw new Error(`Duplicate tool name: ${t.definition.name}`);
  }
  _handlers.set(t.definition.name, t.handler);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Return all MCP tool definitions for ListTools.
 */
function listTools() {
  return _definitions;
}

/**
 * Dispatch a CallTool request.
 *
 * @param {string} name  - Tool name
 * @param {object} args  - Tool arguments (from MCP request)
 * @param {object} ctx   - Context: { sock, store, connectionInfo, toolDefs }
 * @returns {Promise<object>} MCP CallTool result ({ content: [...] })
 */
async function callTool(name, args, ctx) {
  const handler = _handlers.get(name);
  if (!handler) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
      isError: true,
    };
  }

  try {
    // Provide toolDefs in context for the guide tool
    ctx.toolDefs = _definitions;
    return await handler(args || {}, ctx);
  } catch (err) {
    // Structured error response
    const errorMessage = err.data
      ? `${err.message} — ${JSON.stringify(err.data)}`
      : err.message || String(err);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            tool: name,
            ...(err.statusCode ? { status_code: err.statusCode } : {}),
          }),
        },
      ],
      isError: true,
    };
  }
}

module.exports = { listTools, callTool, ALL_TOOLS };
