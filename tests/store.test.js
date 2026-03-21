/**
 * Tests — store.js
 */

const Store = require("../src/store");

describe("Store", () => {
  let store;
  let onChange;

  beforeEach(() => {
    onChange = jest.fn();
    store = new Store({ max_messages_per_chat: 5, max_chats: 3, onChange });
  });

  // ── Chat operations ────────────────────────────────────────────────────

  describe("chats", () => {
    test("upsertChats adds new chats", () => {
      store.upsertChats([
        { id: "a@s.whatsapp.net", name: "Alice", conversationTimestamp: 100 },
        { id: "b@s.whatsapp.net", name: "Bob", conversationTimestamp: 200 },
      ]);
      expect(store.chats.size).toBe(2);
      expect(store.getChat("a@s.whatsapp.net").name).toBe("Alice");
      expect(onChange).toHaveBeenCalled();
    });

    test("upsertChats merges into existing", () => {
      store.upsertChats([{ id: "a@s.whatsapp.net", name: "Alice" }]);
      store.upsertChats([{ id: "a@s.whatsapp.net", unreadCount: 5 }]);
      const chat = store.getChat("a@s.whatsapp.net");
      expect(chat.name).toBe("Alice");
      expect(chat.unreadCount).toBe(5);
    });

    test("updateChats updates existing", () => {
      store.upsertChats([{ id: "a@s.whatsapp.net", name: "Alice" }]);
      store.updateChats([{ id: "a@s.whatsapp.net", name: "Alicia" }]);
      expect(store.getChat("a@s.whatsapp.net").name).toBe("Alicia");
    });

    test("updateChats ignores non-existing", () => {
      store.updateChats([{ id: "x@s.whatsapp.net", name: "X" }]);
      expect(store.getChat("x@s.whatsapp.net")).toBeNull();
    });

    test("deleteChats removes chats and their messages", () => {
      store.upsertChats([{ id: "a@s.whatsapp.net" }]);
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "hi" } },
      ]);
      store.deleteChats(["a@s.whatsapp.net"]);
      expect(store.getChat("a@s.whatsapp.net")).toBeNull();
      expect(store.getMessages("a@s.whatsapp.net", 10).length).toBe(0);
    });

    test("listChats returns sorted by timestamp desc", () => {
      store.upsertChats([
        { id: "a@s.whatsapp.net", conversationTimestamp: 100 },
        { id: "b@s.whatsapp.net", conversationTimestamp: 300 },
        { id: "c@s.whatsapp.net", conversationTimestamp: 200 },
      ]);
      const list = store.listChats(10);
      expect(list.map((c) => c.id)).toEqual([
        "b@s.whatsapp.net",
        "c@s.whatsapp.net",
        "a@s.whatsapp.net",
      ]);
    });

    test("trim chats beyond max_chats", () => {
      store.upsertChats([
        { id: "a@s.whatsapp.net", conversationTimestamp: 100 },
        { id: "b@s.whatsapp.net", conversationTimestamp: 200 },
        { id: "c@s.whatsapp.net", conversationTimestamp: 300 },
        { id: "d@s.whatsapp.net", conversationTimestamp: 400 },
      ]);
      // max_chats = 3, oldest (a) should be trimmed
      expect(store.chats.size).toBe(3);
      expect(store.getChat("a@s.whatsapp.net")).toBeNull();
    });

    test("getChat returns null for unknown", () => {
      expect(store.getChat("unknown")).toBeNull();
    });
  });

  // ── Contact operations ─────────────────────────────────────────────────

  describe("contacts", () => {
    test("upsertContacts adds contacts", () => {
      store.upsertContacts([{ id: "a@s.whatsapp.net", name: "Alice" }]);
      expect(store.getContact("a@s.whatsapp.net").name).toBe("Alice");
    });

    test("upsertContacts merges", () => {
      store.upsertContacts([{ id: "a@s.whatsapp.net", name: "Alice" }]);
      store.upsertContacts([{ id: "a@s.whatsapp.net", notify: "Al" }]);
      const c = store.getContact("a@s.whatsapp.net");
      expect(c.name).toBe("Alice");
      expect(c.notify).toBe("Al");
    });

    test("updateContacts updates existing", () => {
      store.upsertContacts([{ id: "a@s.whatsapp.net", name: "Alice" }]);
      store.updateContacts([{ id: "a@s.whatsapp.net", name: "Alicia" }]);
      expect(store.getContact("a@s.whatsapp.net").name).toBe("Alicia");
    });

    test("getContact returns null for unknown", () => {
      expect(store.getContact("unknown")).toBeNull();
    });

    test("listContacts returns all", () => {
      store.upsertContacts([
        { id: "a@s.whatsapp.net" },
        { id: "b@s.whatsapp.net" },
      ]);
      expect(store.listContacts().length).toBe(2);
    });

    test("ignores contacts without id", () => {
      store.upsertContacts([{ name: "NoId" }]);
      expect(store.contacts.size).toBe(0);
    });
  });

  // ── Message operations ─────────────────────────────────────────────────

  describe("messages", () => {
    test("upsertMessages adds messages", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200 },
      ]);
      const msgs = store.getMessages("a@s.whatsapp.net", 10);
      expect(msgs.length).toBe(2);
      expect(store.getChat("a@s.whatsapp.net")).not.toBeNull();
      expect(store.getChat("a@s.whatsapp.net").conversationTimestamp).toBe(200);
    });

    test("dedup by message id", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "v1" } },
      ]);
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "v2" } },
      ]);
      const msgs = store.getMessages("a@s.whatsapp.net", 10);
      expect(msgs.length).toBe(1);
      expect(msgs[0].message.conversation).toBe("v2");
    });

    test("getMessage by id", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "hello" } },
      ]);
      const msg = store.getMessage("m1");
      expect(msg).not.toBeNull();
      expect(msg.message.conversation).toBe("hello");
    });

    test("getMessage returns null for unknown", () => {
      expect(store.getMessage("unknown")).toBeNull();
    });

    test("trim messages beyond max_messages_per_chat", () => {
      const msgs = [];
      for (let i = 0; i < 8; i++) {
        msgs.push({
          key: { remoteJid: "a@s.whatsapp.net", id: `m${i}` },
          messageTimestamp: i * 100,
        });
      }
      store.upsertMessages(msgs);
      // max_messages_per_chat = 5
      const arr = store.messages.get("a@s.whatsapp.net");
      expect(arr.length).toBe(5);
      // Oldest should be removed (m0, m1, m2)
      expect(arr[0].key.id).toBe("m3");
    });

    test("trim keeps newest messages even when older history arrives later", () => {
      store = new Store({ max_messages_per_chat: 2, max_chats: 3, onChange });
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m3" }, messageTimestamp: 300 },
      ]);

      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100 },
      ]);

      const arr = store.messages.get("a@s.whatsapp.net");
      expect(arr.map((msg) => msg.key.id)).toEqual(["m2", "m3"]);
    });

    test("deleteMessages removes", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" } },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" } },
      ]);
      store.deleteMessages([{ remoteJid: "a@s.whatsapp.net", id: "m1" }]);
      expect(store.getMessage("m1")).toBeNull();
      expect(store.getMessage("m2")).not.toBeNull();
    });

    test("getMessages with before_id pagination", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m3" }, messageTimestamp: 300 },
      ]);
      // Get messages before m3 (timestamp desc: m3, m2, m1 → before m3 = m2, m1)
      const msgs = store.getMessages("a@s.whatsapp.net", 10, "m3");
      expect(msgs.length).toBe(2);
      expect(msgs[0].key.id).toBe("m2");
    });

    test("getMessages with limit", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m3" }, messageTimestamp: 300 },
      ]);
      const msgs = store.getMessages("a@s.whatsapp.net", 2);
      expect(msgs.length).toBe(2);
      // Should be newest first
      expect(msgs[0].key.id).toBe("m3");
    });

    test("getMessages for unknown chat returns empty", () => {
      expect(store.getMessages("unknown", 10).length).toBe(0);
    });

    test("countMessages and getOldestMessage expose chat history boundaries", () => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, messageTimestamp: 100 },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, messageTimestamp: 200 },
      ]);

      expect(store.countMessages("a@s.whatsapp.net")).toBe(2);
      expect(store.getOldestMessage("a@s.whatsapp.net")?.key?.id).toBe("m1");
    });
  });

  // ── Search ─────────────────────────────────────────────────────────────

  describe("searchMessages", () => {
    beforeEach(() => {
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "Hello world" } },
        { key: { remoteJid: "a@s.whatsapp.net", id: "m2" }, message: { conversation: "Goodbye" } },
        { key: { remoteJid: "b@s.whatsapp.net", id: "m3" }, message: { conversation: "Hello there" } },
      ]);
    });

    test("search across all chats", () => {
      const results = store.searchMessages("hello", null, 10);
      expect(results.length).toBe(2);
    });

    test("search in specific chat", () => {
      const results = store.searchMessages("hello", "a@s.whatsapp.net", 10);
      expect(results.length).toBe(1);
    });

    test("search with limit", () => {
      const results = store.searchMessages("hello", null, 1);
      expect(results.length).toBe(1);
    });

    test("no results", () => {
      const results = store.searchMessages("xyz", null, 10);
      expect(results.length).toBe(0);
    });
  });

  describe("analytics", () => {
    beforeEach(() => {
      store.upsertChats([
        { id: "a@s.whatsapp.net", name: "Alice", conversationTimestamp: 1710000100 },
        { id: "g@g.us", name: "Group", conversationTimestamp: 1710000200 },
      ]);
      store.upsertMessages([
        {
          key: { remoteJid: "a@s.whatsapp.net", id: "m1", fromMe: false },
          pushName: "Alice",
          messageTimestamp: 1710000000,
          message: { conversation: "Project alpha kickoff tomorrow" },
        },
        {
          key: { remoteJid: "a@s.whatsapp.net", id: "m2", fromMe: true },
          messageTimestamp: 1710000100,
          message: { conversation: "Alpha roadmap shared" },
        },
        {
          key: { remoteJid: "g@g.us", id: "m3", participant: "bob@s.whatsapp.net", fromMe: false },
          pushName: "Bob",
          messageTimestamp: 1710000200,
          message: { conversation: "Weekly project sync at noon" },
        },
      ]);
    });

    test("getAnalyticsOverview aggregates chats, tokens, and senders", () => {
      const overview = store.getAnalyticsOverview({ top_chats: 2, top_tokens: 5, top_senders: 5, days: 7 });
      expect(overview.totals.messages).toBe(3);
      expect(overview.top_chats[0].jid).toBe("a@s.whatsapp.net");
      expect(overview.top_tokens.some((entry) => entry.token === "alpha")).toBe(true);
      expect(overview.top_senders.some((entry) => entry.jid === "me")).toBe(true);
    });

    test("analyticsSearch ranks indexed messages", () => {
      const results = store.analyticsSearch("alpha project", undefined, 10);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].matched_terms).toContain("alpha");
    });

    test("getChatAnalytics returns per-chat insights", () => {
      const chat = store.getChatAnalytics("a@s.whatsapp.net", { top_tokens: 5, top_senders: 5, recent_messages: 2 });
      expect(chat.jid).toBe("a@s.whatsapp.net");
      expect(chat.message_count).toBe(2);
      expect(chat.content_message_count).toBe(2);
      expect(chat.top_tokens.some((entry) => entry.token === "alpha")).toBe(true);
      expect(chat.recent_messages.length).toBe(2);
    });

    test("analytics ignores placeholder-only system texts", () => {
      store.upsertMessages([
        {
          key: { remoteJid: "a@s.whatsapp.net", id: "m4", fromMe: false },
          messageTimestamp: 1710000300,
          message: { protocolMessage: { type: "REVOKE" } },
        },
      ]);
      const overview = store.getAnalyticsOverview({ top_tokens: 10 });
      expect(overview.top_tokens.some((entry) => entry.token === "system")).toBe(false);
      expect(overview.top_tokens.some((entry) => entry.token === "alpha")).toBe(true);
    });

    test("listAnalyticsTopChats prioritizes content messages over protocol noise", () => {
      store.upsertMessages([
        {
          key: { remoteJid: "protocol@s.whatsapp.net", id: "m5", fromMe: false },
          messageTimestamp: 1710000400,
          message: { protocolMessage: { type: "REVOKE" } },
        },
        {
          key: { remoteJid: "protocol@s.whatsapp.net", id: "m6", fromMe: false },
          messageTimestamp: 1710000500,
          message: { protocolMessage: { type: "REVOKE" } },
        },
      ]);
      const ranked = store.listAnalyticsTopChats({ limit: 3, sort_by: "message_count" });
      expect(ranked[0].jid).toBe("a@s.whatsapp.net");
    });
  });

  // ── Group metadata cache ───────────────────────────────────────────────

  describe("groupMeta", () => {
    test("set and get", () => {
      store.setGroupMeta("g@g.us", {
        id: "g@g.us",
        subject: "Test",
        participants: [{ id: "p1@s.whatsapp.net", admin: "admin" }],
      });
      const meta = store.getGroupMeta("g@g.us");
      expect(meta.subject).toBe("Test");
      expect(store.getChat("g@g.us").name).toBe("Test");
      expect(store.getContact("p1@s.whatsapp.net").admin).toBe("admin");
    });

    test("returns null for unknown", () => {
      expect(store.getGroupMeta("x@g.us")).toBeNull();
    });
  });

  // ── History sync ───────────────────────────────────────────────────────

  describe("handleHistorySync", () => {
    test("processes chats, contacts, and messages", () => {
      store.handleHistorySync({
        chats: [{ id: "a@s.whatsapp.net", name: "A" }],
        contacts: [{ id: "c@s.whatsapp.net", name: "C" }],
        messages: [
          { message: { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "hi" } } },
        ],
      });
      expect(store.chats.size).toBe(1);
      expect(store.contacts.size).toBe(1);
      expect(store.getMessage("m1")).not.toBeNull();
    });

    test("handles null fields gracefully", () => {
      store.handleHistorySync({ chats: null, contacts: null, messages: null });
      expect(store.stats().chats).toBe(0);
    });
  });

  // ── Bind ───────────────────────────────────────────────────────────────

  describe("bind", () => {
    test("binds to socket events", () => {
      const handlers = {};
      const mockSock = {
        ev: {
          on: (event, handler) => { handlers[event] = handler; },
        },
      };
      store.bind(mockSock);
      expect(handlers["messaging-history.set"]).toBeDefined();
      expect(handlers["chats.upsert"]).toBeDefined();
      expect(handlers["chats.update"]).toBeDefined();
      expect(handlers["chats.delete"]).toBeDefined();
      expect(handlers["contacts.upsert"]).toBeDefined();
      expect(handlers["contacts.update"]).toBeDefined();
      expect(handlers["messages.upsert"]).toBeDefined();
      expect(handlers["messages.delete"]).toBeDefined();
      expect(handlers["groups.upsert"]).toBeDefined();
      expect(handlers["groups.update"]).toBeDefined();

      // Test the bound handlers work
      handlers["chats.upsert"]([{ id: "test@s.whatsapp.net" }]);
      expect(store.chats.size).toBe(1);

      handlers["messages.upsert"]({
        messages: [{ key: { remoteJid: "test@s.whatsapp.net", id: "m1" } }],
      });
      expect(store.getMessage("m1")).not.toBeNull();
    });
  });

  describe("snapshot", () => {
    test("saveSnapshot and loadSnapshot round-trip", () => {
      const snapshotPath = "/tmp/whats-store-test.json";
      store.upsertChats([{ id: "a@s.whatsapp.net", conversationTimestamp: 100 }]);
      store.upsertContacts([{ id: "c@s.whatsapp.net", name: "Carol" }]);
      store.upsertMessages([
        { key: { remoteJid: "a@s.whatsapp.net", id: "m1" }, message: { conversation: "hi" } },
      ]);
      store.setGroupMeta("g@g.us", { id: "g@g.us", subject: "Group" });

      store.saveSnapshot(snapshotPath);

      const restored = new Store({ max_messages_per_chat: 5, max_chats: 3 });
      expect(restored.loadSnapshot(snapshotPath)).toBe(true);
      expect(restored.getChat("a@s.whatsapp.net")).not.toBeNull();
      expect(restored.getContact("c@s.whatsapp.net").name).toBe("Carol");
      expect(restored.getMessage("m1").message.conversation).toBe("hi");
      expect(restored.getGroupMeta("g@g.us").subject).toBe("Group");

      require("fs").unlinkSync(snapshotPath);
    });
  });

  // ── Stats ──────────────────────────────────────────────────────────────

  describe("stats", () => {
    test("returns counts", () => {
      store.upsertChats([{ id: "a@s.whatsapp.net" }]);
      store.upsertContacts([{ id: "c@s.whatsapp.net" }]);
      store.upsertMessages([{ key: { remoteJid: "a@s.whatsapp.net", id: "m1" } }]);
      store.setGroupMeta("g@g.us", {});
      const s = store.stats();
      expect(s.chats).toBe(2);
      expect(s.contacts).toBe(1);
      expect(s.messages).toBe(1);
      expect(s.groups).toBe(1);
    });
  });
});
