/**
 * whats-mcp — Profile & Privacy tools (4 tools).
 *
 * update_display_name, update_about, update_profile_picture, manage_privacy
 */

"use strict";

const { resolveMedia, okResult, errResult } = require("../helpers");

module.exports = [
  // 1. update_display_name
  {
    definition: {
      name: "update_display_name",
      description: "Change your WhatsApp display name.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "New display name (max 25 characters)." },
        },
        required: ["name"],
      },
    },
    handler: async ({ name }, { sock }) => {
      if (!name || name.length > 25) {
        return errResult("Name must be between 1 and 25 characters.");
      }
      await sock.updateProfileName(name);
      return okResult({ status: "updated", name });
    },
  },

  // 2. update_about
  {
    definition: {
      name: "update_about",
      description: "Change your WhatsApp 'About' status text.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "New about text (max 139 characters). Empty string to clear." },
        },
        required: ["text"],
      },
    },
    handler: async ({ text }, { sock }) => {
      await sock.updateProfileStatus(text || "");
      return okResult({ status: "updated", about: text });
    },
  },

  // 3. update_profile_picture
  {
    definition: {
      name: "update_profile_picture",
      description: "Change your WhatsApp profile picture.",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Image source: URL, base64, or local file path. Use 'remove' to delete the picture." },
        },
        required: ["source"],
      },
    },
    handler: async ({ source }, { sock }) => {
      if (source === "remove") {
        await sock.removeProfilePicture(sock.user.id);
        return okResult({ status: "removed" });
      }
      const media = resolveMedia(source);
      let imgBuf;
      if (Buffer.isBuffer(media)) {
        imgBuf = media;
      } else if (media.url) {
        const resp = await fetch(media.url);
        imgBuf = Buffer.from(await resp.arrayBuffer());
      } else {
        imgBuf = media;
      }
      await sock.updateProfilePicture(sock.user.id, imgBuf);
      return okResult({ status: "updated" });
    },
  },

  // 4. manage_privacy
  {
    definition: {
      name: "manage_privacy",
      description:
        "Get or update WhatsApp privacy settings." +
        " Use action='get' to retrieve current settings." +
        " Use action='set' with a setting name and value to update.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["get", "set"],
            description: "Action: 'get' to retrieve all privacy settings, 'set' to update one.",
          },
          setting: {
            type: "string",
            enum: [
              "last_seen", "online", "profile_picture", "about",
              "read_receipts", "groups_add", "default_disappearing",
            ],
            description: "Privacy setting to update (required for 'set').",
          },
          value: {
            type: "string",
            enum: ["all", "contacts", "contact_blacklist", "none", "match_last_seen"],
            description:
              "New value for the setting (required for 'set')." +
              " 'all' = everyone, 'contacts' = contacts only, 'none' = nobody." +
              " 'contact_blacklist' = contacts except... 'match_last_seen' = match last seen setting.",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, setting, value }, { sock }) => {
      if (action === "get") {
        const settings = await sock.fetchPrivacySettings(true);
        return okResult({ privacy: settings });
      }

      if (action === "set") {
        if (!setting || !value) {
          return errResult("Both 'setting' and 'value' are required for 'set' action.");
        }

        const apiMap = {
          last_seen:       () => sock.updateLastSeenPrivacy(value),
          online:          () => sock.updateOnlinePrivacy(value),
          profile_picture: () => sock.updateProfilePicturePrivacy(value),
          about:           () => sock.updateStatusPrivacy(value),
          read_receipts:   () => sock.updateReadReceiptsPrivacy(value),
          groups_add:      () => sock.updateGroupsAddPrivacy(value),
          default_disappearing: () => sock.updateDefaultDisappearingMode(
            value === "all" ? 0 : value === "contacts" ? 86400 : 604800,
          ),
        };

        const fn = apiMap[setting];
        if (!fn) return errResult(`Unknown setting: ${setting}.`);

        await fn();
        return okResult({ status: "updated", setting, value });
      }

      return errResult(`Unknown action: ${action}`);
    },
  },
];
