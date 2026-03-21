/**
 * whats-mcp — Baileys connection manager.
 *
 * Manages the WhatsApp Web socket: authentication, QR handling,
 * auto-reconnect with exponential backoff, and connection state.
 */

"use strict";

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const os   = require("os");
const fs   = require("fs");
const qrcode = require("qrcode-terminal");
const { ALL_WA_PATCH_NAMES } = require("@whiskeysockets/baileys");
const Store = require("./store");

// ── State ────────────────────────────────────────────────────────────────────

/** @type {import("@whiskeysockets/baileys").WASocket | null} */
let sock = null;

/** @type {'disconnected' | 'connecting' | 'open' | 'closing'} */
let connectionState = "disconnected";

/** @type {Store} */
let store = null;

/** @type {number} */
let reconnectAttempts = 0;

/** @type {any} */
let config = null;
let persistStoreTimer = null;

// ── Logging (stderr only — stdout is MCP JSON-RPC) ──────────────────────────

const logger = pino({ level: "silent" });
const log = (...args) => process.stderr.write(args.join(" ") + "\n");

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialise and connect to WhatsApp.
 * @param {object} cfg - Parsed config.json
 * @returns {{ sock: import("@whiskeysockets/baileys").WASocket, store: Store }}
 */
async function connect(cfg) {
  config = cfg;

  const stateDir = (cfg.server?.state_directory || "~/.mcps/whatsapp").replace(
    /^~/,
    os.homedir()
  );
  const authPath = path.join(stateDir, "auth");
  const pidFile  = path.join(stateDir, "whats-mcp.pid");
  const storeFile = path.join(stateDir, "store.json");

  fs.mkdirSync(stateDir,  { recursive: true });
  fs.mkdirSync(authPath, { recursive: true });

  // PID lifecycle
  fs.writeFileSync(pidFile, String(process.pid));
  const clearPid = () => {
    try {
      const current = fs.readFileSync(pidFile, "utf-8").trim();
      if (current === String(process.pid)) {
        fs.unlinkSync(pidFile);
      }
    } catch (_) {
      /* ignore */
    }
  };
  process.on("exit",    clearPid);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT",  () => process.exit(0));

  // Store
  store = new Store({
    ...(cfg.store || {}),
    onChange: () => {
      if (cfg.store?.persist === false) return;
      if (persistStoreTimer) clearTimeout(persistStoreTimer);
      persistStoreTimer = setTimeout(() => {
        try {
          store.saveSnapshot(storeFile);
        } catch (err) {
          logger.warn({ err }, "Failed to persist store snapshot");
        }
      }, 500);
    },
  });

  if (cfg.store?.persist !== false) {
    try {
      if (store.loadSnapshot(storeFile)) {
        log(`[WA] Restored store snapshot from ${storeFile}`);
      }
    } catch (err) {
      logger.warn({ err }, "Failed to restore store snapshot");
    }
  }

  // Bootstrap dynamic watchlists from config (non-destructive: only imports missing names)
  if (cfg.watchlists && Object.keys(cfg.watchlists).length > 0) {
    const imported = store.importWatchlistsFromConfig(cfg.watchlists);
    if (imported > 0) {
      log(`[WA] Seeded ${imported} watchlist(s) from config into store`);
    }
  }

  // Connect
  await _createSocket(authPath, cfg);

  return { sock, store };
}

/**
 * Get the current socket.  Throws if not connected.
 * @returns {import("@whiskeysockets/baileys").WASocket}
 */
function getSocket() {
  if (!sock || connectionState !== "open") {
    const { WhatsAppError } = require("./helpers");
    throw new WhatsAppError(
      "WhatsApp is not connected. " +
      (connectionState === "connecting"
        ? "Connection in progress — please wait or scan the QR code."
        : "Run the server and scan the QR code to connect."),
      "NOT_CONNECTED"
    );
  }
  return sock;
}

/** Get the current store. */
function getStore() {
  if (!store) {
    store = new Store();
  }
  return store;
}

/** Get connection state info. */
function getConnectionInfo() {
  return {
    state: connectionState,
    user: sock?.user
      ? {
          id: sock.user.id,
          name: sock.user.name || sock.user.verifiedName || undefined,
          phone: sock.user.id?.split(":")[0] || undefined,
        }
      : null,
    store_stats: store?.stats() || null,
    reconnect_attempts: reconnectAttempts,
  };
}

// ── Internal ─────────────────────────────────────────────────────────────────

/** Whether a reconnect is already in flight (prevents concurrent reconnects). */
let reconnecting = false;

/**
 * Gracefully close existing socket before creating a new one.
 */
function _cleanupSocket() {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);        // graceful close (no error)
    } catch (_) { /* socket may already be dead */ }
    sock = null;
  }
}

async function _createSocket(authPath, cfg) {
  // Prevent parallel reconnection races
  if (reconnecting) return;
  reconnecting = true;

  try {
    connectionState = "connecting";

    // Clean up old socket FIRST to avoid 440 (connectionReplaced)
    _cleanupSocket();

    // Fetch latest WA Web version to avoid 405 errors
    const { version } = await fetchLatestBaileysVersion();
    log(`[WA] Using WA Web version: ${version.join(".")}`);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu("Chrome"),
      logger,
      markOnlineOnConnect: cfg.connection?.mark_online_on_connect ?? false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: cfg.connection?.sync_full_history ?? true,
    });

    // Bind store events
    store.bind(sock);

    // Credential persistence
    sock.ev.on("creds.update", saveCreds);

    // Connection state handling
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log("\n[WA] Scan this QR code with WhatsApp (Linked Devices):\n");
        qrcode.generate(qr, { small: true }, (code) => {
          process.stderr.write(code + "\n");
        });
      }

      if (connection === "open") {
        connectionState = "open";
        reconnectAttempts = 0;
        const user = sock.user;
        log(
          `[WA] Connected as ${user?.name || "?"} (${user?.id || "?"}) — PID ${process.pid}`
        );

        try {
          if (cfg.connection?.refresh_app_state_on_open ?? true) {
            await sock.resyncAppState(ALL_WA_PATCH_NAMES, true);
            const lastAccountSyncTimestamp = sock.authState?.creds?.lastAccountSyncTimestamp;
            if (lastAccountSyncTimestamp) {
              await sock.cleanDirtyBits("account_sync", lastAccountSyncTimestamp);
            }
            log("[WA] App state refreshed on open.");
          }

          const groups = await sock.groupFetchAllParticipating();
          for (const meta of Object.values(groups || {})) {
            if (meta?.id) {
              store.setGroupMeta(meta.id, meta);
            }
          }
          log(`[WA] Preloaded ${Object.keys(groups || {}).length} groups into store.`);
        } catch (err) {
          logger.warn({ err }, "Failed to preload groups after connect");
        }
      }

      if (connection === "close") {
        connectionState = "disconnected";
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;
        const maxAttempts = cfg.connection?.max_reconnect_attempts ?? 10;

        // 440 = connectionReplaced — another session took over, don't fight it
        // 401 = loggedOut — need re-pairing
        const noReconnectCodes = new Set([
          DisconnectReason.loggedOut,           // 401
          DisconnectReason.connectionReplaced,  // 440
        ]);
        const shouldReconnect = !noReconnectCodes.has(statusCode);

        log(
          `[WA] Disconnected (code=${statusCode}). ` +
          (shouldReconnect
            ? "Will reconnect..."
            : statusCode === DisconnectReason.loggedOut
              ? "Logged out — delete auth to re-pair."
              : "Connection replaced by another session.")
        );

        if (shouldReconnect && reconnectAttempts < maxAttempts) {
          reconnectAttempts++;
          const delay = Math.min(
            (cfg.connection?.reconnect_interval_ms || 3000) * Math.pow(1.5, reconnectAttempts - 1),
            30000
          );
          log(`[WA] Reconnect attempt ${reconnectAttempts}/${maxAttempts} in ${Math.round(delay)}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          await _createSocket(authPath, cfg);
        } else if (!shouldReconnect) {
          if (statusCode === DisconnectReason.loggedOut) {
            log("[WA] Session logged out. Remove auth folder and restart to re-pair.");
          } else {
            log("[WA] Connection replaced. Restart the server if needed.");
          }
        } else {
          log("[WA] Max reconnect attempts reached. Restart the server manually.");
        }
      }
    });
  } finally {
    reconnecting = false;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  connect,
  getSocket,
  getStore,
  getConnectionInfo,
};
