# API server for Render (or any Docker host). Build from the repo root: docker build -f server/Dockerfile .
FROM node:24-bookworm-slim

# yt-dlp: YouTube fallback when the Innertube client returns nothing (standalone binary, no Python needed)
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  && chmod +x /usr/local/bin/yt-dlp \
  && apt-get purge -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --workspace server --include-workspace-root=false
COPY server/src server/src
COPY server/tsconfig.json server/

ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 YTDLP_BIN=/usr/local/bin/yt-dlp
EXPOSE 10000
RUN chown node /app/server # the snapshot cache (.cache/pool.json) is written here
USER node
WORKDIR /app/server
CMD ["npx", "tsx", "src/index.ts"]
