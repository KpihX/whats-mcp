#!/usr/bin/env node
/**
 * whats-admin — CLI administration tool for whats-mcp.
 *
 * Manage WhatsApp authentication, server lifecycle, configuration, and logs.
 *
 * Usage:
 *   whats-admin status                Overview of server + auth state
 *   whats-admin guide                 Shared operator capability summary
 *   whats-admin login [--code]        Login via QR (default) or pairing code
 *   whats-admin logout [-f]           Clear WhatsApp session
 *   whats-admin auth <sub>            Manage auth state
 *   whats-admin server <sub>          Manage MCP server lifecycle
 *   whats-admin config <sub>          Manage configuration
 *   whats-admin logs <sub>            View/manage logs
 *   whats-admin info                  Show version & environment info
 */

"use strict";

const { Command } = require("commander");
const fs   = require("fs");
const path = require("path");
const os   = require("os");
const { spawn, execSync } = require("child_process");
const readline = require("readline");
const { adminHelpText } = require("./service");

// ── Paths ────────────────────────────────────────────────────────────────────

const PKG_ROOT   = path.resolve(__dirname, "../..");
const PKG_JSON   = require(path.join(PKG_ROOT, "package.json"));
const CONFIG_FILE = path.join(PKG_ROOT, "config.json");

function stateDir() {
  const { loadConfig } = require("../config");
  const cfg = loadConfig();
  return (cfg.server?.state_directory || "~/.mcps/whatsapp").replace(
    /^~/,
    os.homedir(),
  );
}

function authDir()  { return path.join(stateDir(), "auth"); }
function pidFile()  { return path.join(stateDir(), "whats-mcp.pid"); }
function logFile()  { return path.join(stateDir(), "whats-mcp.log"); }

// ── Colors (zero-dep ANSI) ───────────────────────────────────────────────────

const isColor = process.stdout.isTTY !== false;

const c = {
  green:   (s) => (isColor ? `\x1b[32m${s}\x1b[0m` : s),
  red:     (s) => (isColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow:  (s) => (isColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan:    (s) => (isColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold:    (s) => (isColor ? `\x1b[1m${s}\x1b[0m`  : s),
  dim:     (s) => (isColor ? `\x1b[2m${s}\x1b[0m`  : s),
  magenta: (s) => (isColor ? `\x1b[35m${s}\x1b[0m` : s),
};

const ok   = () => c.green("✓");
const fail = () => c.red("✗");
const warn = () => c.yellow("⚠");

// ── Helpers ──────────────────────────────────────────────────────────────────

function readPid() {
  try {
    return parseInt(fs.readFileSync(pidFile(), "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function authExists() {
  const dir = authDir();
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function confirm(question) {
  return prompt(`${question} [y/N] `).then(
    (a) => a.toLowerCase() === "y",
  );
}

/** Read auth creds.json and return the "me" field if present. */
function readCredsMe() {
  try {
    const credsFile = path.join(authDir(), "creds.json");
    const creds = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
    return creds.me || null;
  } catch {
    return null;
  }
}

/**
 * Shared Baileys socket creator for login flows.
 * Returns { sock, saveCreds, version }.
 */
async function _makeLoginSocket() {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    Browsers,
  } = require("@whiskeysockets/baileys");
  const pino = require("pino");

  const logger = pino({ level: "silent" });
  const { version } = await fetchLatestBaileysVersion();
  const ap = authDir();
  fs.mkdirSync(ap, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(ap);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu("Chrome"),
    logger,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    syncFullHistory: true,
  });

  sock.ev.on("creds.update", saveCreds);

  return { sock, saveCreds, version };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Program
// ═════════════════════════════════════════════════════════════════════════════

const program = new Command();
program
  .name("whats-admin")
  .description(
    "whats-mcp administration — manage WhatsApp auth, server, config & logs",
  )
  .version(PKG_JSON.version);

program
  .command("guide")
  .description("Show the shared operator capability summary")
  .action(() => {
    console.log(adminHelpText());
  });

// ── status ───────────────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show overview of server + WhatsApp auth state")
  .action(() => {
    console.log(c.bold("\n  whats-mcp Status\n"));

    // Server
    const pid    = readPid();
    const running = isRunning(pid);
    console.log(
      `  Server:  ${running ? ok() + c.green(` Running (PID ${pid})`) : fail() + c.dim(" Stopped")}`,
    );

    // Auth
    const hasAuth = authExists();
    const me = hasAuth ? readCredsMe() : null;
    console.log(
      `  Auth:    ${hasAuth ? ok() + c.green(" Paired") : fail() + c.dim(" Not paired")}`,
    );
    if (me) {
      console.log(
        `  Account: ${c.cyan(me.name || me.verifiedName || "?")} (${c.cyan(me.id?.split(":")[0] || "?")})`,
      );
    }

    // Config
    const hasConfig = fs.existsSync(CONFIG_FILE);
    console.log(
      `  Config:  ${hasConfig ? ok() + c.dim(" Custom config.json") : c.dim("  Defaults (no config.json)")}`,
    );

    // Hints
    if (!hasAuth) {
      console.log(
        `\n  ${warn()} Run ${c.bold("whats-admin login")} to pair WhatsApp.`,
      );
    }
    if (!running && hasAuth) {
      console.log(
        `\n  ${warn()} Server stopped. Your MCP client will start it automatically,`,
      );
      console.log(
        `     or configure it in your MCP client settings.`,
      );
    }
    console.log();
  });

// ── login ────────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Login to WhatsApp (interactive QR or pairing code)")
  .option("--code", "Use pairing code instead of QR (enter phone number)")
  .option(
    "--phone <number>",
    "Phone number for pairing code (with country code, e.g. 33612345678)",
  )
  .action(async (opts) => {
    if (authExists()) {
      const me = readCredsMe();
      const who = me ? ` (${me.name || "?"} / ${me.id?.split(":")[0] || "?"})` : "";
      const overwrite = await confirm(
        `  ${warn()} Auth credentials already exist${who}. Overwrite?`,
      );
      if (!overwrite) {
        console.log("  Aborted.");
        process.exit(0);
      }
      fs.rmSync(authDir(), { recursive: true, force: true });
      fs.mkdirSync(authDir(), { recursive: true });
    }

    console.log(c.bold("\n  WhatsApp Login\n"));

    if (opts.code) {
      let phone = opts.phone;
      if (!phone) {
        phone = await prompt(
          "  Phone number (with country code, e.g. 33612345678): ",
        );
      }
      if (!phone || !/^\d{8,15}$/.test(phone)) {
        console.error(
          c.red("  Invalid phone number. Use digits only with country code."),
        );
        process.exit(1);
      }
      console.log(`\n  ${c.dim("Connecting to WhatsApp...")}\n`);
      await _loginWithCode(phone);
    } else {
      console.log(
        `  ${c.dim("Connecting to WhatsApp... QR code will appear below.")}`,
      );
      console.log(
        `  ${c.dim("Open WhatsApp → Settings → Linked Devices → Link a Device")}\n`,
      );
      await _loginWithQR();
    }
  });

/**
 * QR-based login: reuse the connection module which handles QR display,
 * reconnects on 515, and writes creds.  We poll for "open" state.
 */
async function _loginWithQR() {
  const { connect, getConnectionInfo } = require("../connection");
  const { loadConfig } = require("../config");

  const maxWait = 120_000; // 2 minutes for user to scan QR
  const start = Date.now();

  connect(loadConfig()).catch((err) => {
    console.error(c.red(`\n  Connection error: ${err.message}`));
    process.exit(1);
  });

  return new Promise((resolve) => {
    const check = setInterval(() => {
      const info = getConnectionInfo();

      if (info.state === "open") {
        clearInterval(check);
        console.log(
          c.green(
            `\n  ${ok()} Connected as ${info.user?.name || "?"} (${info.user?.phone || "?"})`,
          ),
        );
        console.log(c.dim(`  Auth saved to ${authDir()}\n`));
        // Let creds flush to disk
        setTimeout(() => process.exit(0), 2000);
        resolve();
      }

      if (Date.now() - start > maxWait) {
        clearInterval(check);
        console.error(
          c.red("\n  Timeout: QR code was not scanned within 2 minutes."),
        );
        console.error(c.dim("  Run the command again to get a fresh QR.\n"));
        process.exit(1);
      }
    }, 1000);
  });
}

/**
 * Pairing-code login: create a socket specifically for this flow,
 * intercept the QR event to request a pairing code instead.
 */
async function _loginWithCode(phone) {
  const {
    DisconnectReason,
  } = require("@whiskeysockets/baileys");

  let attempt = 0;
  const maxAttempts = 3;

  async function tryLogin() {
    attempt++;
    const { sock } = await _makeLoginSocket();
    let codeRequested = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        sock.end(undefined);
        reject(new Error("Timeout waiting for connection (2 minutes)."));
      }, 120_000);

      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR event = socket is ready → request pairing code instead
        if (qr && !codeRequested) {
          codeRequested = true;
          try {
            const code = await sock.requestPairingCode(phone);
            console.log(
              `  ${c.bold("Pairing Code:")} ${c.green(c.bold(code))}`,
            );
            console.log();
            console.log(
              `  ${c.dim("Go to WhatsApp → Linked Devices → Link with Phone Number")}`,
            );
            console.log(
              `  ${c.dim("Enter this code on your phone.")}\n`,
            );
          } catch (err) {
            clearTimeout(timeout);
            reject(
              new Error(`Failed to get pairing code: ${err.message}`),
            );
          }
        }

        if (connection === "open") {
          clearTimeout(timeout);
          const user = sock.user;
          console.log(
            c.green(
              `  ${ok()} Connected as ${user?.name || "?"} (${user?.id?.split(":")[0] || "?"})`,
            ),
          );
          console.log(c.dim(`  Auth saved to ${authDir()}\n`));
          sock.end(undefined);
          setTimeout(() => resolve(), 2000);
        }

        if (connection === "close") {
          const code = lastDisconnect?.error?.output?.statusCode;

          // 515 = restartRequired — normal during first connect
          if (code === DisconnectReason.restartRequired && attempt < maxAttempts) {
            clearTimeout(timeout);
            console.log(c.dim(`  Restart required — reconnecting... (${attempt}/${maxAttempts})`));
            tryLogin().then(resolve).catch(reject);
            return;
          }

          // 401 / loggedOut — pairing failed
          if (code === DisconnectReason.loggedOut) {
            clearTimeout(timeout);
            reject(new Error("Pairing failed or session rejected."));
            return;
          }

          // 440 = connectionReplaced — another login took over
          if (code === DisconnectReason.connectionReplaced) {
            clearTimeout(timeout);
            reject(new Error("Connection replaced by another session."));
            return;
          }

          // Other transient errors during first login: just log and continue waiting
          if (code === DisconnectReason.timedOut || code === DisconnectReason.connectionClosed) {
            if (attempt < maxAttempts) {
              clearTimeout(timeout);
              console.log(c.dim(`  Disconnected (${code}) — retrying... (${attempt}/${maxAttempts})`));
              tryLogin().then(resolve).catch(reject);
            }
          }
        }
      });
    });
  }

  try {
    await tryLogin();
    process.exit(0);
  } catch (err) {
    console.error(c.red(`\n  ${fail()} ${err.message}\n`));
    process.exit(1);
  }
}

// ── logout ───────────────────────────────────────────────────────────────────

program
  .command("logout")
  .description("Log out WhatsApp session and clear credentials")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (opts) => {
    if (!authExists()) {
      console.log(`  ${c.dim("No auth credentials found. Nothing to do.")}`);
      process.exit(0);
    }

    const me = readCredsMe();
    const who = me ? ` (${me.name || "?"})` : "";

    if (!opts.force) {
      const yes = await confirm(
        `  ${warn()} This will delete your WhatsApp pairing${who}. Continue?`,
      );
      if (!yes) {
        console.log("  Aborted.");
        process.exit(0);
      }
    }

    // Try graceful logout (notify WhatsApp servers)
    console.log(c.dim("  Attempting graceful logout..."));
    try {
      const { sock } = await _makeLoginSocket();

      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          try { sock.end(undefined); } catch { /* ignore */ }
          resolve();
        }, 10_000);

        sock.ev.on("connection.update", async ({ connection }) => {
          if (connection === "open") {
            clearTimeout(timeout);
            try {
              await sock.logout();
              console.log(`  ${ok()} Logged out from WhatsApp servers.`);
            } catch {
              console.log(c.dim("  Could not notify WhatsApp servers (session may already be invalid)."));
            }
            resolve();
          }
        });
      });
    } catch {
      console.log(c.dim("  Graceful logout skipped (could not connect)."));
    }

    // Delete auth folder
    fs.rmSync(authDir(), { recursive: true, force: true });
    console.log(`  ${ok()} Auth credentials deleted.`);

    // Stop server if running
    const pid = readPid();
    if (isRunning(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`  ${ok()} MCP server stopped (PID ${pid}).`);
      } catch { /* ignore */ }
    }

    console.log();
    process.exit(0);
  });

// ═════════════════════════════════════════════════════════════════════════════
//  auth
// ═════════════════════════════════════════════════════════════════════════════

const authCmd = program
  .command("auth")
  .description("Manage WhatsApp authentication");

authCmd
  .command("status")
  .description("Show detailed auth credential status")
  .action(() => {
    const dir = authDir();
    const exists = authExists();

    console.log(c.bold("\n  Auth Status\n"));
    console.log(`  Path:      ${c.cyan(dir)}`);
    console.log(
      `  Paired:    ${exists ? ok() + c.green(" Yes") : fail() + c.red(" No")}`,
    );

    if (exists) {
      const files = fs.readdirSync(dir);
      console.log(`  Files:     ${c.dim(files.length + " credential files")}`);

      const me = readCredsMe();
      if (me) {
        console.log(`  Account:   ${c.green(me.name || me.verifiedName || "?")}`);
        console.log(`  Phone:     ${c.cyan(me.id?.split(":")[0] || "?")}`);
        console.log(`  JID:       ${c.dim(me.id || "?")}`);
      }

      // Show creds.json age
      try {
        const stat = fs.statSync(path.join(dir, "creds.json"));
        const age = Date.now() - stat.mtimeMs;
        const hours = Math.floor(age / 3_600_000);
        const days = Math.floor(hours / 24);
        const ageStr =
          days > 0
            ? `${days}d ${hours % 24}h ago`
            : hours > 0
              ? `${hours}h ago`
              : "just now";
        console.log(`  Last auth: ${c.dim(ageStr)}`);
      } catch { /* ignore */ }
    }
    console.log();
  });

authCmd
  .command("clean")
  .description("Delete auth credentials (force re-pair)")
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    if (!authExists()) {
      console.log(`  ${c.dim("No auth credentials found.")}`);
      return;
    }
    if (!opts.force) {
      const yes = await confirm(`  ${warn()} Delete auth credentials?`);
      if (!yes) {
        console.log("  Aborted.");
        return;
      }
    }
    fs.rmSync(authDir(), { recursive: true, force: true });
    console.log(`  ${ok()} Auth credentials deleted.`);
  });

authCmd
  .command("path")
  .description("Print auth folder path")
  .action(() => {
    console.log(authDir());
  });

// ═════════════════════════════════════════════════════════════════════════════
//  server
// ═════════════════════════════════════════════════════════════════════════════

const serverCmd = program
  .command("server")
  .description("Manage MCP server lifecycle");

serverCmd
  .command("status")
  .description("Check if MCP server is running")
  .action(() => {
    const pid = readPid();
    const running = isRunning(pid);
    if (running) {
      console.log(
        `  ${ok()} Server is ${c.green("running")} (PID ${pid}).`,
      );
    } else {
      console.log(`  ${fail()} Server is ${c.red("stopped")}.`);
      if (pid) {
        console.log(c.dim(`  (Stale PID file with PID ${pid})`));
      }
    }
  });

serverCmd
  .command("stop")
  .description("Stop the running MCP server")
  .action(() => {
    const pid = readPid();
    if (!isRunning(pid)) {
      console.log(`  ${c.dim("Server is not running.")}`);
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
      console.log(`  ${ok()} Server stopped (PID ${pid}).`);
    } catch (e) {
      console.error(`  ${fail()} Failed to stop server: ${e.message}`);
    }
  });

serverCmd
  .command("restart")
  .description("Stop the MCP server (it will be restarted by MCP client)")
  .action(async () => {
    const pid = readPid();
    if (!isRunning(pid)) {
      console.log(`  ${c.dim("Server is not running.")}`);
      return;
    }
    try {
      process.kill(pid, "SIGTERM");
      console.log(`  ${ok()} Server stopped (PID ${pid}).`);
      console.log(c.dim("  Your MCP client will restart it automatically on next request."));
    } catch (e) {
      console.error(`  ${fail()} Failed to stop server: ${e.message}`);
    }
  });

serverCmd
  .command("pid")
  .description("Print server PID (empty if not running)")
  .action(() => {
    const pid = readPid();
    console.log(pid && isRunning(pid) ? String(pid) : "");
  });

serverCmd
  .command("test")
  .description("Test WhatsApp connection (connect & disconnect)")
  .action(async () => {
    if (!authExists()) {
      console.log(
        `  ${fail()} No auth credentials. Run ${c.bold("whats-admin login")} first.`,
      );
      process.exit(1);
    }

    console.log(c.dim("  Connecting to WhatsApp..."));

    const { connect, getConnectionInfo } = require("../connection");
    const { loadConfig } = require("../config");

    connect(loadConfig()).catch((err) => {
      console.error(c.red(`  Connection error: ${err.message}`));
      process.exit(1);
    });

    // Wait for connection (max 30 seconds)
    const start = Date.now();
    const check = setInterval(() => {
      const info = getConnectionInfo();
      if (info.state === "open") {
        clearInterval(check);
        console.log(
          `  ${ok()} ${c.green("Connected")} as ${c.cyan(info.user?.name || "?")} (${info.user?.phone || "?"})`,
        );
        const stats = info.store_stats;
        if (stats) {
          console.log(
            c.dim(
              `  Store: ${stats.chats} chats, ${stats.contacts} contacts, ${stats.messages} messages`,
            ),
          );
        }
        console.log(`  ${ok()} Connection test passed.\n`);
        process.exit(0);
      }
      if (Date.now() - start > 30_000) {
        clearInterval(check);
        console.error(
          c.red(`  ${fail()} Connection timeout (30s). State: ${info.state}`),
        );
        process.exit(1);
      }
    }, 1000);
  });

// ═════════════════════════════════════════════════════════════════════════════
//  config
// ═════════════════════════════════════════════════════════════════════════════

const configCmd = program
  .command("config")
  .description("Manage configuration");

configCmd
  .command("show")
  .description("Print current merged configuration")
  .action(() => {
    const { loadConfig } = require("../config");
    console.log(JSON.stringify(loadConfig(), null, 2));
  });

configCmd
  .command("edit")
  .description("Open config.json in $EDITOR")
  .action(() => {
    if (!fs.existsSync(CONFIG_FILE)) {
      const { DEFAULTS } = require("../config");
      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify(DEFAULTS, null, 2) + "\n",
      );
      console.log(`  ${c.dim("Created config.json with defaults.")}`);
    }
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    try {
      execSync(`${editor} "${CONFIG_FILE}"`, { stdio: "inherit" });
    } catch (e) {
      console.error(`  ${fail()} Failed to open editor: ${e.message}`);
    }
  });

configCmd
  .command("reset")
  .description("Reset config.json to defaults")
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    if (!opts.force && fs.existsSync(CONFIG_FILE)) {
      const yes = await confirm(
        `  ${warn()} Overwrite config.json with defaults?`,
      );
      if (!yes) {
        console.log("  Aborted.");
        return;
      }
    }
    const { DEFAULTS } = require("../config");
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(DEFAULTS, null, 2) + "\n",
    );
    console.log(`  ${ok()} Config reset to defaults.`);
  });

configCmd
  .command("path")
  .description("Print config file path")
  .action(() => {
    console.log(CONFIG_FILE);
  });

// ═════════════════════════════════════════════════════════════════════════════
//  logs
// ═════════════════════════════════════════════════════════════════════════════

const logsCmd = program
  .command("logs")
  .description("View and manage logs");

logsCmd
  .command("show")
  .description("Display recent log lines")
  .option("-n, --lines <n>", "Number of lines to show", "50")
  .action((opts) => {
    const lf = logFile();
    if (!fs.existsSync(lf)) {
      console.log(`  ${c.dim("No log file found.")}`);
      console.log(c.dim(`  (Expected at ${lf})`));
      return;
    }
    const n = parseInt(opts.lines, 10) || 50;
    try {
      const content = execSync(`tail -n ${n} "${lf}"`, {
        encoding: "utf-8",
      });
      process.stdout.write(content);
    } catch {
      // Fallback if tail is not available
      const lines = fs.readFileSync(lf, "utf-8").split("\n");
      console.log(lines.slice(-n).join("\n"));
    }
  });

logsCmd
  .command("tail")
  .description("Follow log output in real-time")
  .action(() => {
    const lf = logFile();
    if (!fs.existsSync(lf)) {
      fs.mkdirSync(path.dirname(lf), { recursive: true });
      fs.writeFileSync(lf, "");
    }
    console.log(c.dim(`  Tailing ${lf}... (Ctrl+C to stop)\n`));
    const child = spawn("tail", ["-f", lf], { stdio: "inherit" });
    process.on("SIGINT", () => {
      child.kill();
      process.exit(0);
    });
  });

logsCmd
  .command("clean")
  .description("Delete log files")
  .option("-f, --force", "Skip confirmation")
  .action(async (opts) => {
    const lf = logFile();
    if (!fs.existsSync(lf)) {
      console.log(`  ${c.dim("No log file found.")}`);
      return;
    }
    const stat = fs.statSync(lf);
    const sizeKb = Math.round(stat.size / 1024);
    if (!opts.force) {
      const yes = await confirm(
        `  ${warn()} Delete log file (${sizeKb} KB)?`,
      );
      if (!yes) {
        console.log("  Aborted.");
        return;
      }
    }
    fs.unlinkSync(lf);
    console.log(`  ${ok()} Log file deleted.`);
  });

logsCmd
  .command("path")
  .description("Print log file path")
  .action(() => {
    console.log(logFile());
  });

// ═════════════════════════════════════════════════════════════════════════════
//  info
// ═════════════════════════════════════════════════════════════════════════════

program
  .command("info")
  .description("Show version and environment info")
  .action(() => {
    let baileysVer = "?";
    try {
      baileysVer = require(
        path.join(PKG_ROOT, "node_modules/@whiskeysockets/baileys/package.json"),
      ).version;
    } catch { /* ignore */ }

    let mcpSdkVer = "?";
    try {
      mcpSdkVer = require(
        path.join(PKG_ROOT, "node_modules/@modelcontextprotocol/sdk/package.json"),
      ).version;
    } catch { /* ignore */ }

    console.log(c.bold("\n  whats-mcp Info\n"));
    console.log(`  Version:     ${c.cyan(PKG_JSON.version)}`);
    console.log(`  Node.js:     ${c.cyan(process.version)}`);
    console.log(`  Baileys:     ${c.cyan(baileysVer)}`);
    console.log(`  MCP SDK:     ${c.cyan(mcpSdkVer)}`);
    console.log(`  Platform:    ${c.cyan(os.platform() + " " + os.arch())}`);
    console.log(`  State dir:   ${c.cyan(stateDir())}`);
    console.log(`  Auth dir:    ${c.cyan(authDir())}`);
    console.log(`  Config:      ${c.cyan(CONFIG_FILE)}`);
    console.log(`  PID file:    ${c.cyan(pidFile())}`);
    console.log(`  Log file:    ${c.cyan(logFile())}`);
    console.log(`  Package:     ${c.cyan(PKG_ROOT)}`);
    console.log();
  });

// ═════════════════════════════════════════════════════════════════════════════
//  Parse & run
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  program,
};
