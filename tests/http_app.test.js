jest.mock("../src/connection", () => ({
  connect: jest.fn().mockResolvedValue(undefined),
  getConnectionInfo: jest.fn(() => ({
    state: "open",
    user: { id: "33600000000:0@s.whatsapp.net", name: "TestUser", phone: "33600000000" },
    store_stats: { chats: 2, contacts: 3, messages: 10 },
    reconnect_attempts: 0,
  })),
  requestReconnect: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/admin/service", () => ({
  adminHelpText: jest.fn(() => "help-text"),
  appendAdminLog: jest.fn(),
  authSummary: jest.fn(() => ({
    state_directory: "/tmp/whatsapp",
    auth_directory: "/tmp/whatsapp/auth",
    auth_present: false,
    pid: 4242,
    running: true,
    connection: { state: "open" },
  })),
  healthSummaryText: jest.fn(() => "health-summary"),
  pairingRuntimeStatus: jest.fn(() => ({ active: false, phone: null })),
  requestPairingCode: jest.fn(async (phone) => ({ phone: "33600000000", code: "PAIR1234" })),
  statusSummaryText: jest.fn(() => "whats-admin status"),
  urlsSummary: jest.fn(() => "urls-summary"),
}));

const { loadConfig } = require("../src/config");
const {
  adminHelpHandler,
  adminPairCodeHandler,
  adminReconnectHandler,
  adminStatusHandler,
  healthHandler,
} = require("../src/http_app");

  function mockResponse() {
  return {
    statusCode: null,
    payload: null,
      json(body) {
        this.statusCode = 200;
        this.payload = body;
        return body;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
    };
  }

describe("HTTP admin surface", () => {
  test("health exposes transport and auth persistence probe", async () => {
    const cfg = loadConfig();
    const res = mockResponse();
    await healthHandler(cfg)({}, res);
    expect(res.statusCode).toBe(200);
    expect(res.payload.product).toBe("whats-mcp");
    expect(res.payload.transport).toBe("streamable-http");
    expect(res.payload.auth.auth_persisted).toBe(false);
    expect(res.payload.auth.connection_state).toBe("open");
  });

  test("admin status exposes shared operator summary", async () => {
    const cfg = loadConfig();
    const res = mockResponse();
    await adminStatusHandler(cfg)({}, res);
    expect(res.statusCode).toBe(200);
      expect(res.payload.admin.ssh_admin.supported).toBe(true);
      expect(res.payload.admin.telegram_admin.token_env).toBe("TELEGRAM_WHATS_HOMELAB_TOKEN");
      expect(res.payload.admin.status_summary).toBe("whats-admin status");
      expect(res.payload.admin.pairing_runtime.active).toBe(false);
    });

  test("admin help exposes shared capability summary", async () => {
    const cfg = loadConfig();
    const res = mockResponse();
    await adminHelpHandler(cfg)({}, res);
    expect(res.statusCode).toBe(200);
      expect(res.payload.help.text).toBe("help-text");
      expect(res.payload.help.routes.admin_help).toBe("/admin/help");
    });

    test("admin reconnect triggers live reconnect requests", async () => {
      const res = mockResponse();
      const handlers = { onReconnect: jest.fn().mockResolvedValue(undefined) };
      await adminReconnectHandler(handlers)({}, res);
      expect(res.statusCode).toBe(200);
      expect(res.payload.action).toBe("reconnect");
      expect(res.payload.message).toBe("whats-mcp reconnect requested");
      expect(handlers.onReconnect).toHaveBeenCalledTimes(1);
    });

    test("admin pair-code returns a generated pairing code", async () => {
      const res = mockResponse();
      await adminPairCodeHandler()({ body: { phone: "+33600000000" } }, res);
      expect(res.statusCode).toBe(200);
      expect(res.payload.action).toBe("pair-code");
      expect(res.payload.code).toBe("PAIR1234");
    });
  });
