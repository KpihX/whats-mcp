# Changelog

All notable changes to **whats-mcp** will be documented in this file.

## [Unreleased]

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

## [0.1.0]

### Added

- Initial WhatsApp MCP server based on Baileys
- Persistent local store and analytics
- Tool catalog covering messaging, chats, contacts, groups, profile, channels, labels, utilities, and intent-first overview flows
