/**
 * whats-mcp — Newsletter / Channel tools (5 tools).
 *
 * create_channel, get_channel_info, manage_channel,
 * update_channel, delete_channel
 */

"use strict";

const {
  newsletterJid, resolveMedia, okResult, errResult,
} = require("../helpers");

function _fmtChannel(meta) {
  return {
    jid: meta.id,
    name: meta.name || meta.subject || null,
    description: meta.description || meta.desc || null,
    subscriber_count: meta.subscribers || meta.subscriberCount || null,
    creation_time: meta.creation ? Number(meta.creation) : null,
    picture_url: meta.picture || meta.pictureUrl || null,
    invite_link: meta.inviteLink || null,
    state: meta.state || null,
    verification: meta.verification || null,
    mute: meta.mute || null,
  };
}

module.exports = [
  // 1. create_channel
  {
    definition: {
      name: "create_channel",
      description:
        "Create a new WhatsApp Channel (Newsletter)." +
        " Returns the channel metadata including JID.",
      inputSchema: {
        type: "object",
        properties: {
          name:        { type: "string", description: "Channel name." },
          description: { type: "string", description: "Optional channel description." },
          picture:     { type: "string", description: "Optional profile picture: URL, base64, or file path." },
        },
        required: ["name"],
      },
    },
    handler: async ({ name, description, picture }, { sock }) => {
      const opts = { name };
      if (description) opts.description = description;
      if (picture) {
        const media = resolveMedia(picture);
        if (Buffer.isBuffer(media)) {
          opts.picture = media;
        } else if (media.url) {
          const resp = await fetch(media.url);
          opts.picture = Buffer.from(await resp.arrayBuffer());
        }
      }
      const result = await sock.newsletterCreate(name, opts);
      return okResult({
        status: "created",
        channel: _fmtChannel(result),
      });
    },
  },

  // 2. get_channel_info
  {
    definition: {
      name: "get_channel_info",
      description:
        "Get metadata for a WhatsApp Channel (Newsletter)." +
        " You can fetch by JID or invite link.",
      inputSchema: {
        type: "object",
        properties: {
          jid: {
            type: "string",
            description: "Channel JID (e.g. 120363xxx@newsletter) or invite link.",
          },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid }, { sock }) => {
      let meta;
      if (jid.startsWith("https://") || jid.startsWith("http://")) {
        // Invite link -> extract code
        const code = jid.split("/").pop();
        meta = await sock.newsletterMetadata("invite", code);
      } else {
        const channelJid = newsletterJid(jid);
        meta = await sock.newsletterMetadata("jid", channelJid);
      }
      return okResult({ channel: _fmtChannel(meta) });
    },
  },

  // 3. manage_channel
  {
    definition: {
      name: "manage_channel",
      description:
        "Follow (subscribe), unfollow, mute, or unmute a WhatsApp Channel.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Channel JID." },
          action: {
            type: "string",
            enum: ["follow", "unfollow", "mute", "unmute"],
            description: "Action to perform.",
          },
        },
        required: ["jid", "action"],
      },
    },
    handler: async ({ jid, action }, { sock }) => {
      const channelJid = newsletterJid(jid);

      if (action === "follow") {
        await sock.newsletterFollow(channelJid);
        return okResult({ status: "followed", jid: channelJid });
      }
      if (action === "unfollow") {
        await sock.newsletterUnfollow(channelJid);
        return okResult({ status: "unfollowed", jid: channelJid });
      }
      if (action === "mute") {
        await sock.newsletterMute(channelJid);
        return okResult({ status: "muted", jid: channelJid });
      }
      if (action === "unmute") {
        await sock.newsletterUnmute(channelJid);
        return okResult({ status: "unmuted", jid: channelJid });
      }
      return errResult(`Unknown action: ${action}`);
    },
  },

  // 4. update_channel
  {
    definition: {
      name: "update_channel",
      description: "Update a channel's name, description, or picture.",
      inputSchema: {
        type: "object",
        properties: {
          jid:         { type: "string", description: "Channel JID." },
          name:        { type: "string", description: "New channel name." },
          description: { type: "string", description: "New channel description." },
          picture:     { type: "string", description: "New picture: URL, base64, or file path. Use 'remove' to delete." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid, name, description, picture }, { sock }) => {
      const channelJid = newsletterJid(jid);
      const updates = [];

      if (name) {
        await sock.newsletterUpdateName(channelJid, name);
        updates.push("name");
      }
      if (description !== undefined) {
        await sock.newsletterUpdateDescription(channelJid, description);
        updates.push("description");
      }
      if (picture) {
        if (picture === "remove") {
          await sock.newsletterRemovePicture(channelJid);
          updates.push("picture (removed)");
        } else {
          const media = resolveMedia(picture);
          let imgBuf;
          if (Buffer.isBuffer(media)) {
            imgBuf = media;
          } else if (media.url) {
            const resp = await fetch(media.url);
            imgBuf = Buffer.from(await resp.arrayBuffer());
          } else {
            imgBuf = media;
          }
          await sock.newsletterUpdatePicture(channelJid, imgBuf);
          updates.push("picture");
        }
      }

      if (updates.length === 0) {
        return errResult("No updates provided. Specify name, description, or picture.");
      }
      return okResult({ status: "updated", jid: channelJid, updated: updates });
    },
  },

  // 5. delete_channel
  {
    definition: {
      name: "delete_channel",
      description: "Delete a WhatsApp Channel that you own. This action is irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Channel JID to delete." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid }, { sock }) => {
      const channelJid = newsletterJid(jid);
      await sock.newsletterDelete(channelJid);
      return okResult({ status: "deleted", jid: channelJid });
    },
  },
];
