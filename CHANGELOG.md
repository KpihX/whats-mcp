# Changelog

All notable changes to **whats-mcp** will be documented in this file.

## [Unreleased]

## [0.2.0]

### Added
- **Local Media Cache Tooling** — `download_media` now saves extracted Baileys buffers to local disk (`$HOME/.cache/whats_media/`) and returns the paths instead of flooding the MCP context with multi-megabyte Base64 strings.
- **`cleanup_media` tool** — added a new utility tool to clear the local media cache directory and free up space safely.

### Changed

- **Project rename finalized** — the public package and operator surface now consistently use `whats-mcp` / `whats-admin`.
- **Package metadata normalized** — server name and version now come from `package.json` instead of being duplicated in `config.json`.
- **Runtime artifact naming cleaned** — pid/log filenames now use the final `whats-mcp.*` naming.

### Added

- **Shared MCP server builder** — `src/server.js` now centralizes stdio and HTTP server construction.
- **Dual transport entrypoint** — `src/main.js` now supports both `serve` and `serve-http`.
- **HTTP operator surface** — `src/http_app.js` now exposes `/health`, `/admin/status`, `/admin/help`, and streamable MCP over `/mcp`.
- **Shared admin helpers** — `src/admin/service.js` now centralizes status/help/log summaries for CLI, HTTP, and Telegram.
- **Telegram admin bridge** — `src/admin/telegram.js` adds the first homelab operator bridge for `/start`, `/help`, `/status`, `/health`, `/urls`, `/logs`, and `/restart`.
- **Deployment bundle** — `.dockerignore`, `Dockerfile`, `deploy/docker-compose.yml`, `deploy/docker-compose.override.example.yml`, `src/.env.example`, and `.gitlab-ci.yml`.
- **HTTP admin tests** — `tests/http_app.test.js` validates the new handler surface.
- **Admin logging parity** — shared admin logging now records Telegram commands, replies, and errors into the common admin log file.
- **Package-internal env loading** — `src/.env` is loaded automatically before runtime environment overrides.
- **Deploy health probes fixed** — Docker Compose and GitLab now use Node-native fetch probes instead of assuming `curl` exists inside the image.
- **Container operator binaries exposed** — the image now installs `whats-mcp` and `whats-admin` on `PATH` so `docker exec ... whats-admin ...` works directly.
- **Admin reconnect path clarified** — CLI and Telegram now expose a `reconnect` operator action, and pairing code login accepts phone formats like `+33605957785`.
- **Remote pairing flow added** — HTTP and Telegram admin now expose first-connection / re-pair actions through `POST /admin/pair-code` and `/pair_code <phone>`, backed by the shared `whats-admin login --code --phone ... --force` flow.
- **Compose project isolation** — whats-mcp deploys now pin the Compose project name to `whats-mcp`, preventing sibling MCP stacks deployed from other `deploy/` directories from being treated as orphans and removed.
- **Reconnect semantics fixed** — `/reconnect`, `POST /admin/reconnect`, and `whats-admin server reconnect` now trigger a live WhatsApp socket reconnect instead of restarting the container, preventing Telegram command replay loops caused by poll offset resets. `/restart` remains the explicit full-process restart path.
- **Deploy migration hardened** — the homelab deploy now reuses the existing `deploy_whats_mcp_data` volume and removes any stale `whats-mcp` container before `docker compose up`, preserving the paired WhatsApp session while migrating to the isolated Compose project name.

## [0.1.0]

### Added

- Initial WhatsApp MCP server based on Baileys
- Persistent local store and analytics
- Tool catalog covering messaging, chats, contacts, groups, profile, channels, labels, utilities, and intent-first overview flows
