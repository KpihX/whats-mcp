"use strict";

jest.mock("../src/connection", () => ({
  connect: jest.fn(),
  requestReconnect: jest.fn(),
}));

jest.mock("../src/http_app", () => ({
  createHttpApp: jest.fn(),
  bootstrapHttpRuntime: jest.fn(),
}));

jest.mock("../src/server", () => ({
  createLogger: jest.fn(),
  createMcpServer: jest.fn(),
}));

describe("main entrypoint", () => {
  test("can be required without executing the CLI", () => {
    const mainModule = require("../src/main");
    expect(typeof mainModule.main).toBe("function");
    expect(typeof mainModule.serveStdio).toBe("function");
    expect(typeof mainModule.serveHttp).toBe("function");
  });
});
