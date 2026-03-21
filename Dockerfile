FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY config.json ./config.json
COPY README.md ./README.md
COPY CHANGELOG.md ./CHANGELOG.md

RUN chmod +x /app/src/main.js /app/src/admin.js /app/src/admin/cli.js \
    && ln -sf /app/src/main.js /usr/local/bin/whats-mcp \
    && ln -sf /app/src/admin.js /usr/local/bin/whats-admin

ENV NODE_ENV=production
ENV WHATSAPP_STATE_DIR=/data/state
ENV WHATS_MCP_HTTP_HOST=0.0.0.0
ENV WHATS_MCP_HTTP_PORT=8092
ENV WHATS_MCP_HTTP_MCP_PATH=/mcp
ENV WHATS_MCP_ADMIN_ENV_FILE=/data/whats-admin.env

VOLUME ["/data"]

EXPOSE 8092

CMD ["bun", "src/main.js", "serve-http"]
