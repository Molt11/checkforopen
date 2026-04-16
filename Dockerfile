FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
# Copy only dependency manifests first for better layer caching
COPY package.json ./
COPY pnpm-lock.yaml* ./
# Copy scripts needed by pnpm lifecycle hooks (verify:node)
COPY scripts ./scripts
# Allow building native dependencies
RUN pnpm config set supportedArchitectures --json '{"os": ["linux"], "cpu": ["x64", "arm64"]}'
# better-sqlite3 requires native compilation tools
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      echo "WARN: pnpm-lock.yaml not found in build context; running non-frozen install" && \
      pnpm install --no-frozen-lockfile; \
    fi

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:24-slim AS runtime

# Install procps for ps and uptime commands used by diagnostics/scheduler
RUN apt-get update && apt-get install -y procps --no-install-recommends && rm -rf /var/lib/apt/lists/*

ARG MC_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/openclaw/mission-control"
LABEL org.opencontainers.image.description="Mission Control - operations dashboard"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${MC_VERSION}"

WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy schema.sql needed by migration 001_init at runtime
COPY --from=build --chown=nextjs:nodejs /app/src/lib/schema.sql ./src/lib/schema.sql
# Create data directory with correct ownership for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
# Create cache directory with correct ownership for Next.js ISR
RUN mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache
RUN echo 'const http=require("http");const r=http.get("http://localhost:"+(process.env.PORT||3000)+"/api/status?action=health",s=>{process.exit(s.statusCode===200?0:1)});r.on("error",()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})' > /app/healthcheck.js
USER nextjs
ENV PORT=3000
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
ENV MISSION_CONTROL_REPO_ROOT=/app
ENV OPENCLAW_BIN=/app/node_modules/.bin/openclaw
ENV NEXT_IMAGE_OPTIMIZATION_CACHE=0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "/app/healthcheck.js"]

# Wrapper to ensure writable directory even if volume mount is root-owned
CMD ["sh", "-c", "mkdir -p /app/data/db && node server.js"]
