/**
 * whats-mcp — Contact tag management tools (1 tool).
 *
 * manage_contact_tags
 */

"use strict";

const { phoneToJid, jidToPhone, okResult, errResult } = require("../helpers");

module.exports = [
  {
    definition: {
      name: "manage_contact_tags",
      description:
        "Manage custom contact tags/labels for classification." +
        " Actions: set (replace all tags), add (append new tags), remove (remove specific tags)," +
        " get (view contact's tags), list (all tags with counts), list_by_tag (contacts with a specific tag).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["set", "add", "remove", "get", "list", "list_by_tag"],
            description: "Action to perform.",
          },
          jid: {
            type: "string",
            description: "Contact JID or phone number (required for set/add/remove/get).",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags to set/add/remove.",
          },
          tag: {
            type: "string",
            description: "Tag name for list_by_tag action.",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, jid, tags, tag }, { store }) => {
      switch (action) {
        case "set": {
          if (!jid) return errResult("jid is required for 'set' action.");
          if (!tags || tags.length === 0) return errResult("tags array is required for 'set' action.");
          const contactJid = phoneToJid(jid);
          store.setContactTags(contactJid, tags);
          return okResult({ jid: contactJid, tags: store.getContactTags(contactJid) });
        }
        case "add": {
          if (!jid) return errResult("jid is required for 'add' action.");
          if (!tags || tags.length === 0) return errResult("tags array is required for 'add' action.");
          const contactJid = phoneToJid(jid);
          store.addContactTags(contactJid, tags);
          return okResult({ jid: contactJid, tags: store.getContactTags(contactJid) });
        }
        case "remove": {
          if (!jid) return errResult("jid is required for 'remove' action.");
          if (!tags || tags.length === 0) return errResult("tags array is required for 'remove' action.");
          const contactJid = phoneToJid(jid);
          store.removeContactTags(contactJid, tags);
          return okResult({ jid: contactJid, tags: store.getContactTags(contactJid) });
        }
        case "get": {
          if (!jid) return errResult("jid is required for 'get' action.");
          const contactJid = phoneToJid(jid);
          const contact = store.getContact(contactJid);
          return okResult({
            jid: contactJid,
            name: contact?.name || contact?.notify || null,
            tags: store.getContactTags(contactJid),
          });
        }
        case "list": {
          const allTags = store.getAllTags();
          const counts = {};
          for (const t of allTags) {
            counts[t] = store.listByTag(t).length;
          }
          return okResult({ tags: allTags, counts });
        }
        case "list_by_tag": {
          if (!tag) return errResult("tag is required for 'list_by_tag' action.");
          const jids = store.listByTag(tag);
          const contacts = jids.map((j) => {
            const c = store.getContact(j);
            return {
              jid: j,
              phone: jidToPhone(j),
              name: c?.name || c?.notify || null,
              tags: store.getContactTags(j),
            };
          });
          return okResult({ tag, count: contacts.length, contacts });
        }
        default:
          return errResult(`Unknown action: ${action}. Use: set, add, remove, get, list, list_by_tag.`);
      }
    },
  },
];
