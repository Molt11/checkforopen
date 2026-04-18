#!/bin/sh
# Speed up startup and resolve gateway connectivity issues
set -e

# --- Source .env if present ---
if [ -f /app/.env ]; then
  printf '[entrypoint] Loading .env\n'
  set -a
  . /app/.env
  set +a
fi

# --- Helper: generate a random hex secret ---
generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

SECRETS_FILE="/app/data/.generated-secrets"
mkdir -p /app/data

# Load previously generated secrets if they exist
if [ -f "$SECRETS_FILE" ]; then
  printf '[entrypoint] Loading persisted secrets from .data\n'
  set -a
  . "$SECRETS_FILE"
  set +a
fi

# --- AUTH_SECRET ---
if [ -z "$AUTH_SECRET" ] || [ "$AUTH_SECRET" = "random-secret-for-legacy-cookies" ]; then
  AUTH_SECRET=$(generate_secret)
  printf '[entrypoint] Generated new AUTH_SECRET\n'
  printf 'AUTH_SECRET=%s\n' "$AUTH_SECRET" >> "$SECRETS_FILE"
  export AUTH_SECRET
fi

# --- API_KEY ---
if [ -z "$API_KEY" ] || [ "$API_KEY" = "generate-a-random-key" ]; then
  API_KEY=$(generate_secret)
  printf '[entrypoint] Generated new API_KEY\n'
  printf 'API_KEY=%s\n' "$API_KEY" >> "$SECRETS_FILE"
  export API_KEY
fi

# Ensure data directory exists
mkdir -p /app/data/db
chown -R nextjs:nodejs /app/data 2>/dev/null || true

# Setup OpenClaw environment
export OPENCLAW_HOME=/app/data/openclaw
export OPENCLAW_CONFIG_PATH=/app/data/openclaw/openclaw.json
export OPENCLAW_NO_RESPAWN=1
export NODE_COMPILE_CACHE=/app/data/openclaw-compile-cache
mkdir -p "$OPENCLAW_HOME"
mkdir -p "$NODE_COMPILE_CACHE"

# Pre-emptively create core directories to resolve doctor warnings
mkdir -p "$OPENCLAW_HOME/agents/main/sessions"
mkdir -p "$OPENCLAW_HOME/logs"
mkdir -p "$OPENCLAW_HOME/.openclaw/agents/main/sessions" 2>/dev/null || true

# Find openclaw binary
if [ -n "$OPENCLAW_BIN" ] && command -v "$OPENCLAW_BIN" >/dev/null 2>&1; then
    OC_BIN=$(command -v "$OPENCLAW_BIN")
elif [ -f "/app/node_modules/.bin/openclaw" ]; then
    OC_BIN="/app/node_modules/.bin/openclaw"
else
    OC_BIN=$(command -v openclaw 2>/dev/null || echo "")
fi

if [ -n "$OC_BIN" ]; then
    printf "[entrypoint] Found openclaw binary at: %s\n" "$OC_BIN"
    # Inject gateway token for CLI if provided
    if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
        export GATEWAY_TOKEN="$OPENCLAW_GATEWAY_TOKEN"
    fi
fi

# --- Fast Config Initialization ---
# We write the config file directly if it's missing or if we're in remote mode
# to avoid slow CLI calls during the critical health-check startup window.
if [ -n "$OPENCLAW_GATEWAY_URL" ] && [ "$OPENCLAW_GATEWAY_URL" != "http://127.0.0.1:18789" ]; then
    printf "[entrypoint] Configuring Hybrid Mode (Remote Gateway: %s)\n" "$OPENCLAW_GATEWAY_URL"
    
    # Write config directly - avoid 'config init' or 'config set' overhead
    cat <<EOF > "$OPENCLAW_CONFIG_PATH"
{
  "agents": { "list": [] },
  "gateway": {
    "mode": "remote",
    "host": "$OPENCLAW_GATEWAY_URL",
    "auth": {
      "mode": "token",
      "token": "$OPENCLAW_GATEWAY_TOKEN"
    }
  }
}
EOF
    chmod 600 "$OPENCLAW_CONFIG_PATH"

    if [ -n "$OC_BIN" ]; then
        # Run doctor fix in background so it doesn't block server start
        printf "[entrypoint] Starting background doctor fix...\n"
        $OC_BIN doctor --fix --timeout 30000 >/app/data/doctor-fix.log 2>&1 &
    fi
else
    if [ ! -f "$OPENCLAW_CONFIG_PATH" ]; then
        printf "[entrypoint] Initializing local skeleton configuration\n"
        echo '{"agents":{"list":[]},"gateway":{"mode":"local"}}' > "$OPENCLAW_CONFIG_PATH"
        chmod 600 "$OPENCLAW_CONFIG_PATH"
    fi
    
    if [ -n "$OC_BIN" ]; then
        printf "[entrypoint] Starting local OpenClaw Gateway...\n"
        $OC_BIN gateway start --port 18789 >/app/data/gateway.log 2>&1 &
    fi
fi

# --- Start Mission Control Server ---
printf "[entrypoint] Starting Mission Control Server on PORT=%s...\n" "${PORT:-3000}"

if [ -f "server.js" ]; then
    # Final check: is node_modules there? (Next.js standalone needs it)
    if [ ! -d "node_modules" ]; then
        printf "[entrypoint] WARNING: node_modules not found, attempting to use /app/node_modules\n"
        export NODE_PATH=/app/node_modules
    fi
    exec node server.js
else
    printf "[entrypoint] ERROR: server.js not found in %s\n" "$(pwd)"
    ls -la
    exit 1
fi
