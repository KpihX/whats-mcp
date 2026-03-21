# whats-mcp

[![npm](https://img.shields.io/npm/v/whats-mcp)](https://www.npmjs.com/package/whats-mcp)
[![Node](https://img.shields.io/node/v/whats-mcp)](https://www.npmjs.com/package/whats-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Comprehensive **WhatsApp MCP server** powered by Baileys, with intent-first read surfaces and dual transport support:

- local `stdio` for direct MCP clients
- remote `streamable-http` for homelab deployment
- operator surfaces over CLI, HTTP, and Telegram

## Features

- **64 MCP tools** for messaging, chats, contacts, groups, profile, channels, labels, analytics, watchlists, and intent-first overview flows
- **Intent-first tools** already built into the surface:
  - `whatsup`
  - `find_messages`
  - `daily_digest`
  - `manage_watchlist`
- **Persistent auth + local analytics store**
- **Dual transport**:
  - `whats-mcp serve`
  - `whats-mcp serve-http`
- **Operator surfaces**:
  - `whats-admin`
  - `/health`
  - `/admin/status`
  - `/admin/help`
  - `POST /admin/reconnect`
  - `POST /admin/pair-code`
  - Telegram admin bridge when configured

## Package Layout

```text
src/
├── admin/
│   ├── service.js      # shared operator summaries and runtime status helpers
│   └── telegram.js     # Telegram command bridge
├── tools/              # MCP tool catalog
├── connection.js       # Baileys lifecycle and reconnect logic
├── config.js           # config.json + env overrides + package metadata
├── helpers.js          # shared WhatsApp helper functions
├── http_app.js         # HTTP transport + /health + /admin/*
├── main.js             # transport entrypoint (stdio + HTTP)
├── server.js           # shared MCP server construction
└── store.js            # local cache, analytics index, watchlists
```

## Installation

```bash
# recommended — installs globally as a standalone tool
npm install -g whats-mcp

# or via npx (no install)
npx whats-mcp
```

Commands exposed:

```bash
whats-mcp
whats-admin
```

## Local Usage

### Stdio MCP

```bash
whats-mcp serve
```

### HTTP MCP

```bash
whats-mcp serve-http
```

Default HTTP surface:

- MCP: `/mcp`
- Health: `/health`
- Admin status: `/admin/status`
- Admin help: `/admin/help`
- Admin reconnect: `POST /admin/reconnect`
- Admin pair-code: `POST /admin/pair-code`

Default URLs:

- Primary: `https://whats.kpihx-labs.com`
- Fallback: `https://whats.homelab`

## Configuration

The project uses:

- `config.json` for non-sensitive runtime settings
- `src/.env.example` for deploy/runtime environment variables

Relevant environment variables:

| Variable | Purpose |
|---|---|
| `WHATSAPP_STATE_DIR` | Persistent Baileys auth + local store path |
| `WHATSAPP_LOG_LEVEL` | Runtime log level |
| `WHATS_MCP_HTTP_HOST` | HTTP bind host |
| `WHATS_MCP_HTTP_PORT` | HTTP bind port |
| `WHATS_MCP_HTTP_MCP_PATH` | MCP HTTP path |
| `WHATS_MCP_PUBLIC_BASE_URL` | Primary trusted route |
| `WHATS_MCP_FALLBACK_BASE_URL` | Fallback route |
| `TELEGRAM_WHATS_HOMELAB_TOKEN` | Optional Telegram admin bot token |
| `TELEGRAM_CHAT_IDS` | Optional comma-separated Telegram admin allowlist |

## CLI Admin

Shared operator summary:

```bash
whats-admin guide
```

Main commands:

```text
whats-admin status
whats-admin guide
whats-admin login [--code] [--phone N] [--force]
whats-admin logout [-f]
whats-admin server status|stop|restart|reconnect|pid|test
whats-admin config show|edit|reset|path
whats-admin logs show|tail|clean|path
```

Container usage:

```bash
docker exec -it whats-mcp whats-admin status
docker exec -it whats-mcp whats-admin login
docker exec -it whats-mcp whats-admin login --code --phone +33605957785
curl -fsS -X POST https://whats.kpihx-labs.com/admin/pair-code -H 'content-type: application/json' -d '{"phone":"33605957785"}'
curl -fsS -X POST https://whats.kpihx-labs.com/admin/reconnect
docker exec -it whats-mcp whats-admin server reconnect
```

Reconnect semantics:

- `reconnect` performs an in-process WhatsApp socket reconnect and keeps the HTTP server plus Telegram poller alive.
- `restart` restarts the container process and should be reserved for full service restarts, not routine session refreshes.

## Telegram Admin

When both variables are configured:

- `TELEGRAM_WHATS_HOMELAB_TOKEN`
- `TELEGRAM_CHAT_IDS`

the HTTP service auto-starts a Telegram admin poller.

Current commands:

```text
/start
/help
/status
/health
/urls
/logs [lines]
/pair_code <phone>
/reconnect
/restart
```

## Docker / Homelab Deployment

Deployment bundle:

- `Dockerfile`
- `deploy/docker-compose.yml`
- `deploy/docker-compose.override.example.yml`
- `.dockerignore`
- `.gitlab-ci.yml`
- `src/.env.example`

Typical local dry-run:

```bash
cd deploy
cp ../src/.env.example .env
docker compose config -q
docker compose up --build
```

The deployment stores persistent WhatsApp state under `/data/state` inside the container volume, so redeploys do not wipe the linked session.

## Validation

Current baseline:

```bash
npm test -- --runInBand
```

This validates:

- config loading
- helpers
- store behavior
- tool registry and handlers
- HTTP admin handler surface
- Telegram admin dispatch and runtime status
