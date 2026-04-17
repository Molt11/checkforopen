FROM node:24-bullseye-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
# Copy only dependency manifests first for better layer caching
COPY package.json ./
COPY pnpm-lock.yaml ./
# Copy scripts needed by pnpm lifecycle hooks (verify:node)
COPY scripts ./scripts
# Allow building native dependencies
RUN pnpm config set supportedArchitectures --json '{"os": ["linux"], "cpu": ["x64", "arm64"]}'
# better-sqlite3 requires native compilation tools
RUN apt-get update && apt-get install -y python3 make g++ git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN pnpm install --no-frozen-lockfile && pnpm add openclaw@latest

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure we build for standalone output
ENV NEXT_PRIVATE_STANDALONE=true
RUN pnpm build
# Verify build output exists before moving to runtime
RUN test -d .next/standalone || (echo "ERROR: .next/standalone not found. Check next.config.js for output: 'standalone'" && exit 1)
RUN test -d node_modules/openclaw || (echo "ERROR: node_modules/openclaw not found" && exit 1)

FROM node:24-bullseye-slim AS runtime

# Install procps, git (required for openclaw install), and ca-certificates
RUN apt-get update && apt-get install -y \
    procps \
    git \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ARG MC_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/builderz-labs/mission-control"
LABEL org.opencontainers.image.description="Mission Control - operations dashboard"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${MC_VERSION}"

WORKDIR /app
ENV NODE_ENV=production

# Install openclaw globally in runtime for better path resolution
RUN npm install -g openclaw@latest

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
# Ensure openclaw is present in the runtime node_modules (standalone might have pruned it)
COPY --from=build --chown=nextjs:nodejs /app/node_modules/openclaw ./node_modules/openclaw
# The standalone output has its own node_modules, but we want to ensure openclaw is accessible
# if the app tries to resolve it from the root /app/node_modules
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy schema.sql needed by migration 001_init at runtime
COPY --from=build --chown=nextjs:nodejs /app/src/lib/schema.sql ./src/lib/schema.sql
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
RUN chmod +x /app/scripts/prod-entrypoint.sh
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
ENV OPENCLAW_BIN=openclaw
ENV NEXT_IMAGE_OPTIMIZATION_CACHE=0
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD ["node", "/app/healthcheck.js"]
# Entrypoint script starts both gateway and server
ENTRYPOINT ["/app/scripts/prod-entrypoint.sh"]
