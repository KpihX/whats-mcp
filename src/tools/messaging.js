/**
 * whats-mcp — Messaging tools (14 tools).
 *
 * send_text, send_image, send_video, send_audio, send_document,
 * send_sticker, send_location, send_contact, send_reaction, send_poll,
 * edit_message, delete_message, forward_message, batch_send_text
 */

"use strict";

const {
  phoneToJid, resolveMedia, okResult, errResult,
} = require("../helpers");

// ── Helper: resolve quoted message for replies ──────────────────────────────

function _buildSendOpts(args, store) {
  const opts = {};
  if (args.quoted_id) {
    const quoted = store.getMessage(args.quoted_id);
    if (quoted) opts.quoted = quoted;
  }
  if (args.mentions && Array.isArray(args.mentions)) {
    // Mentions should be JIDs
    opts.mentions = args.mentions;
  }
  return opts;
}

function _fmtSent(result, jid) {
  return okResult({
    status: "sent",
    jid,
    message_id: result?.key?.id || null,
    timestamp: result?.messageTimestamp
      ? Number(result.messageTimestamp)
      : Math.floor(Date.now() / 1000),
  });
}

// ── Tool definitions ─────────────────────────────────────────────────────────

module.exports = [
  // 1. send_text
  {
    definition: {
      name: "send_text",
      description:
        "Send a text message to a contact or group." +
        " Supports @mentions and replying to a specific message via quoted_id." +
        " The jid can be a phone number (e.g. 33612345678) or full JID.",
      inputSchema: {
        type: "object",
        properties: {
          jid:  { type: "string", description: "Recipient: phone number or full JID (e.g. 33612345678 or 33612345678@s.whatsapp.net or 120363xxx@g.us)" },
          text: { type: "string", description: "Message text to send. Supports WhatsApp formatting: *bold*, _italic_, ~strikethrough~, ```code```." },
          quoted_id:  { type: "string", description: "Optional: message ID to reply/quote." },
          mentions:   { type: "array", items: { type: "string" }, description: "Optional: array of JIDs to @mention in the message." },
        },
        required: ["jid", "text"],
      },
    },
    handler: async ({ jid, text, quoted_id, mentions }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = { text };
      const opts = _buildSendOpts({ quoted_id, mentions }, store);
      if (mentions) content.mentions = mentions;
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 2. send_image
  {
    definition: {
      name: "send_image",
      description:
        "Send an image to a contact or group." +
        " Media source can be a URL (https://...), base64 data, or local file path.",
      inputSchema: {
        type: "object",
        properties: {
          jid:     { type: "string", description: "Recipient JID or phone number." },
          source:  { type: "string", description: "Image source: URL, base64 string, or local file path." },
          caption: { type: "string", description: "Optional caption for the image." },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source, caption, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = { image: resolveMedia(source) };
      if (caption) content.caption = caption;
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 3. send_video
  {
    definition: {
      name: "send_video",
      description:
        "Send a video to a contact or group." +
        " Set gif_playback=true for a GIF, or ptv=true for a video note (circle).",
      inputSchema: {
        type: "object",
        properties: {
          jid:           { type: "string", description: "Recipient JID or phone number." },
          source:        { type: "string", description: "Video source: URL, base64, or local path." },
          caption:       { type: "string", description: "Optional caption." },
          gif_playback:  { type: "boolean", description: "Send as GIF (auto-playing, no sound). Default false." },
          ptv:           { type: "boolean", description: "Send as video note / circle message. Default false." },
          quoted_id:     { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source, caption, gif_playback, ptv, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = { video: resolveMedia(source) };
      if (caption)      content.caption = caption;
      if (gif_playback) content.gifPlayback = true;
      if (ptv)          content.ptv = true;
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 4. send_audio
  {
    definition: {
      name: "send_audio",
      description:
        "Send an audio file or voice note." +
        " Set ptt=true to send as a voice note (push-to-talk style).",
      inputSchema: {
        type: "object",
        properties: {
          jid:    { type: "string", description: "Recipient JID or phone number." },
          source: { type: "string", description: "Audio source: URL, base64, or local path." },
          ptt:    { type: "boolean", description: "Send as voice note (push-to-talk). Default false." },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source, ptt, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = { audio: resolveMedia(source) };
      if (ptt) content.ptt = true;
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 5. send_document
  {
    definition: {
      name: "send_document",
      description:
        "Send a document/file to a contact or group." +
        " Supports any file type — specify mimetype and filename.",
      inputSchema: {
        type: "object",
        properties: {
          jid:       { type: "string", description: "Recipient JID or phone number." },
          source:    { type: "string", description: "Document source: URL, base64, or local path." },
          filename:  { type: "string", description: "Display filename (e.g. 'report.pdf')." },
          mimetype:  { type: "string", description: "MIME type (e.g. 'application/pdf'). Auto-detected if omitted." },
          caption:   { type: "string", description: "Optional caption." },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source, filename, mimetype, caption, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = {
        document: resolveMedia(source),
        mimetype: mimetype || "application/octet-stream",
      };
      if (filename) content.fileName = filename;
      if (caption)  content.caption = caption;
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 6. send_sticker
  {
    definition: {
      name: "send_sticker",
      description: "Send a sticker (WebP format recommended).",
      inputSchema: {
        type: "object",
        properties: {
          jid:    { type: "string", description: "Recipient JID or phone number." },
          source: { type: "string", description: "Sticker image source: URL, base64, or local path (WebP format)." },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = { sticker: resolveMedia(source) };
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 7. send_location
  {
    definition: {
      name: "send_location",
      description: "Send a GPS location pin.",
      inputSchema: {
        type: "object",
        properties: {
          jid:       { type: "string", description: "Recipient JID or phone number." },
          latitude:  { type: "number", description: "Latitude (decimal degrees)." },
          longitude: { type: "number", description: "Longitude (decimal degrees)." },
          name:      { type: "string", description: "Optional location name." },
          address:   { type: "string", description: "Optional address text." },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "latitude", "longitude"],
      },
    },
    handler: async ({ jid, latitude, longitude, name, address, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const content = {
        location: {
          degreesLatitude: latitude,
          degreesLongitude: longitude,
        },
      };
      if (name)    content.location.name = name;
      if (address) content.location.address = address;
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 8. send_contact
  {
    definition: {
      name: "send_contact",
      description: "Send one or more contact cards (vCards).",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Recipient JID or phone number." },
          contacts: {
            type: "array",
            description: "Array of contacts to send.",
            items: {
              type: "object",
              properties: {
                name:  { type: "string", description: "Contact display name." },
                phone: { type: "string", description: "Contact phone number." },
              },
              required: ["name", "phone"],
            },
          },
          quoted_id: { type: "string", description: "Optional: message ID to reply/quote." },
        },
        required: ["jid", "contacts"],
      },
    },
    handler: async ({ jid, contacts, quoted_id }, { sock, store }) => {
      const to = phoneToJid(jid);
      const vCards = contacts.map((c) => {
        const phone = c.phone.replace(/[^0-9+]/g, "");
        return (
          "BEGIN:VCARD\n" +
          "VERSION:3.0\n" +
          `FN:${c.name}\n` +
          `TEL;type=CELL;type=VOICE;waid=${phone.replace("+", "")}:${phone}\n` +
          "END:VCARD"
        );
      });
      const content = {
        contacts: {
          displayName: contacts.length === 1 ? contacts[0].name : `${contacts.length} contacts`,
          contacts: vCards.map((vcard) => ({ vcard })),
        },
      };
      const opts = _buildSendOpts({ quoted_id }, store);
      const result = await sock.sendMessage(to, content, opts);
      return _fmtSent(result, to);
    },
  },

  // 9. send_reaction
  {
    definition: {
      name: "send_reaction",
      description:
        "React to a message with an emoji." +
        " Send an empty emoji string to remove the reaction.",
      inputSchema: {
        type: "object",
        properties: {
          jid:        { type: "string", description: "Chat JID where the message is." },
          message_id: { type: "string", description: "ID of the message to react to." },
          emoji:      { type: "string", description: "Emoji reaction (e.g. '👍', '❤️'). Empty string to remove." },
          from_me:    { type: "boolean", description: "Whether the target message was sent by you. Default false." },
        },
        required: ["jid", "message_id", "emoji"],
      },
    },
    handler: async ({ jid, message_id, emoji, from_me }, { sock }) => {
      const to = phoneToJid(jid);
      const content = {
        react: {
          text: emoji,
          key: {
            remoteJid: to,
            id: message_id,
            fromMe: from_me ?? false,
          },
        },
      };
      await sock.sendMessage(to, content);
      return okResult({
        status: emoji ? "reacted" : "reaction_removed",
        jid: to,
        message_id,
        emoji: emoji || null,
      });
    },
  },

  // 10. send_poll
  {
    definition: {
      name: "send_poll",
      description:
        "Create a poll in a chat." +
        " By default single-select; set selectable_count > 1 for multi-select.",
      inputSchema: {
        type: "object",
        properties: {
          jid:              { type: "string", description: "Recipient JID or phone number." },
          question:         { type: "string", description: "Poll question text." },
          options:          { type: "array", items: { type: "string" }, description: "Array of poll option strings (2-12)." },
          selectable_count: { type: "integer", description: "How many options can be selected (default 1 = single-select)." },
        },
        required: ["jid", "question", "options"],
      },
    },
    handler: async ({ jid, question, options, selectable_count }, { sock }) => {
      if (!options || options.length < 2) {
        return errResult("A poll requires at least 2 options.");
      }
      const to = phoneToJid(jid);
      const content = {
        poll: {
          name: question,
          values: options,
          selectableCount: selectable_count ?? 1,
        },
      };
      const result = await sock.sendMessage(to, content);
      return _fmtSent(result, to);
    },
  },

  // 11. edit_message
  {
    definition: {
      name: "edit_message",
      description:
        "Edit a previously sent message (text only)." +
        " You can only edit messages you sent.",
      inputSchema: {
        type: "object",
        properties: {
          jid:        { type: "string", description: "Chat JID where the message is." },
          message_id: { type: "string", description: "ID of the message to edit." },
          new_text:   { type: "string", description: "New text content." },
        },
        required: ["jid", "message_id", "new_text"],
      },
    },
    handler: async ({ jid, message_id, new_text }, { sock }) => {
      const to = phoneToJid(jid);
      const content = {
        text: new_text,
        edit: { remoteJid: to, id: message_id, fromMe: true },
      };
      const result = await sock.sendMessage(to, content);
      return okResult({ status: "edited", jid: to, message_id });
    },
  },

  // 12. delete_message
  {
    definition: {
      name: "delete_message",
      description:
        "Delete (revoke) a message." +
        " You can delete your own messages for everyone, or in groups admins can delete anyone's messages.",
      inputSchema: {
        type: "object",
        properties: {
          jid:         { type: "string", description: "Chat JID." },
          message_id:  { type: "string", description: "ID of the message to delete." },
          from_me:     { type: "boolean", description: "Whether you sent the message. Default true." },
          participant: { type: "string", description: "In groups: JID of the message sender (required if from_me=false)." },
        },
        required: ["jid", "message_id"],
      },
    },
    handler: async ({ jid, message_id, from_me, participant }, { sock }) => {
      const to = phoneToJid(jid);
      const key = {
        remoteJid: to,
        id: message_id,
        fromMe: from_me ?? true,
      };
      if (participant) key.participant = participant;
      await sock.sendMessage(to, { delete: key });
      return okResult({ status: "deleted", jid: to, message_id });
    },
  },

  // 13. forward_message
  {
    definition: {
      name: "forward_message",
      description: "Forward an existing message to another chat.",
      inputSchema: {
        type: "object",
        properties: {
          to_jid:     { type: "string", description: "Destination JID to forward to." },
          message_id: { type: "string", description: "ID of the message to forward." },
        },
        required: ["to_jid", "message_id"],
      },
    },
    handler: async ({ to_jid, message_id }, { sock, store }) => {
      const msg = store.getMessage(message_id);
      if (!msg) {
        return errResult(`Message ${message_id} not found in store. It must be a recent message.`);
      }
      const to = phoneToJid(to_jid);
      const result = await sock.sendMessage(to, { forward: msg, force: true });
      return _fmtSent(result, to);
    },
  },

  // 14. batch_send_text
  {
    definition: {
      name: "batch_send_text",
      description:
        "Send the same text message to multiple recipients." +
        " Returns a summary of successes and failures.",
      inputSchema: {
        type: "object",
        properties: {
          jids: {
            type: "array",
            items: { type: "string" },
            description: "Array of recipient JIDs or phone numbers.",
          },
          text: { type: "string", description: "Message text to send to all recipients." },
          delay_ms: {
            type: "integer",
            description: "Delay in ms between sends to avoid rate-limiting. Default 1000.",
          },
        },
        required: ["jids", "text"],
      },
    },
    handler: async ({ jids, text, delay_ms }, { sock }) => {
      if (!jids || jids.length === 0) {
        return errResult("At least one recipient is required.");
      }
      const delay = delay_ms ?? 1000;
      const results = [];
      for (const jid of jids) {
        const to = phoneToJid(jid);
        try {
          const r = await sock.sendMessage(to, { text });
          results.push({ jid: to, status: "sent", message_id: r?.key?.id || null });
        } catch (err) {
          results.push({ jid: to, status: "failed", error: err.message });
        }
        const idx = jids.indexOf(jid);
        if (delay > 0 && idx < jids.length - 1) {
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      const sent = results.filter((r) => r.status === "sent").length;
      const failed = results.filter((r) => r.status === "failed").length;
      return okResult({ total: jids.length, sent, failed, results });
    },
  },
];
