/**
 * Tests — Tool registry + all tool handlers (mocked).
 *
 * Each tool handler receives a mock { sock, store } context.
 * We verify tool definitions, argument validation, and handler logic.
 */

const { listTools, callTool } = require("../src/tools/registry");
const Store = require("../src/store");

// ── Mock socket factory ──────────────────────────────────────────────────────

function mockSock(overrides = {}) {
  return {
    user: { id: "33600000000:0@s.whatsapp.net", name: "TestUser" },
    sendMessage: jest.fn().mockResolvedValue({
      key: { id: "sent_123", remoteJid: "dest@s.whatsapp.net", fromMe: true },
      messageTimestamp: 1700000000,
    }),
    chatModify: jest.fn().mockResolvedValue(undefined),
    onWhatsApp: jest.fn().mockResolvedValue([
      { jid: "33612345678@s.whatsapp.net", exists: true },
    ]),
    fetchStatus: jest.fn().mockResolvedValue({ status: "Hey there!", setAt: 1700000000 }),
    profilePictureUrl: jest.fn().mockResolvedValue("https://example.com/pic.jpg"),
    updateBlockStatus: jest.fn().mockResolvedValue(undefined),
    fetchBlocklist: jest.fn().mockResolvedValue(["blocked@s.whatsapp.net"]),
    getBusinessProfile: jest.fn().mockResolvedValue({ description: "A business" }),
    groupCreate: jest.fn().mockResolvedValue({ id: "newgroup@g.us", subject: "Test Group" }),
    groupMetadata: jest.fn().mockResolvedValue({
      id: "group@g.us",
      subject: "Group",
      participants: [{ id: "p1@s.whatsapp.net", admin: "superadmin" }],
    }),
    groupUpdateSubject: jest.fn().mockResolvedValue(undefined),
    groupUpdateDescription: jest.fn().mockResolvedValue(undefined),
    groupParticipantsUpdate: jest.fn().mockResolvedValue([{ jid: "p@s.whatsapp.net", status: "200" }]),
    groupLeave: jest.fn().mockResolvedValue(undefined),
    groupInviteCode: jest.fn().mockResolvedValue("ABCdef123"),
    groupRevokeInvite: jest.fn().mockResolvedValue("NewCode456"),
    groupAcceptInvite: jest.fn().mockResolvedValue("joined@g.us"),
    groupSettingUpdate: jest.fn().mockResolvedValue(undefined),
    groupMemberAddMode: jest.fn().mockResolvedValue(undefined),
    groupJoinApprovalMode: jest.fn().mockResolvedValue(undefined),
    updateProfilePicture: jest.fn().mockResolvedValue(undefined),
    updateProfileName: jest.fn().mockResolvedValue(undefined),
    updateProfileStatus: jest.fn().mockResolvedValue(undefined),
    removeProfilePicture: jest.fn().mockResolvedValue(undefined),
    fetchPrivacySettings: jest.fn().mockResolvedValue({ readreceipts: "all", last: "contacts" }),
    updateLastSeenPrivacy: jest.fn().mockResolvedValue(undefined),
    updateOnlinePrivacy: jest.fn().mockResolvedValue(undefined),
    updateProfilePicturePrivacy: jest.fn().mockResolvedValue(undefined),
    updateStatusPrivacy: jest.fn().mockResolvedValue(undefined),
    updateReadReceiptsPrivacy: jest.fn().mockResolvedValue(undefined),
    updateGroupsAddPrivacy: jest.fn().mockResolvedValue(undefined),
    updateDefaultDisappearingMode: jest.fn().mockResolvedValue(undefined),
    newsletterCreate: jest.fn().mockResolvedValue({ id: "ch@newsletter", name: "MyCh" }),
    newsletterMetadata: jest.fn().mockResolvedValue({ id: "ch@newsletter", name: "Ch" }),
    newsletterFollow: jest.fn().mockResolvedValue(undefined),
    newsletterUnfollow: jest.fn().mockResolvedValue(undefined),
    newsletterMute: jest.fn().mockResolvedValue(undefined),
    newsletterUnmute: jest.fn().mockResolvedValue(undefined),
    newsletterUpdateName: jest.fn().mockResolvedValue(undefined),
    newsletterUpdateDescription: jest.fn().mockResolvedValue(undefined),
    newsletterUpdatePicture: jest.fn().mockResolvedValue(undefined),
    newsletterRemovePicture: jest.fn().mockResolvedValue(undefined),
    newsletterDelete: jest.fn().mockResolvedValue(undefined),
    getLabels: jest.fn().mockResolvedValue([{ id: "1", name: "Urgent", color: 0 }]),
    addLabel: jest.fn().mockResolvedValue({ id: "2", name: "New" }),
    editLabel: jest.fn().mockResolvedValue(undefined),
    deleteLabel: jest.fn().mockResolvedValue(undefined),
    addChatLabel: jest.fn().mockResolvedValue(undefined),
    removeChatLabel: jest.fn().mockResolvedValue(undefined),
    addMessageLabel: jest.fn().mockResolvedValue(undefined),
    removeMessageLabel: jest.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
    readMessages: jest.fn().mockResolvedValue(undefined),
    fetchMessageHistory: jest.fn().mockResolvedValue("pdo-request-id"),
    ...overrides,
  };
}

function mockCtx(overrides = {}) {
  const sock = mockSock(overrides);
  const store = new Store();
  return {
    sock,
    store,
    config: { watchlists: { test_group: ["120363test@g.us"] } },
    connectionInfo: () => ({
      state: "open",
      user: { id: "33600000000:0@s.whatsapp.net", name: "TestUser" },
      store_stats: store.stats(),
      reconnect_attempts: 0,
    }),
  };
}

function parseResult(result) {
  if (result.content && result.content[0]?.text) {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return result.content[0].text;
    }
  }
  return result;
}

// ── Registry tests ───────────────────────────────────────────────────────────

describe("Tool Registry", () => {
  test("listTools returns 64 tools", () => {
    const tools = listTools();
    expect(tools.length).toBe(64);
  });

  test("all tools have unique names", () => {
    const tools = listTools();
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("all tools have definition structure", () => {
    const tools = listTools();
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(typeof t.name).toBe("string");
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeDefined();
      expect(t.inputSchema.type).toBe("object");
    }
  });

  test("callTool returns error for unknown tool", async () => {
    const ctx = mockCtx();
    const result = await callTool("nonexistent_tool", {}, ctx);
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toContain("Unknown tool");
  });
});

// ── Messaging tools ──────────────────────────────────────────────────────────

describe("Messaging tools", () => {
  test("send_text", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_text", { jid: "33612345678", text: "Hello" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(ctx.sock.sendMessage).toHaveBeenCalledWith(
      "33612345678@s.whatsapp.net",
      { text: "Hello" },
      {},
    );
    const data = parseResult(result);
    expect(data.status).toBe("sent");
    expect(data.jid).toBe("33612345678@s.whatsapp.net");
  });

  test("send_text with reply", async () => {
    const ctx = mockCtx();
    // Put a message in store for quoting
    ctx.store.upsertMessages([
      { key: { remoteJid: "33612345678@s.whatsapp.net", id: "original_msg" }, message: { conversation: "hi" } },
    ]);
    const result = await callTool("send_text", {
      jid: "33612345678",
      text: "Reply!",
      quoted_id: "original_msg",
    }, ctx);
    expect(result.isError).toBeUndefined();
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[2].quoted).toBeDefined();
  });

  test("send_image", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_image", {
      jid: "33612345678",
      source: "https://example.com/img.png",
      caption: "Check this",
    }, ctx);
    expect(result.isError).toBeUndefined();
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].image).toEqual({ url: "https://example.com/img.png" });
    expect(callArgs[1].caption).toBe("Check this");
  });

  test("send_video with gif", async () => {
    const ctx = mockCtx();
    await callTool("send_video", {
      jid: "33612345678",
      source: "https://example.com/vid.mp4",
      gif_playback: true,
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].gifPlayback).toBe(true);
  });

  test("send_audio as voice note", async () => {
    const ctx = mockCtx();
    await callTool("send_audio", {
      jid: "33612345678",
      source: "https://example.com/audio.ogg",
      ptt: true,
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].ptt).toBe(true);
  });

  test("send_document", async () => {
    const ctx = mockCtx();
    await callTool("send_document", {
      jid: "33612345678",
      source: "https://example.com/doc.pdf",
      filename: "report.pdf",
      mimetype: "application/pdf",
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].document).toEqual({ url: "https://example.com/doc.pdf" });
    expect(callArgs[1].fileName).toBe("report.pdf");
    expect(callArgs[1].mimetype).toBe("application/pdf");
  });

  test("send_sticker", async () => {
    const ctx = mockCtx();
    await callTool("send_sticker", {
      jid: "33612345678",
      source: "https://example.com/sticker.webp",
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].sticker).toEqual({ url: "https://example.com/sticker.webp" });
  });

  test("send_location", async () => {
    const ctx = mockCtx();
    await callTool("send_location", {
      jid: "33612345678",
      latitude: 48.8566,
      longitude: 2.3522,
      name: "Paris",
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].location.degreesLatitude).toBe(48.8566);
    expect(callArgs[1].location.name).toBe("Paris");
  });

  test("send_contact", async () => {
    const ctx = mockCtx();
    await callTool("send_contact", {
      jid: "33612345678",
      contacts: [{ name: "Alice", phone: "+33600000001" }],
    }, ctx);
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].contacts.displayName).toBe("Alice");
    expect(callArgs[1].contacts.contacts[0].vcard).toContain("FN:Alice");
  });

  test("send_reaction", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_reaction", {
      jid: "33612345678",
      message_id: "msg123",
      emoji: "👍",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("reacted");
    expect(data.emoji).toBe("👍");
  });

  test("send_reaction remove", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_reaction", {
      jid: "33612345678",
      message_id: "msg123",
      emoji: "",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("reaction_removed");
  });

  test("send_poll", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_poll", {
      jid: "33612345678",
      question: "Lunch?",
      options: ["Pizza", "Sushi", "Tacos"],
    }, ctx);
    expect(result.isError).toBeUndefined();
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].poll.name).toBe("Lunch?");
    expect(callArgs[1].poll.values).toEqual(["Pizza", "Sushi", "Tacos"]);
  });

  test("send_poll requires 2+ options", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_poll", {
      jid: "33612345678",
      question: "Q?",
      options: ["Only one"],
    }, ctx);
    expect(result.isError).toBe(true);
  });

  test("edit_message", async () => {
    const ctx = mockCtx();
    const result = await callTool("edit_message", {
      jid: "33612345678",
      message_id: "msg123",
      new_text: "Updated",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("edited");
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].text).toBe("Updated");
    expect(callArgs[1].edit).toBeDefined();
  });

  test("delete_message", async () => {
    const ctx = mockCtx();
    const result = await callTool("delete_message", {
      jid: "33612345678",
      message_id: "msg123",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("deleted");
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].delete).toBeDefined();
  });

  test("forward_message", async () => {
    const ctx = mockCtx();
    const msg = {
      key: { remoteJid: "src@s.whatsapp.net", id: "orig_msg" },
      message: { conversation: "Forward me" },
    };
    ctx.store.upsertMessages([msg]);
    const result = await callTool("forward_message", {
      to_jid: "33612345678",
      message_id: "orig_msg",
    }, ctx);
    expect(result.isError).toBeUndefined();
    const callArgs = ctx.sock.sendMessage.mock.calls[0];
    expect(callArgs[1].forward).toBeDefined();
  });

  test("forward_message not found", async () => {
    const ctx = mockCtx();
    const result = await callTool("forward_message", {
      to_jid: "33612345678",
      message_id: "nonexistent",
    }, ctx);
    expect(result.isError).toBe(true);
  });

  test("batch_send_text", async () => {
    const ctx = mockCtx();
    const result = await callTool("batch_send_text", {
      jids: ["33600000001", "33600000002"],
      text: "Batch!",
      delay_ms: 0,
    }, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(2);
    expect(data.sent).toBe(2);
    expect(ctx.sock.sendMessage).toHaveBeenCalledTimes(2);
  });

  test("batch_send_text empty", async () => {
    const ctx = mockCtx();
    const result = await callTool("batch_send_text", { jids: [], text: "X" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("batch_send_text handles partial failure", async () => {
    const ctx = mockCtx();
    ctx.sock.sendMessage
      .mockResolvedValueOnce({ key: { id: "ok" } })
      .mockRejectedValueOnce(new Error("rate limited"));
    const result = await callTool("batch_send_text", {
      jids: ["33600000001", "33600000002"],
      text: "Test",
      delay_ms: 0,
    }, ctx);
    const data = parseResult(result);
    expect(data.sent).toBe(1);
    expect(data.failed).toBe(1);
  });
});

// ── Chat tools ───────────────────────────────────────────────────────────────

describe("Chat tools", () => {
  test("list_chats", async () => {
    const ctx = mockCtx();
    ctx.store.upsertChats([
      { id: "a@s.whatsapp.net", name: "A", conversationTimestamp: 100 },
      { id: "b@g.us", name: "B", conversationTimestamp: 200 },
    ]);
    const result = await callTool("list_chats", {}, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(2);
    expect(data.chats[0].jid).toBe("b@g.us"); // newest first
  });

  test("list_chats with filter=groups", async () => {
    const ctx = mockCtx();
    ctx.store.upsertChats([
      { id: "a@s.whatsapp.net", conversationTimestamp: 100 },
      { id: "b@g.us", conversationTimestamp: 200 },
    ]);
    const result = await callTool("list_chats", { filter: "groups" }, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(data.chats[0].jid).toBe("b@g.us");
  });

  test("get_messages", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100, message: { conversation: "hi" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200, message: { conversation: "bye" } },
    ]);
    const result = await callTool("get_messages", { jid: "a@s.whatsapp.net", limit: 10 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(2);
    expect(data.messages[0].id).toBe("m2"); // newest first
  });

  test("get_messages can request older history on demand", async () => {
    const ctx = mockCtx({
      fetchMessageHistory: jest.fn().mockImplementation(async (_count, key) => {
        setTimeout(() => {
          ctx.store.upsertMessages([
            {
              key: { remoteJid: key.remoteJid, id: "m0" },
              messageTimestamp: 50,
              message: { conversation: "older" },
            },
          ]);
        }, 10);
        return "pdo-request-id";
      }),
    });

    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100, message: { conversation: "hi" } },
    ]);

    const result = await callTool("get_messages", {
      jid: "a@s.whatsapp.net",
      limit: 2,
      history_wait_ms: 200,
    }, ctx);
    const data = parseResult(result);
    expect(ctx.sock.fetchMessageHistory).toHaveBeenCalled();
    expect(data.history_sync.requested).toBe(true);
    expect(data.history_sync.received).toBe(true);
    expect(data.count).toBe(2);
  });

  test("manage_chat archive", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_chat", { jid: "33612345678", action: "archive" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(ctx.sock.chatModify).toHaveBeenCalled();
    const data = parseResult(result);
    expect(data.status).toBe("archive");
  });

  test("manage_chat unknown action", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_chat", { jid: "33612345678", action: "fly" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("star_message", async () => {
    const ctx = mockCtx();
    const result = await callTool("star_message", {
      jid: "33612345678",
      message_id: "m1",
      star: true,
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("starred");
  });

  test("set_disappearing", async () => {
    const ctx = mockCtx();
    const result = await callTool("set_disappearing", { jid: "33612345678", duration: 86400 }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("set");
    expect(data.disappearing).toBe("24 hours");
  });
});

// ── Contact tools ────────────────────────────────────────────────────────────

describe("Contact tools", () => {
  test("check_phone_number", async () => {
    const ctx = mockCtx();
    const result = await callTool("check_phone_number", {
      phones: ["33612345678"],
    }, ctx);
    const data = parseResult(result);
    expect(data.on_whatsapp).toBe(1);
    expect(ctx.sock.onWhatsApp).toHaveBeenCalled();
  });

  test("check_phone_number empty", async () => {
    const ctx = mockCtx();
    const result = await callTool("check_phone_number", { phones: [] }, ctx);
    expect(result.isError).toBe(true);
  });

  test("get_contact_info", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([{ id: "33612345678@s.whatsapp.net", name: "Alice" }]);
    const result = await callTool("get_contact_info", { jid: "33612345678" }, ctx);
    const data = parseResult(result);
    expect(data.name).toBe("Alice");
    expect(data.about).toBe("Hey there!");
    expect(data.profile_picture_url).toBe("https://example.com/pic.jpg");
  });

  test("get_profile_picture", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_profile_picture", { jid: "33612345678" }, ctx);
    const data = parseResult(result);
    expect(data.profile_picture_url).toBe("https://example.com/pic.jpg");
  });

  test("manage_block list", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_block", { action: "list" }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.blocked[0].jid).toBe("blocked@s.whatsapp.net");
  });

  test("manage_block block", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_block", { action: "block", jid: "33612345678" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("blocked");
    expect(ctx.sock.updateBlockStatus).toHaveBeenCalledWith("33612345678@s.whatsapp.net", "block");
  });

  test("get_business_profile", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_business_profile", { jid: "33612345678" }, ctx);
    const data = parseResult(result);
    expect(data.business_profile.description).toBe("A business");
  });
});

// ── Group tools ──────────────────────────────────────────────────────────────

describe("Group tools", () => {
  test("create_group", async () => {
    const ctx = mockCtx();
    const result = await callTool("create_group", {
      subject: "My Group",
      participants: ["33600000001", "33600000002"],
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("created");
    expect(data.jid).toBe("newgroup@g.us");
  });

  test("get_group_info", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_group_info", { jid: "group@g.us" }, ctx);
    const data = parseResult(result);
    expect(data.subject).toBe("Group");
    expect(data.participants.length).toBe(1);
  });

  test("get_group_info places recent messages before participants and limits participant output", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "group@g.us", id: "m1" }, messageTimestamp: 100, message: { conversation: "hello group" } },
    ]);

    const result = await callTool("get_group_info", {
      jid: "group@g.us",
      recent_messages_limit: 5,
      participant_limit: 0,
    }, ctx);

    const raw = result.content[0].text;
    expect(raw.indexOf('"recent_messages"')).toBeLessThan(raw.indexOf('"participants"'));

    const data = parseResult(result);
    expect(data.recent_messages.length).toBe(1);
    expect(data.participants_returned).toBe(0);
    expect(data.participants_truncated).toBe(true);
  });

  test("get_group_info non-group JID", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_group_info", { jid: "33612345678@s.whatsapp.net" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("list_groups", async () => {
    const ctx = mockCtx();
    ctx.store.upsertChats([
      { id: "g1@g.us", conversationTimestamp: 100 },
      { id: "personal@s.whatsapp.net", conversationTimestamp: 200 },
      { id: "g2@g.us", conversationTimestamp: 300 },
    ]);
    const result = await callTool("list_groups", {}, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(2);
  });

  test("list_groups falls back to cached group metadata", async () => {
    const ctx = mockCtx();
    ctx.store.setGroupMeta("g-meta@g.us", {
      id: "g-meta@g.us",
      subject: "Metadata Group",
      participants: [{ id: "p1@s.whatsapp.net" }],
      creation: 123,
    });
    const result = await callTool("list_groups", {}, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.groups[0].jid).toBe("g-meta@g.us");
    expect(data.groups[0].subject).toBe("Metadata Group");
  });

  test("update_group_subject", async () => {
    const ctx = mockCtx();
    await callTool("update_group_subject", { jid: "group@g.us", subject: "New Name" }, ctx);
    expect(ctx.sock.groupUpdateSubject).toHaveBeenCalledWith("group@g.us", "New Name");
  });

  test("update_group_description", async () => {
    const ctx = mockCtx();
    await callTool("update_group_description", { jid: "group@g.us", description: "New desc" }, ctx);
    expect(ctx.sock.groupUpdateDescription).toHaveBeenCalledWith("group@g.us", "New desc");
  });

  test("manage_group_participants add", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_group_participants", {
      jid: "group@g.us",
      action: "add",
      participants: ["33600000001"],
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("add");
    expect(ctx.sock.groupParticipantsUpdate).toHaveBeenCalledWith(
      "group@g.us",
      ["33600000001@s.whatsapp.net"],
      "add",
    );
  });

  test("leave_group", async () => {
    const ctx = mockCtx();
    await callTool("leave_group", { jid: "group@g.us" }, ctx);
    expect(ctx.sock.groupLeave).toHaveBeenCalledWith("group@g.us");
  });

  test("manage_group_invite get", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_group_invite", { action: "get", jid: "group@g.us" }, ctx);
    const data = parseResult(result);
    expect(data.invite_code).toBe("ABCdef123");
    expect(data.invite_link).toContain("https://chat.whatsapp.com/");
  });

  test("manage_group_invite join", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_group_invite", {
      action: "join",
      code: "https://chat.whatsapp.com/ABCdefGhi",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("joined");
    expect(ctx.sock.groupAcceptInvite).toHaveBeenCalledWith("ABCdefGhi");
  });

  test("update_group_settings", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_group_settings", {
      jid: "group@g.us",
      announce: true,
      locked: true,
    }, ctx);
    const data = parseResult(result);
    expect(data.changes.length).toBe(2);
    expect(ctx.sock.groupSettingUpdate).toHaveBeenCalledTimes(2);
  });

  test("update_group_settings no changes", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_group_settings", { jid: "group@g.us" }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ── Profile tools ────────────────────────────────────────────────────────────

describe("Profile tools", () => {
  test("update_display_name", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_display_name", { name: "NewName" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("updated");
    expect(ctx.sock.updateProfileName).toHaveBeenCalledWith("NewName");
  });

  test("update_display_name too long", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_display_name", { name: "A".repeat(26) }, ctx);
    expect(result.isError).toBe(true);
  });

  test("update_about", async () => {
    const ctx = mockCtx();
    await callTool("update_about", { text: "Busy" }, ctx);
    expect(ctx.sock.updateProfileStatus).toHaveBeenCalledWith("Busy");
  });

  test("manage_privacy get", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_privacy", { action: "get" }, ctx);
    const data = parseResult(result);
    expect(data.privacy).toBeDefined();
    expect(data.privacy.readreceipts).toBe("all");
  });

  test("manage_privacy set", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_privacy", {
      action: "set",
      setting: "last_seen",
      value: "contacts",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("updated");
    expect(ctx.sock.updateLastSeenPrivacy).toHaveBeenCalledWith("contacts");
  });

  test("manage_privacy set missing fields", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_privacy", { action: "set" }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ── Channel tools ────────────────────────────────────────────────────────────

describe("Channel tools", () => {
  test("create_channel", async () => {
    const ctx = mockCtx();
    const result = await callTool("create_channel", { name: "MyCh" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("created");
  });

  test("get_channel_info by JID", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_channel_info", { jid: "ch@newsletter" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(ctx.sock.newsletterMetadata).toHaveBeenCalledWith("jid", "ch@newsletter");
  });

  test("get_channel_info by URL", async () => {
    const ctx = mockCtx();
    await callTool("get_channel_info", { jid: "https://whatsapp.com/channel/ABC123" }, ctx);
    expect(ctx.sock.newsletterMetadata).toHaveBeenCalledWith("invite", "ABC123");
  });

  test("manage_channel follow", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_channel", { jid: "ch@newsletter", action: "follow" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("followed");
  });

  test("manage_channel mute", async () => {
    const ctx = mockCtx();
    await callTool("manage_channel", { jid: "ch@newsletter", action: "mute" }, ctx);
    expect(ctx.sock.newsletterMute).toHaveBeenCalledWith("ch@newsletter");
  });

  test("update_channel name", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_channel", { jid: "ch@newsletter", name: "New" }, ctx);
    const data = parseResult(result);
    expect(data.updated).toContain("name");
  });

  test("update_channel no changes", async () => {
    const ctx = mockCtx();
    const result = await callTool("update_channel", { jid: "ch@newsletter" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("delete_channel", async () => {
    const ctx = mockCtx();
    const result = await callTool("delete_channel", { jid: "ch@newsletter" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("deleted");
    expect(ctx.sock.newsletterDelete).toHaveBeenCalledWith("ch@newsletter");
  });
});

// ── Label tools ──────────────────────────────────────────────────────────────

describe("Label tools", () => {
  test("manage_label list", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_label", { action: "list" }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.labels[0].name).toBe("Urgent");
  });

  test("manage_label create", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_label", { action: "create", name: "New" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("created");
  });

  test("manage_label delete", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_label", { action: "delete", label_id: "1" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("deleted");
  });

  test("manage_chat_label add", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_chat_label", {
      action: "add",
      jid: "33612345678",
      label_id: "1",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("label_added");
    expect(ctx.sock.addChatLabel).toHaveBeenCalled();
  });

  test("manage_message_label add", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_message_label", {
      action: "add",
      jid: "33612345678",
      message_id: "m1",
      label_id: "1",
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("label_added");
  });
});

// ── Utility tools ────────────────────────────────────────────────────────────

describe("Utility tools", () => {
  test("connection_status", async () => {
    const ctx = mockCtx();
    const result = await callTool("connection_status", {}, ctx);
    const data = parseResult(result);
    expect(data.state).toBe("open");
    expect(data.user.name).toBe("TestUser");
  });

  test("whatsapp_guide overview", async () => {
    const ctx = mockCtx();
    const result = await callTool("whatsapp_guide", {}, ctx);
    const data = parseResult(result);
    expect(data.server).toBe("whats-mcp");
    expect(data.total_tools).toBe(64);
    expect(data.categories).toBeDefined();
    expect(data.categories.channels).toContain("delete_channel");
    expect(data.categories.labels).toContain("manage_chat_label");
    expect(data.categories.analytics).toContain("analytics_overview");
    expect(data.categories.utilities).toContain("send_presence");
  });

  test("whatsapp_guide category", async () => {
    const ctx = mockCtx();
    const result = await callTool("whatsapp_guide", { category: "messaging" }, ctx);
    const data = parseResult(result);
    expect(data.category).toBe("messaging");
    expect(data.tools.length).toBeGreaterThan(0);
  });

  test("send_presence available", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_presence", { type: "available" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("available");
    expect(ctx.sock.sendPresenceUpdate).toHaveBeenCalledWith("available");
  });

  test("send_presence composing requires jid", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_presence", { type: "composing" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("send_presence composing with jid", async () => {
    const ctx = mockCtx();
    const result = await callTool("send_presence", { type: "composing", jid: "33612345678" }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("composing");
    expect(ctx.sock.sendPresenceUpdate).toHaveBeenCalledWith("composing", "33612345678@s.whatsapp.net");
  });

  test("read_messages", async () => {
    const ctx = mockCtx();
    const result = await callTool("read_messages", {
      jid: "33612345678",
      message_ids: ["m1", "m2"],
    }, ctx);
    const data = parseResult(result);
    expect(data.status).toBe("read");
    expect(data.count).toBe(2);
    expect(ctx.sock.readMessages).toHaveBeenCalled();
  });

  test("search_messages", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "Hello world" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, message: { conversation: "Goodbye" } },
    ]);
    const result = await callTool("search_messages", { query: "hello" }, ctx);
    const data = parseResult(result);
    expect(data.count).toBe(1);
    expect(data.messages[0].text).toBe("Hello world");
  });

  test("analytics_overview", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1", fromMe: false }, messageTimestamp: 1710000000, message: { conversation: "Alpha sprint planning" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2", fromMe: true }, messageTimestamp: 1710000100, message: { conversation: "Sprint alpha notes" } },
    ]);
    const result = await callTool("analytics_overview", { top_tokens: 5 }, ctx);
    const data = parseResult(result);
    expect(data.totals.messages).toBe(2);
    expect(data.top_tokens.some((entry) => entry.token === "alpha")).toBe(true);
  });

  test("analytics_top_chats", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 1710000000, message: { conversation: "One" } },
      { key: { remoteJid: "b@s.whatsapp.net", id: "m2" }, messageTimestamp: 1710000100, message: { conversation: "Two" } },
      { key: { remoteJid: "b@s.whatsapp.net", id: "m3" }, messageTimestamp: 1710000200, message: { conversation: "Three" } },
    ]);
    const result = await callTool("analytics_top_chats", { limit: 2 }, ctx);
    const data = parseResult(result);
    expect(data.chats[0].jid).toBe("b@s.whatsapp.net");
  });

  test("analytics_chat_insights", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1", fromMe: false }, messageTimestamp: 1710000000, message: { conversation: "Deep work alpha" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2", fromMe: true }, messageTimestamp: 1710000200, message: { conversation: "Alpha review" } },
    ]);
    const result = await callTool("analytics_chat_insights", { jid: "a@s.whatsapp.net" }, ctx);
    const data = parseResult(result);
    expect(data.jid).toBe("a@s.whatsapp.net");
    expect(data.message_count).toBe(2);
  });

  test("analytics_timeline", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 1710000000, message: { conversation: "Alpha" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 1710086400, message: { conversation: "Beta" } },
    ]);
    const result = await callTool("analytics_timeline", { jid: "a@s.whatsapp.net", days: 10 }, ctx);
    const data = parseResult(result);
    expect(data.total_messages).toBe(2);
    expect(data.buckets.length).toBe(2);
  });

  test("analytics_search", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 1710000000, message: { conversation: "Alpha roadmap" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 1710000200, message: { conversation: "Beta roadmap" } },
    ]);
    const result = await callTool("analytics_search", { query: "alpha roadmap", limit: 5 }, ctx);
    const data = parseResult(result);
    expect(data.count).toBeGreaterThan(0);
    expect(data.messages[0].matched_terms).toContain("alpha");
  });
});

// ── Digest tools ─────────────────────────────────────────────────────────────

describe("Digest tools", () => {
  test("get_messages_multi with explicit jids", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 1710000000, message: { conversation: "Alpha" } },
      { key: { remoteJid: "b@s.whatsapp.net", id: "m2" }, messageTimestamp: 1710000100, message: { conversation: "Beta" } },
    ]);
    const result = await callTool("get_messages_multi", {
      jids: ["a@s.whatsapp.net", "b@s.whatsapp.net"],
      limit_per_chat: 10,
    }, ctx);
    const data = parseResult(result);
    expect(data.total_chats).toBe(2);
    expect(data.total_messages).toBe(2);
    expect(data.chats[0].jid).toBe("a@s.whatsapp.net");
  });

  test("get_messages_multi with watchlist", async () => {
    const ctx = mockCtx();
    ctx.store.upsertMessages([
      { key: { remoteJid: "120363test@g.us", id: "m1" }, messageTimestamp: 1710000000, message: { conversation: "Group msg" } },
    ]);
    const result = await callTool("get_messages_multi", { watchlist: "test_group" }, ctx);
    const data = parseResult(result);
    expect(data.total_chats).toBe(1);
    expect(data.chats[0].jid).toBe("120363test@g.us");
  });

  test("get_messages_multi unknown watchlist", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_messages_multi", { watchlist: "nonexistent" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("get_messages_multi no jids or watchlist", async () => {
    const ctx = mockCtx();
    const result = await callTool("get_messages_multi", {}, ctx);
    expect(result.isError).toBe(true);
  });

  test("daily_digest defaults to 24h", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1", fromMe: false }, messageTimestamp: now - 3600, message: { conversation: "Recent" } },
      { key: { remoteJid: "a@s.whatsapp.net", id: "m2", fromMe: true }, messageTimestamp: now - 1800, message: { conversation: "My reply" } },
    ]);
    const result = await callTool("daily_digest", { jids: ["a@s.whatsapp.net"] }, ctx);
    const data = parseResult(result);
    expect(data.period).toBeDefined();
    expect(data.summary.total_chats).toBe(1);
    expect(data.summary.total_messages).toBe(2);
    expect(data.summary.total_from_me).toBe(1);
    expect(data.summary.total_from_others).toBe(1);
    expect(data.chats[0].active_participants).toBeGreaterThanOrEqual(0);
  });

  test("daily_digest excludes empty chats", async () => {
    const ctx = mockCtx();
    // Messages outside the time range
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 1000, message: { conversation: "Old" } },
    ]);
    const result = await callTool("daily_digest", {
      jids: ["a@s.whatsapp.net"],
      since: Math.floor(Date.now() / 1000) - 3600,
    }, ctx);
    const data = parseResult(result);
    expect(data.summary.total_chats).toBe(0);
    expect(data.chats.length).toBe(0);
  });

  test("daily_digest with watchlist", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      { key: { remoteJid: "120363test@g.us", id: "m1" }, messageTimestamp: now - 100, message: { conversation: "Watchlist msg" } },
    ]);
    const result = await callTool("daily_digest", { watchlist: "test_group" }, ctx);
    const data = parseResult(result);
    expect(data.summary.total_messages).toBe(1);
  });
});

// ── Contact tags tools ───────────────────────────────────────────────────────

describe("Contact tags tools", () => {
  test("manage_contact_tags set", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_contact_tags", {
      action: "set",
      jid: "33612345678",
      tags: ["famille", "important"],
    }, ctx);
    const data = parseResult(result);
    expect(data.jid).toBe("33612345678@s.whatsapp.net");
    expect(data.tags).toContain("famille");
    expect(data.tags).toContain("important");
  });

  test("manage_contact_tags add", async () => {
    const ctx = mockCtx();
    ctx.store.setContactTags("33612345678@s.whatsapp.net", ["famille"]);
    const result = await callTool("manage_contact_tags", {
      action: "add",
      jid: "33612345678",
      tags: ["vip"],
    }, ctx);
    const data = parseResult(result);
    expect(data.tags).toContain("famille");
    expect(data.tags).toContain("vip");
  });

  test("manage_contact_tags remove", async () => {
    const ctx = mockCtx();
    ctx.store.setContactTags("33612345678@s.whatsapp.net", ["famille", "vip"]);
    const result = await callTool("manage_contact_tags", {
      action: "remove",
      jid: "33612345678",
      tags: ["vip"],
    }, ctx);
    const data = parseResult(result);
    expect(data.tags).toEqual(["famille"]);
  });

  test("manage_contact_tags get", async () => {
    const ctx = mockCtx();
    ctx.store.setContactTags("33612345678@s.whatsapp.net", ["friend"]);
    ctx.store.upsertContacts([{ id: "33612345678@s.whatsapp.net", name: "Alice" }]);
    const result = await callTool("manage_contact_tags", {
      action: "get",
      jid: "33612345678",
    }, ctx);
    const data = parseResult(result);
    expect(data.name).toBe("Alice");
    expect(data.tags).toEqual(["friend"]);
  });

  test("manage_contact_tags list", async () => {
    const ctx = mockCtx();
    ctx.store.setContactTags("a@s.whatsapp.net", ["famille", "vip"]);
    ctx.store.setContactTags("b@s.whatsapp.net", ["famille"]);
    const result = await callTool("manage_contact_tags", { action: "list" }, ctx);
    const data = parseResult(result);
    expect(data.tags).toContain("famille");
    expect(data.tags).toContain("vip");
    expect(data.counts.famille).toBe(2);
    expect(data.counts.vip).toBe(1);
  });

  test("manage_contact_tags list_by_tag", async () => {
    const ctx = mockCtx();
    ctx.store.setContactTags("a@s.whatsapp.net", ["famille"]);
    ctx.store.setContactTags("b@s.whatsapp.net", ["famille"]);
    const result = await callTool("manage_contact_tags", { action: "list_by_tag", tag: "famille" }, ctx);
    const data = parseResult(result);
    expect(data.tag).toBe("famille");
    expect(data.count).toBe(2);
  });

  test("manage_contact_tags unknown action", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_contact_tags", { action: "invalid" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("manage_contact_tags set without jid", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_contact_tags", { action: "set", tags: ["x"] }, ctx);
    expect(result.isError).toBe(true);
  });
});

// ── List contacts tool ───────────────────────────────────────────────────────

describe("List contacts tool", () => {
  test("list_contacts basic", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([
      { id: "a@s.whatsapp.net", name: "Alice" },
      { id: "b@s.whatsapp.net", notify: "Bob" },
    ]);
    const result = await callTool("list_contacts", {}, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(2);
    expect(data.contacts.length).toBe(2);
  });

  test("list_contacts filter by name", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([
      { id: "a@s.whatsapp.net", name: "Alice" },
      { id: "b@s.whatsapp.net", name: "Bob" },
    ]);
    const result = await callTool("list_contacts", { name: "ali" }, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(data.contacts[0].name).toBe("Alice");
  });

  test("list_contacts filter by tag", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([
      { id: "a@s.whatsapp.net", name: "Alice" },
      { id: "b@s.whatsapp.net", name: "Bob" },
    ]);
    ctx.store.setContactTags("a@s.whatsapp.net", ["famille"]);
    const result = await callTool("list_contacts", { tag: "famille" }, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(data.contacts[0].tags).toContain("famille");
  });

  test("list_contacts excludes groups by default", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([
      { id: "a@s.whatsapp.net", name: "Alice" },
      { id: "group@g.us", name: "Group" },
    ]);
    const result = await callTool("list_contacts", {}, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(1);
  });

  test("list_contacts has_tags filter", async () => {
    const ctx = mockCtx();
    ctx.store.upsertContacts([
      { id: "a@s.whatsapp.net", name: "Alice" },
      { id: "b@s.whatsapp.net", name: "Bob" },
    ]);
    ctx.store.setContactTags("a@s.whatsapp.net", ["vip"]);
    const result = await callTool("list_contacts", { has_tags: true }, ctx);
    const data = parseResult(result);
    expect(data.total).toBe(1);
    expect(data.contacts[0].name).toBe("Alice");
  });
});

// ── Watchlist tools ─────────────────────────────────────────────────────────

describe("Watchlist tools", () => {
  test("manage_watchlist list includes config watchlists", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_watchlist", { action: "list" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    // config has test_group, so at least 1 entry
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.watchlists)).toBe(true);
  });

  test("manage_watchlist set then get", async () => {
    const ctx = mockCtx();
    await callTool("manage_watchlist", { action: "set", name: "my_list", jids: ["120363111@g.us"] }, ctx);
    const result = await callTool("manage_watchlist", { action: "get", name: "my_list" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.name).toBe("my_list");
    expect(data.count).toBe(1);
    expect(Array.isArray(data.chats)).toBe(true);
  });

  test("manage_watchlist add appends JIDs", async () => {
    const ctx = mockCtx();
    ctx.store.setWatchlist("w1", ["a@g.us"]);
    const result = await callTool("manage_watchlist", { action: "add", name: "w1", jids: ["b@g.us"] }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.status).toBe("added");
    expect(data.total).toBe(2);
  });

  test("manage_watchlist remove reduces JIDs", async () => {
    const ctx = mockCtx();
    ctx.store.setWatchlist("w2", ["a@g.us", "b@g.us"]);
    const result = await callTool("manage_watchlist", { action: "remove", name: "w2", jids: ["a@g.us"] }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.status).toBe("removed");
    expect(data.remaining).toBe(1);
  });

  test("manage_watchlist delete existing", async () => {
    const ctx = mockCtx();
    ctx.store.setWatchlist("w3", ["x@g.us"]);
    const result = await callTool("manage_watchlist", { action: "delete", name: "w3" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.status).toBe("deleted");
    expect(ctx.store.getWatchlist("w3")).toBeNull();
  });

  test("manage_watchlist delete non-existent returns not_found", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_watchlist", { action: "delete", name: "nope" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.status).toBe("not_found");
  });

  test("manage_watchlist get non-existent returns error", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_watchlist", { action: "get", name: "missing" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("manage_watchlist set without jids returns error", async () => {
    const ctx = mockCtx();
    const result = await callTool("manage_watchlist", { action: "set", name: "x" }, ctx);
    expect(result.isError).toBe(true);
  });

  test("manage_watchlist set deduplicates JIDs", async () => {
    const ctx = mockCtx();
    await callTool("manage_watchlist", { action: "set", name: "dup", jids: ["a@g.us", "a@g.us", "b@g.us"] }, ctx);
    const wl = ctx.store.getWatchlist("dup");
    expect(wl.length).toBe(2);
  });

  test("manage_watchlist list shows source dynamic vs config", async () => {
    const ctx = mockCtx();
    ctx.store.setWatchlist("dynamic_one", ["x@g.us"]);
    const result = await callTool("manage_watchlist", { action: "list" }, ctx);
    const data = parseResult(result);
    const dynamic = data.watchlists.find((w) => w.name === "dynamic_one");
    const fromConfig = data.watchlists.find((w) => w.name === "test_group");
    expect(dynamic?.source).toBe("dynamic");
    expect(fromConfig?.source).toBe("config");
  });
});

// ── Overview tools ────────────────────────────────────────────────────────────

describe("Overview tools", () => {
  test("whatsup returns complete structure", async () => {
    const ctx = mockCtx();
    const result = await callTool("whatsup", {}, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.date).toBeDefined();
    expect(data.period).toBeDefined();
    expect(data.summary).toBeDefined();
    expect(Array.isArray(data.watchlist_chats)).toBe(true);
    expect(Array.isArray(data.other_chats)).toBe(true);
    expect(Array.isArray(data.needs_reply)).toBe(true);
  });

  test("whatsup includes today's messages in other_chats", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      {
        key: { remoteJid: "unknown@s.whatsapp.net", id: "m1" },
        messageTimestamp: now - 60,
        message: { conversation: "hello" },
      },
    ]);
    const result = await callTool("whatsup", {}, ctx);
    const data = parseResult(result);
    expect(data.summary.total_active_chats).toBeGreaterThanOrEqual(1);
  });

  test("whatsup classifies watchlist chat correctly", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    // test_group is already in config.watchlists = { test_group: ["120363test@g.us"] }
    // phoneToJid("120363test@g.us") === "120363test@g.us" (already a JID)
    ctx.store.upsertMessages([
      {
        key: { remoteJid: "120363test@g.us", id: "m1", fromMe: false },
        messageTimestamp: now - 30,
        message: { conversation: "group msg" },
        pushName: "Alice",
      },
    ]);
    const result = await callTool("whatsup", {}, ctx);
    const data = parseResult(result);
    expect(data.summary.watchlist_chats).toBeGreaterThanOrEqual(1);
  });

  test("whatsup detects needs_reply for incoming last message", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      {
        key: { remoteJid: "contact@s.whatsapp.net", id: "m1", fromMe: false },
        messageTimestamp: now - 30,
        message: { conversation: "are you there?" },
        pushName: "Bob",
      },
    ]);
    const result = await callTool("whatsup", {}, ctx);
    const data = parseResult(result);
    const entry = data.needs_reply.find((n) => n.jid === "contact@s.whatsapp.net");
    expect(entry).toBeDefined();
  });

  test("whatsup does NOT flag needs_reply when last message is from_me", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      {
        key: { remoteJid: "contact@s.whatsapp.net", id: "m1", fromMe: true },
        messageTimestamp: now - 30,
        message: { conversation: "I replied" },
      },
    ]);
    const result = await callTool("whatsup", {}, ctx);
    const data = parseResult(result);
    const entry = data.needs_reply.find((n) => n.jid === "contact@s.whatsapp.net");
    expect(entry).toBeUndefined();
  });

  test("whatsup summary counts are consistent", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.upsertMessages([
      { key: { remoteJid: "a@s.whatsapp.net", id: "x1" }, messageTimestamp: now - 10, message: { conversation: "hi" } },
      { key: { remoteJid: "b@s.whatsapp.net", id: "x2" }, messageTimestamp: now - 20, message: { conversation: "hey" } },
    ]);
    const result = await callTool("whatsup", {}, ctx);
    const data = parseResult(result);
    expect(data.summary.total_active_chats).toBe(data.summary.watchlist_chats + data.summary.other_chats);
  });

  test("find_messages returns structured result", async () => {
    const ctx = mockCtx();
    const result = await callTool("find_messages", { query: "stage" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.query).toBe("stage");
    expect(typeof data.total_messages).toBe("number");
    expect(typeof data.total_chats).toBe("number");
    expect(Array.isArray(data.chats)).toBe(true);
  });

  test("find_messages requires query", async () => {
    const ctx = mockCtx();
    const result = await callTool("find_messages", {}, ctx);
    expect(result.isError).toBe(true);
  });

  test("find_messages expands keywords for known topics", async () => {
    const ctx = mockCtx();
    const result = await callTool("find_messages", { query: "ia" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(Array.isArray(data.expanded_keywords)).toBe(true);
    expect(data.expanded_keywords.length).toBeGreaterThan(0);
  });

  test("find_messages unknown topic returns empty expanded_keywords", async () => {
    const ctx = mockCtx();
    const result = await callTool("find_messages", { query: "randomxyz123" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.expanded_keywords.length).toBe(0);
  });

  test("find_messages watchlist_only filters to watchlist chats", async () => {
    const ctx = mockCtx();
    const now = Math.floor(Date.now() / 1000);
    ctx.store.setWatchlist("wl", ["wl_group@g.us"]);
    ctx.store.upsertMessages([
      { key: { remoteJid: "wl_group@g.us", id: "w1" }, messageTimestamp: now - 10, message: { conversation: "stage offre" } },
      { key: { remoteJid: "other@s.whatsapp.net", id: "o1" }, messageTimestamp: now - 20, message: { conversation: "stage offre" } },
    ]);
    const result = await callTool("find_messages", { query: "stage", watchlist_only: true }, ctx);
    const data = parseResult(result);
    for (const chat of data.chats) {
      expect(chat.in_watchlist).toBe(true);
    }
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe("Error handling", () => {
  test("handler exception is caught", async () => {
    const ctx = mockCtx();
    ctx.sock.sendMessage.mockRejectedValue(new Error("Network failure"));
    const result = await callTool("send_text", { jid: "33612345678", text: "hi" }, ctx);
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toContain("Network failure");
  });

  test("handler exception with data", async () => {
    const ctx = mockCtx();
    const err = new Error("Bad request");
    err.data = { info: "details" };
    ctx.sock.sendMessage.mockRejectedValue(err);
    const result = await callTool("send_text", { jid: "33612345678", text: "hi" }, ctx);
    expect(result.isError).toBe(true);
    const parsed = parseResult(result);
    expect(parsed.error).toContain("details");
  });
});
