/**
 * whats-mcp — Group tools (10 tools).
 *
 * create_group, get_group_info, list_groups, update_group_subject,
 * update_group_description, manage_group_participants, leave_group,
 * manage_group_invite, update_group_settings, set_group_picture
 */

"use strict";

const {
  phoneToJid, groupJid, isGroupJid, jidToPhone, resolveMedia, okResult, errResult, formatMessage,
} = require("../helpers");
const { fetchAdditionalHistory } = require("./history-support");

/**
 * Normalize a JID that is expected to be a group.
 * - If already @g.us → pass through.
 * - If contains @ (some other domain) → pass through as-is.
 * - Otherwise → append @g.us (assume bare group ID).
 */
function _ensureGroupJid(jid) {
  if (!jid) return jid;
  if (jid.includes("@")) return jid;
  return groupJid(jid);
}

function _fmtParticipant(p) {
  return {
    jid: p.id,
    phone: jidToPhone(p.id),
    admin: p.admin || null, // "admin" | "superadmin" | null
  };
}

function _fmtGroupMeta(meta, options = {}) {
  const allParticipants = (meta.participants || []).map(_fmtParticipant);
  const includeParticipants = options.includeParticipants !== false;
  const participantLimit = includeParticipants
    ? Math.max(0, options.participantLimit ?? 200)
    : 0;
  const participants = includeParticipants
    ? allParticipants.slice(0, participantLimit)
    : undefined;

  return {
    jid: meta.id,
    subject: meta.subject,
    subject_owner: meta.subjectOwner || null,
    subject_time: meta.subjectTime ? Number(meta.subjectTime) : null,
    description: meta.desc || null,
    description_id: meta.descId || null,
    owner: meta.owner || null,
    creation_time: meta.creation ? Number(meta.creation) : null,
    recent_messages: options.recentMessages || [],
    recent_message_count: (options.recentMessages || []).length,
    history_sync: options.historySync || null,
    participant_count: allParticipants.length,
    participants_returned: includeParticipants ? participants.length : 0,
    participants_truncated: includeParticipants ? participants.length < allParticipants.length : allParticipants.length > 0,
    participants,
    size: meta.size || allParticipants.length,
    announce: meta.announce ?? false,       // only admins can send
    restrict: meta.restrict ?? false,       // only admins can edit info
    ephemeral: meta.ephemeralDuration || 0, // disappearing timer
    invite_code: meta.inviteCode || null,
    linked_parent: meta.linkedParent || null, // community parent
  };
}

module.exports = [
  // 1. create_group
  {
    definition: {
      name: "create_group",
      description:
        "Create a new WhatsApp group." +
        " You must provide at least 1 participant besides yourself.",
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Group name/subject." },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Array of participant JIDs or phone numbers to add.",
          },
          description: { type: "string", description: "Optional group description." },
        },
        required: ["subject", "participants"],
      },
    },
    handler: async ({ subject, participants, description }, { sock }) => {
      const jids = participants.map(phoneToJid);
      const result = await sock.groupCreate(subject, jids);
      if (description && result.id) {
        try {
          await sock.groupUpdateDescription(result.id, description);
        } catch { /* ignore description failure */ }
      }
      return okResult({
        status: "created",
        jid: result.id,
        subject: result.subject || subject,
        participants: result.participants || jids.map((j) => ({ jid: j })),
      });
    },
  },

  // 2. get_group_info
  {
    definition: {
      name: "get_group_info",
      description:
        "Get full metadata for a group: subject, description, participants, settings, etc.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Group JID (e.g. 120363xxx@g.us)." },
          recent_messages_limit: {
            type: "integer",
            description: "Include up to this many recent cached messages before the participant list (default 10, max 50).",
          },
          hydrate_messages: {
            type: "boolean",
            description: "If true (default), request additional older history from WhatsApp when the local cache is too small.",
          },
          history_count: {
            type: "integer",
            description: "How many older messages to request during on-demand history sync (default: max(recent_messages_limit, 50), max 200).",
          },
          history_wait_ms: {
            type: "integer",
            description: "How long to wait for incoming history-sync events after requesting older messages (default 3500ms, max 15000ms).",
          },
          include_participants: {
            type: "boolean",
            description: "Whether to include participant details in the response (default true).",
          },
          participant_limit: {
            type: "integer",
            description: "Maximum number of participants to include in the response (default 200).",
          },
        },
        required: ["jid"],
      },
    },
    handler: async ({
      jid,
      recent_messages_limit,
      hydrate_messages,
      history_count,
      history_wait_ms,
      include_participants,
      participant_limit,
    }, { sock, store }) => {
      const gJid = _ensureGroupJid(jid);
      if (!isGroupJid(gJid)) {
        return errResult("Provided JID is not a group. Group JIDs end with @g.us.");
      }
      // Try live fetch first, fallback to cache
      let meta;
      try {
        meta = await sock.groupMetadata(gJid);
      } catch {
        meta = store.getGroupMeta(gJid);
        if (!meta) return errResult(`Could not retrieve metadata for group ${gJid}.`);
      }
      // Also cache it
      store.setGroupMeta(gJid, meta);

      const recentLimit = Math.min(Math.max(recent_messages_limit || 10, 0), 50);
      let historySync = {
        enabled: hydrate_messages !== false,
        requested: false,
        received: false,
        reason: recentLimit > 0 ? "cache_sufficient" : "disabled",
        before_count: store.countMessages(gJid),
        after_count: store.countMessages(gJid),
      };

      if (recentLimit > 0 && hydrate_messages !== false) {
        const cachedMessages = store.getMessages(gJid, recentLimit);
        if (cachedMessages.length < recentLimit) {
          historySync = await fetchAdditionalHistory({
            sock,
            store,
            jid: gJid,
            limit: recentLimit,
            historyCount: history_count,
            waitMs: history_wait_ms,
            enabled: hydrate_messages !== false,
          });
        }
      }

      const recentMessages = recentLimit > 0
        ? store.getMessages(gJid, recentLimit).map(formatMessage).filter(Boolean)
        : [];

      return okResult(_fmtGroupMeta(meta, {
        recentMessages,
        historySync,
        includeParticipants: include_participants,
        participantLimit: participant_limit,
      }));
    },
  },

  // 3. list_groups
  {
    definition: {
      name: "list_groups",
      description: "List all groups you are a member of.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Max number of groups to return (default 50)." },
        },
      },
    },
    handler: async ({ limit }, { sock, store }) => {
      const seen = new Set();
      const groups = [];
      const lim = limit || 50;

      for (const chat of store.listChats(10000)) {
        if (!isGroupJid(chat.id) || seen.has(chat.id)) continue;
        seen.add(chat.id);
        groups.push(chat);
        if (groups.length >= lim) break;
      }

      if (groups.length < lim) {
        for (const meta of store.groupMeta.values()) {
          if (!meta?.id || seen.has(meta.id)) continue;
          seen.add(meta.id);
          groups.push({
            id: meta.id,
            name: meta.subject,
            conversationTimestamp: meta.subjectTime || meta.creation || 0,
          });
          if (groups.length >= lim) break;
        }
      }

      // Enrich with metadata if available
      const results = [];
      for (const g of groups) {
        let meta = store.getGroupMeta(g.id);
        if (!meta) {
          try {
            meta = await sock.groupMetadata(g.id);
            store.setGroupMeta(g.id, meta);
          } catch { /* skip */ }
        }
        results.push({
          jid: g.id,
          subject: meta?.subject || g.name || g.id,
          participant_count: meta?.participants?.length || meta?.size || null,
          creation_time: meta?.creation ? Number(meta.creation) : null,
          announce: meta?.announce ?? null,
        });
      }

      return okResult({ count: results.length, groups: results });
    },
  },

  // 4. update_group_subject
  {
    definition: {
      name: "update_group_subject",
      description: "Change the group name/subject.",
      inputSchema: {
        type: "object",
        properties: {
          jid:     { type: "string", description: "Group JID." },
          subject: { type: "string", description: "New group name (max 25 characters)." },
        },
        required: ["jid", "subject"],
      },
    },
    handler: async ({ jid, subject }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      await sock.groupUpdateSubject(gJid, subject);
      return okResult({ status: "updated", jid: gJid, subject });
    },
  },

  // 5. update_group_description
  {
    definition: {
      name: "update_group_description",
      description: "Update or clear the group description.",
      inputSchema: {
        type: "object",
        properties: {
          jid:         { type: "string", description: "Group JID." },
          description: { type: "string", description: "New description. Empty string to clear." },
        },
        required: ["jid", "description"],
      },
    },
    handler: async ({ jid, description }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      await sock.groupUpdateDescription(gJid, description || undefined);
      return okResult({ status: "updated", jid: gJid });
    },
  },

  // 6. manage_group_participants
  {
    definition: {
      name: "manage_group_participants",
      description:
        "Add, remove, promote (to admin), or demote (from admin) group participants.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Group JID." },
          action: {
            type: "string",
            enum: ["add", "remove", "promote", "demote"],
            description: "Action to perform on participants.",
          },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Array of participant JIDs or phone numbers.",
          },
        },
        required: ["jid", "action", "participants"],
      },
    },
    handler: async ({ jid, action, participants }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      const pJids = participants.map(phoneToJid);
      const result = await sock.groupParticipantsUpdate(gJid, pJids, action);
      return okResult({
        status: action,
        jid: gJid,
        participants: result || pJids.map((p) => ({ jid: p, status: "ok" })),
      });
    },
  },

  // 7. leave_group
  {
    definition: {
      name: "leave_group",
      description: "Leave a group.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Group JID." },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      await sock.groupLeave(gJid);
      return okResult({ status: "left", jid: gJid });
    },
  },

  // 8. manage_group_invite
  {
    definition: {
      name: "manage_group_invite",
      description:
        "Get, revoke, or join a group via invite link/code." +
        " 'get' returns the current invite link, 'revoke' generates a new one," +
        " 'join' joins the group given an invite code.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["get", "revoke", "join"],
            description: "Action to perform.",
          },
          jid: {
            type: "string",
            description: "Group JID (required for 'get' and 'revoke').",
          },
          code: {
            type: "string",
            description: "Invite code or full link (required for 'join'). E.g. 'ABcdEfGhIjK' or 'https://chat.whatsapp.com/ABcdEfGhIjK'.",
          },
        },
        required: ["action"],
      },
    },
    handler: async ({ action, jid, code }, { sock }) => {
      if (action === "get") {
        if (!jid) return errResult("JID is required for 'get' action.");
        const gJid = _ensureGroupJid(jid);
        const inviteCode = await sock.groupInviteCode(gJid);
        return okResult({
          jid: gJid,
          invite_code: inviteCode,
          invite_link: `https://chat.whatsapp.com/${inviteCode}`,
        });
      }
      if (action === "revoke") {
        if (!jid) return errResult("JID is required for 'revoke' action.");
        const gJid = _ensureGroupJid(jid);
        const newCode = await sock.groupRevokeInvite(gJid);
        return okResult({
          jid: gJid,
          invite_code: newCode,
          invite_link: `https://chat.whatsapp.com/${newCode}`,
          note: "Previous invite link has been revoked.",
        });
      }
      if (action === "join") {
        if (!code) return errResult("Invite code is required for 'join' action.");
        // Extract code from full URL if given
        const inviteCode = code.replace("https://chat.whatsapp.com/", "").trim();
        const gJid = await sock.groupAcceptInvite(inviteCode);
        return okResult({ status: "joined", jid: gJid, invite_code: inviteCode });
      }
      return errResult(`Unknown action: ${action}`);
    },
  },

  // 9. update_group_settings
  {
    definition: {
      name: "update_group_settings",
      description:
        "Update group settings: announcement mode (only admins send)," +
        " locked mode (only admins edit info), disappearing messages, member add mode," +
        " and join approval mode.",
      inputSchema: {
        type: "object",
        properties: {
          jid: { type: "string", description: "Group JID." },
          announce: {
            type: "boolean",
            description: "true = only admins can send messages, false = all members can send.",
          },
          locked: {
            type: "boolean",
            description: "true = only admins can edit group info, false = all members can.",
          },
          ephemeral: {
            type: "integer",
            description: "Disappearing messages timer in seconds: 0=off, 86400=24h, 604800=7d, 7776000=90d.",
          },
          member_add_mode: {
            type: "boolean",
            description: "true = all members can add participants, false = only admins.",
          },
          join_approval_mode: {
            type: "boolean",
            description: "true = admin approval required for join requests.",
          },
        },
        required: ["jid"],
      },
    },
    handler: async ({ jid, announce, locked, ephemeral, member_add_mode, join_approval_mode }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      const updates = [];

      if (announce !== undefined) {
        await sock.groupSettingUpdate(gJid, announce ? "announcement" : "not_announcement");
        updates.push(`announce=${announce}`);
      }
      if (locked !== undefined) {
        await sock.groupSettingUpdate(gJid, locked ? "locked" : "unlocked");
        updates.push(`locked=${locked}`);
      }
      if (ephemeral !== undefined) {
        await sock.sendMessage(gJid, { disappearingMessagesInChat: ephemeral });
        updates.push(`ephemeral=${ephemeral}`);
      }
      if (member_add_mode !== undefined) {
        await sock.groupMemberAddMode(gJid, member_add_mode ? "all_member_add" : "admin_add");
        updates.push(`member_add_mode=${member_add_mode}`);
      }
      if (join_approval_mode !== undefined) {
        await sock.groupJoinApprovalMode(gJid, join_approval_mode ? "on" : "off");
        updates.push(`join_approval_mode=${join_approval_mode}`);
      }

      if (updates.length === 0) {
        return errResult("No settings provided. Specify at least one setting to update.");
      }
      return okResult({ status: "updated", jid: gJid, changes: updates });
    },
  },

  // 10. set_group_picture
  {
    definition: {
      name: "set_group_picture",
      description: "Set or update the group profile picture.",
      inputSchema: {
        type: "object",
        properties: {
          jid:    { type: "string", description: "Group JID." },
          source: { type: "string", description: "Image source: URL, base64, or local file path." },
        },
        required: ["jid", "source"],
      },
    },
    handler: async ({ jid, source }, { sock }) => {
      const gJid = _ensureGroupJid(jid);
      const media = resolveMedia(source);
      // updateProfilePicture expects a Buffer
      let imgBuf;
      if (Buffer.isBuffer(media)) {
        imgBuf = media;
      } else if (media.url) {
        // Fetch from URL
        const resp = await fetch(media.url);
        imgBuf = Buffer.from(await resp.arrayBuffer());
      } else {
        imgBuf = media;
      }
      await sock.updateProfilePicture(gJid, imgBuf);
      return okResult({ status: "updated", jid: gJid });
    },
  },
];
