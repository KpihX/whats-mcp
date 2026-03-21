/**
 * Tests — helpers.js
 */

const {
  phoneToJid,
  groupJid,
  newsletterJid,
  jidToPhone,
  isGroupJid,
  isNewsletterJid,
  STATUS_BROADCAST,
  WhatsAppError,
  errResult,
  okResult,
  resolveMedia,
  parseMessageKey,
  formatMessage,
  formatChat,
} = require("../src/helpers");

const fs = require("fs");
const path = require("path");

// ── JID helpers ──────────────────────────────────────────────────────────────

describe("phoneToJid", () => {
  test("plain number", () => {
    expect(phoneToJid("33612345678")).toBe("33612345678@s.whatsapp.net");
  });
  test("number with +", () => {
    expect(phoneToJid("+33 6 12 34 56 78")).toBe("33612345678@s.whatsapp.net");
  });
  test("already a personal JID", () => {
    expect(phoneToJid("33612345678@s.whatsapp.net")).toBe("33612345678@s.whatsapp.net");
  });
  test("group JID passes through", () => {
    expect(phoneToJid("120363xxx@g.us")).toBe("120363xxx@g.us");
  });
  test("strips dashes and parens", () => {
    expect(phoneToJid("+1-(555)-000-1234")).toBe("15550001234@s.whatsapp.net");
  });
});

describe("groupJid", () => {
  test("appends @g.us", () => {
    expect(groupJid("12345")).toBe("12345@g.us");
  });
  test("already a group JID", () => {
    expect(groupJid("12345@g.us")).toBe("12345@g.us");
  });
});

describe("newsletterJid", () => {
  test("appends @newsletter", () => {
    expect(newsletterJid("120363xxx")).toBe("120363xxx@newsletter");
  });
  test("already a newsletter JID", () => {
    expect(newsletterJid("120363xxx@newsletter")).toBe("120363xxx@newsletter");
  });
});

describe("jidToPhone", () => {
  test("extracts number from personal JID", () => {
    expect(jidToPhone("33612345678@s.whatsapp.net")).toBe("33612345678");
  });
  test("extracts number from JID with device id", () => {
    expect(jidToPhone("33612345678:0@s.whatsapp.net")).toBe("33612345678");
  });
  test("handles null", () => {
    expect(jidToPhone(null)).toBe("");
  });
});

describe("isGroupJid", () => {
  test("group JID", () => expect(isGroupJid("120363xxx@g.us")).toBe(true));
  test("personal JID", () => expect(isGroupJid("336@s.whatsapp.net")).toBe(false));
  test("null", () => expect(isGroupJid(null)).toBe(false));
});

describe("isNewsletterJid", () => {
  test("newsletter JID", () => expect(isNewsletterJid("120363xxx@newsletter")).toBe(true));
  test("personal JID", () => expect(isNewsletterJid("336@s.whatsapp.net")).toBe(false));
});

describe("STATUS_BROADCAST", () => {
  test("value", () => expect(STATUS_BROADCAST).toBe("status@broadcast"));
});

// ── Error helpers ────────────────────────────────────────────────────────────

describe("WhatsAppError", () => {
  test("basic error", () => {
    const err = new WhatsAppError("test", "CODE");
    expect(err.message).toBe("test");
    expect(err.code).toBe("CODE");
    expect(err.name).toBe("WhatsAppError");
  });
  test("default code", () => {
    const err = new WhatsAppError("msg");
    expect(err.code).toBe("WA_ERROR");
  });
});

describe("errResult", () => {
  test("returns isError true", () => {
    const r = errResult("bad");
    expect(r.isError).toBe(true);
    expect(r.content[0].type).toBe("text");
    expect(r.content[0].text).toContain("bad");
  });
});

describe("okResult", () => {
  test("returns object as JSON text", () => {
    const r = okResult({ foo: 1 });
    expect(r.isError).toBeUndefined();
    expect(JSON.parse(r.content[0].text)).toEqual({ foo: 1 });
  });
  test("returns string directly", () => {
    const r = okResult("hello");
    expect(r.content[0].text).toBe("hello");
  });
});

// ── Media helpers ────────────────────────────────────────────────────────────

describe("resolveMedia", () => {
  test("throws on empty", () => {
    expect(() => resolveMedia(null)).toThrow("Media source is required");
  });
  test("URL returns {url}", () => {
    const r = resolveMedia("https://example.com/img.png");
    expect(r).toEqual({ url: "https://example.com/img.png" });
  });
  test("data: URI returns Buffer", () => {
    const b64 = Buffer.from("hello").toString("base64");
    const r = resolveMedia(`data:text/plain;base64,${b64}`);
    expect(Buffer.isBuffer(r)).toBe(true);
    expect(r.toString()).toBe("hello");
  });
  test("raw base64 returns Buffer", () => {
    const b64 = Buffer.from("a".repeat(100)).toString("base64");
    const r = resolveMedia(b64);
    expect(Buffer.isBuffer(r)).toBe(true);
  });
  test("local file reads from fs", () => {
    // Create a temp file
    const tmp = path.join(__dirname, "__test_media__.txt");
    fs.writeFileSync(tmp, "media-content");
    try {
      const r = resolveMedia(tmp);
      expect(Buffer.isBuffer(r)).toBe(true);
      expect(r.toString()).toBe("media-content");
    } finally {
      fs.unlinkSync(tmp);
    }
  });
  test("file:// protocol", () => {
    const tmp = path.join(__dirname, "__test_media2__.txt");
    fs.writeFileSync(tmp, "file-proto");
    try {
      const r = resolveMedia(`file://${tmp}`);
      expect(r.toString()).toBe("file-proto");
    } finally {
      fs.unlinkSync(tmp);
    }
  });
  test("unknown source throws", () => {
    expect(() => resolveMedia("/nonexistent/path/xyz")).toThrow("Cannot resolve media source");
  });
});

// ── parseMessageKey ──────────────────────────────────────────────────────────

describe("parseMessageKey", () => {
  test("from args fields", () => {
    const key = parseMessageKey({ remote_jid: "jid@s.whatsapp.net", id: "ABC" });
    expect(key.remoteJid).toBe("jid@s.whatsapp.net");
    expect(key.id).toBe("ABC");
    expect(key.fromMe).toBe(false);
  });
  test("from key object", () => {
    const orig = { remoteJid: "x", id: "y" };
    expect(parseMessageKey({ key: orig })).toBe(orig);
  });
  test("throws on missing fields", () => {
    expect(() => parseMessageKey({})).toThrow();
  });
});

// ── formatMessage ────────────────────────────────────────────────────────────

describe("formatMessage", () => {
  test("null returns null", () => {
    expect(formatMessage(null)).toBeNull();
  });
  test("text conversation", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m1", fromMe: true },
      messageTimestamp: 1700000000,
      message: { conversation: "Hello" },
      pushName: "Alice",
    };
    const r = formatMessage(msg);
    expect(r.type).toBe("text");
    expect(r.text).toBe("Hello");
    expect(r.from_me).toBe(true);
    expect(r.push_name).toBe("Alice");
    expect(r.timestamp).toBe(1700000000);
  });
  test("image message", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m2" },
      message: { imageMessage: { caption: "photo" } },
    };
    expect(formatMessage(msg).type).toBe("image");
    expect(formatMessage(msg).text).toBe("photo");
  });
  test("video message", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m3" },
      message: { videoMessage: {} },
    };
    expect(formatMessage(msg).type).toBe("video");
    expect(formatMessage(msg).text).toBe("[video]");
  });
  test("audio voice note", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m4" },
      message: { audioMessage: { ptt: true } },
    };
    expect(formatMessage(msg).type).toBe("voice_note");
  });
  test("document", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m5" },
      message: { documentMessage: { fileName: "report.pdf" } },
    };
    expect(formatMessage(msg).type).toBe("document");
    expect(formatMessage(msg).text).toBe("report.pdf");
  });
  test("location", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m6" },
      message: { locationMessage: { degreesLatitude: 48.85, degreesLongitude: 2.35 } },
    };
    expect(formatMessage(msg).type).toBe("location");
    expect(formatMessage(msg).text).toContain("48.85");
  });
  test("reaction", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m7" },
      message: { reactionMessage: { text: "👍" } },
    };
    expect(formatMessage(msg).type).toBe("reaction");
    expect(formatMessage(msg).text).toBe("👍");
  });
  test("poll", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m8" },
      message: { pollCreationMessage: { name: "Lunch?" } },
    };
    expect(formatMessage(msg).type).toBe("poll");
    expect(formatMessage(msg).text).toBe("Lunch?");
  });
  test("deleted message", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m9" },
      message: { protocolMessage: { type: 0 } },
    };
    expect(formatMessage(msg).type).toBe("deleted");
  });
  test("unknown type fallback", () => {
    const msg = {
      key: { remoteJid: "jid", id: "m10" },
      message: { fooBarMessage: {} },
    };
    expect(formatMessage(msg).type).toBe("fooBar");
  });
});

// ── formatChat ───────────────────────────────────────────────────────────────

describe("formatChat", () => {
  test("formats a chat", () => {
    const chat = {
      id: "33612345678@s.whatsapp.net",
      name: "Alice",
      unreadCount: 3,
      archived: true,
      pinned: 1,
      mute: 999,
      conversationTimestamp: 1700000000,
    };
    const r = formatChat(chat);
    expect(r.jid).toBe("33612345678@s.whatsapp.net");
    expect(r.name).toBe("Alice");
    expect(r.unread_count).toBe(3);
    expect(r.is_group).toBe(false);
    expect(r.archived).toBe(true);
    expect(r.pinned).toBe(true);
    expect(r.muted).toBe(true);
    expect(r.timestamp).toBe(1700000000);
  });
  test("group chat", () => {
    const chat = { id: "120363xxx@g.us", subject: "My Group" };
    const r = formatChat(chat);
    expect(r.is_group).toBe(true);
    expect(r.name).toBe("My Group");
  });
});
