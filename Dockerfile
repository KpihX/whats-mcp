FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY config.json ./config.json
COPY README.md ./README.md
COPY CHANGELOG.md ./CHANGELOG.md

ENV NODE_ENV=production
ENV WHATSAPP_STATE_DIR=/data/state
ENV WHATS_MCP_HTTP_HOST=0.0.0.0
ENV WHATS_MCP_HTTP_PORT=8092
ENV WHATS_MCP_HTTP_MCP_PATH=/mcp
ENV WHATS_MCP_ADMIN_ENV_FILE=/data/whats-admin.env

VOLUME ["/data"]

EXPOSE 8092

CMD ["node", "src/main.js", "serve-http"]
