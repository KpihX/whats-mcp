/**
 * whats-mcp — Label tools (WhatsApp Business) (3 tools).
 *
 * manage_label, manage_chat_label, manage_message_label
 */

"use strict";

const { phoneToJid, okResult, errResult } = require("../helpers");

module.exports = [
  // 1. manage_label
  {
    definition: {
      name: "manage_label",
      description:
        "Create, edit, or delete a WhatsApp Business label." +
        " Labels are used to organize chats and messages." +
        " Note: Only available for WhatsApp Business accounts.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["create", "edit", "delete", "list"],
            description: "Action to perform.",
          },
          label_id: {
            type: "string",
            description: "Label ID (required for edit/delete).",
          },
          name: {
            type: "string",
            description: "Label name (required for create/edit).",
          },
          color: {
            type: "integer",
            description: "Label color index (0-19). Optional for create/edit.",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, label_id, name, color }, { sock }) => {
      if (action === "list") {
        try {
          const labels = await sock.getLabels();
          return okResult({
            count: labels.length,
            labels: labels.map((l) => ({
              id: l.id,
              name: l.name,
              color: l.color,
              predefined: l.predefinedId !== undefined,
            })),
          });
        } catch (err) {
          return errResult("Could not fetch labels. Are you using a WhatsApp Business account? " + err.message);
        }
      }

      if (action === "create") {
        if (!name) return errResult("Label name is required for create.");
        const result = await sock.addLabel({ name, color: color ?? 0 });
        return okResult({ status: "created", label: result });
      }

      if (action === "edit") {
        if (!label_id) return errResult("label_id is required for edit.");
        const updates = {};
        if (name !== undefined)  updates.name = name;
        if (color !== undefined) updates.color = color;
        await sock.editLabel(label_id, updates);
        return okResult({ status: "edited", label_id });
      }

      if (action === "delete") {
        if (!label_id) return errResult("label_id is required for delete.");
        await sock.deleteLabel(label_id);
        return okResult({ status: "deleted", label_id });
      }

      return errResult(`Unknown action: ${action}`);
    },
  },

  // 2. manage_chat_label
  {
    definition: {
      name: "manage_chat_label",
      description: "Add or remove a label from a chat (WhatsApp Business).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove"],
            description: "Add or remove the label.",
          },
          jid: {
            type: "string",
            description: "Chat JID or phone number.",
          },
          label_id: {
            type: "string",
            description: "Label ID to add/remove.",
          },
        },
        required: ["action", "jid", "label_id"],
      },
    },
    handler: async ({ action, jid, label_id }, { sock }) => {
      const chatJid = phoneToJid(jid);
      if (action === "add") {
        await sock.addChatLabel(chatJid, label_id);
        return okResult({ status: "label_added", jid: chatJid, label_id });
      }
      if (action === "remove") {
        await sock.removeChatLabel(chatJid, label_id);
        return okResult({ status: "label_removed", jid: chatJid, label_id });
      }
      return errResult(`Unknown action: ${action}`);
    },
  },

  // 3. manage_message_label
  {
    definition: {
      name: "manage_message_label",
      description: "Add or remove a label from a specific message (WhatsApp Business).",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add", "remove"],
            description: "Add or remove the label.",
          },
          jid: {
            type: "string",
            description: "Chat JID.",
          },
          message_id: {
            type: "string",
            description: "Message ID to label.",
          },
          label_id: {
            type: "string",
            description: "Label ID.",
          },
        },
        required: ["action", "jid", "message_id", "label_id"],
      },
    },
    handler: async ({ action, jid, message_id, label_id }, { sock }) => {
      const chatJid = phoneToJid(jid);
      if (action === "add") {
        await sock.addMessageLabel(chatJid, message_id, label_id);
        return okResult({ status: "label_added", jid: chatJid, message_id, label_id });
      }
      if (action === "remove") {
        await sock.removeMessageLabel(chatJid, message_id, label_id);
        return okResult({ status: "label_removed", jid: chatJid, message_id, label_id });
      }
      return errResult(`Unknown action: ${action}`);
    },
  },
];
