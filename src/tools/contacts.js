/**
 * whats-mcp — Contact tools (5 tools).
 *
 * check_phone_number, get_contact_info, get_profile_picture,
 * manage_block, get_business_profile
 */

"use strict";

const { phoneToJid, jidToPhone, isGroupJid, okResult, errResult } = require("../helpers");

module.exports = [
  // 1. check_phone_number
  {
    definition: {
      name: "check_phone_number",
      description:
        "Check if one or more phone numbers are registered on WhatsApp." +
        " Returns the JID for each number that is on WhatsApp.",
      inputSchema: {
        type: "object",
        properties: {
          phones: {
            type: "array",
            items: { type: "string" },
            description: "Array of phone numbers to check (e.g. ['33612345678', '+1555000123']).",
          },
        },
        required: ["phones"],
      },
    },
    handler: async ({ phones }, { sock }) => {
      if (!phones || phones.length === 0) {
        return errResult("At least one phone number is required.");
      }
      // Normalize phone numbers to JIDs
      const ids = phones.map((p) => phoneToJid(p));
      const result = await sock.onWhatsApp(...ids);
      const formatted = result.map((r) => ({
        phone: jidToPhone(r.jid),
        jid: r.jid,
        exists: r.exists,
      }));
      return okResult({
        total: phones.length,
        on_whatsapp: formatted.filter((r) => r.exists).length,
        results: formatted,
      });
    },
  },

  // 2. get_contact_info
  {
    definition: {
      name: "get_contact_info",
      description:
        "Get info about a contact: name, about/status text, and profile picture URL." +
        " Combines data from the local store and live API calls.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Contact JID or phone number." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid }, { sock, store }) => {
      const contactJid = phoneToJid(jid);
      const info = { jid: contactJid };

      // From store
      const storeContact = store.getContact(contactJid);
      if (storeContact) {
        info.name = storeContact.name || storeContact.notify || storeContact.verifiedName || null;
        info.short_name = storeContact.short || null;
      }

      // Live: status/about
      try {
        const status = await sock.fetchStatus(contactJid);
        info.about = status?.status || null;
        info.about_set_at = status?.setAt ? Number(status.setAt) : null;
      } catch {
        info.about = null;
      }

      // Live: profile picture
      try {
        info.profile_picture_url = await sock.profilePictureUrl(contactJid, "image");
      } catch {
        info.profile_picture_url = null;
      }

      return okResult(info);
    },
  },

  // 3. get_profile_picture
  {
    definition: {
      name: "get_profile_picture",
      description: "Get the profile picture URL for any JID (contact, group, or your own).",
      inputSchema: {
        type: "object",
        properties: {
          jid:  { type: "string", description: "JID or phone number. Use 'me' for your own picture." },
          type: {
            type: "string",
            enum: ["image", "preview"],
            description: "Resolution: 'image' for full size, 'preview' for thumbnail. Default 'image'.",
          },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid, type }, { sock }) => {
      let targetJid;
      if (jid === "me") {
        const { user } = sock;
        targetJid = user?.id;
        if (!targetJid) return errResult("Cannot determine own JID. Are you connected?");
      } else {
        targetJid = phoneToJid(jid);
      }
      try {
        const url = await sock.profilePictureUrl(targetJid, type || "image");
        return okResult({ jid: targetJid, profile_picture_url: url });
      } catch (err) {
        if (err.message?.includes("404") || err.message?.includes("not-authorized")) {
          return okResult({ jid: targetJid, profile_picture_url: null, note: "No profile picture or not authorized." });
        }
        throw err;
      }
    },
  },

  // 4. manage_block
  {
    definition: {
      name: "manage_block",
      description: "Block, unblock a contact, or list blocked contacts.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["block", "unblock", "list"],
            description: "Action to perform.",
          },
          jid: {
            type: "string",
            description: "Contact JID or phone number (required for block/unblock).",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, jid }, { sock }) => {
      if (action === "list") {
        const blocked = await sock.fetchBlocklist();
        return okResult({
          count: blocked.length,
          blocked: blocked.map((b) => ({ jid: b, phone: jidToPhone(b) })),
        });
      }
      if (!jid) return errResult(`JID is required for ${action} action.`);
      const contactJid = phoneToJid(jid);
      if (action === "block") {
        await sock.updateBlockStatus(contactJid, "block");
        return okResult({ status: "blocked", jid: contactJid });
      }
      if (action === "unblock") {
        await sock.updateBlockStatus(contactJid, "unblock");
        return okResult({ status: "unblocked", jid: contactJid });
      }
      return errResult(`Unknown action: ${action}`);
    },
  },

  // 5. get_business_profile
  {
    definition: {
      name: "get_business_profile",
      description:
        "Get the WhatsApp Business profile of a contact." +
        " Returns business info: description, category, website, email, etc.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Business contact JID or phone number." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid }, { sock }) => {
      const contactJid = phoneToJid(jid);
      try {
        const profile = await sock.getBusinessProfile(contactJid);
        return okResult({
          jid: contactJid,
          business_profile: profile || null,
        });
      } catch (err) {
        return okResult({
          jid: contactJid,
          business_profile: null,
          note: "Could not retrieve business profile. Contact may not be a business account.",
        });
      }
    },
  },

  // 6. list_contacts
  {
    definition: {
      name: "list_contacts",
      description:
        "List contacts from the local store with optional filtering by name, tag, or type." +
        " Returns contact info including custom tags if any are assigned.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max contacts to return (default 100, max 1000)." },
          offset: { type: "integer", description: "Offset for pagination (default 0)." },
          name: { type: "string", description: "Filter by name (case-insensitive substring match)." },
          tag: { type: "string", description: "Filter to contacts with this custom tag." },
          has_tags: { type: "boolean", description: "If true, only contacts with tags; if false, only without tags." },
          exclude_groups: { type: "boolean", description: "Exclude group JIDs from results (default true)." },
        },
      },
    },
    handler: async ({ limit, offset, name, tag, has_tags, exclude_groups }, { store }) => {
      let contacts = store.listContacts({ name, tag, has_tags });

      // Exclude groups by default
      if (exclude_groups !== false) {
        contacts = contacts.filter((c) => !isGroupJid(c.id));
      }

      const total = contacts.length;
      const off = offset || 0;
      const lim = Math.min(limit || 100, 1000);
      const page = contacts.slice(off, off + lim);

      return okResult({
        total,
        offset: off,
        count: page.length,
        contacts: page.map((c) => ({
          jid: c.id,
          phone: jidToPhone(c.id),
          name: c.name || c.notify || c.verifiedName || null,
          short_name: c.short || null,
          tags: store.getContactTags(c.id),
        })),
      });
    },
  },
];
