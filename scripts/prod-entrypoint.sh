#!/bin/sh
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

# Setup OpenClaw environment
export OPENCLAW_HOME=/app/data/openclaw
export OPENCLAW_CONFIG_PATH=/app/data/openclaw/openclaw.json
export OPENCLAW_NO_RESPAWN=1
export NODE_COMPILE_CACHE=/app/data/openclaw-compile-cache
mkdir -p $OPENCLAW_HOME
mkdir -p $NODE_COMPILE_CACHE

# Inject gateway token for CLI if provided
if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
    export GATEWAY_TOKEN="$OPENCLAW_GATEWAY_TOKEN"
fi

# Find openclaw binary
if [ -n "$OPENCLAW_BIN" ] && command -v "$OPENCLAW_BIN" >/dev/null 2>&1; then
    OC_BIN=$(command -v "$OPENCLAW_BIN")
elif [ -f "/app/node_modules/.bin/openclaw" ]; then
    OC_BIN="/app/node_modules/.bin/openclaw"
elif [ -f "/usr/local/bin/openclaw" ]; then
    OC_BIN="/usr/local/bin/openclaw"
elif [ -f "/usr/bin/openclaw" ]; then
    OC_BIN="/usr/bin/openclaw"
elif command -v openclaw >/dev/null 2>&1; then
    OC_BIN=$(command -v openclaw)
else
    OC_BIN=""
fi

if [ -n "$OC_BIN" ]; then
    echo "[entrypoint] Found openclaw binary at: $OC_BIN"
    $OC_BIN --version || true
else
    echo "[entrypoint] WARNING: openclaw binary not found in PATH or standard locations"
fi

# Initialize config if it doesn't exist
if [ ! -f "$OPENCLAW_CONFIG_PATH" ]; then
    echo "Initializing OpenClaw configuration..."
    if [ -n "$OPENCLAW_GATEWAY_URL" ] && [ "$OPENCLAW_GATEWAY_URL" != "http://127.0.0.1:18789" ]; then
        echo '{"agents":{"list":[]},"gateway":{"mode":"remote","host":"'"$OPENCLAW_GATEWAY_URL"'"}}' > "$OPENCLAW_CONFIG_PATH"
        echo "Created remote-mode skeleton configuration"
    elif [ -n "$OC_BIN" ]; then
        # Try a single fast initialization command first
        if $OC_BIN config init --non-interactive --timeout 5000 2>/dev/null; then
            echo "Successfully initialized config via 'config init'"
        else
            echo "Fast init failed. Creating skeleton configuration..."
            echo '{"agents":{"list":[]},"gateway":{"mode":"local"}}' > "$OPENCLAW_CONFIG_PATH"
        fi
    else
        echo '{"agents":{"list":[]},"gateway":{"mode":"local"}}' > "$OPENCLAW_CONFIG_PATH"
    fi
fi

# Update config for Remote/Hybrid mode if URL is set (Non-blocking)
if [ -n "$OPENCLAW_GATEWAY_URL" ] && [ "$OPENCLAW_GATEWAY_URL" != "http://127.0.0.1:18789" ]; then
    echo "Hybrid Mode: Connecting to remote gateway at $OPENCLAW_GATEWAY_URL"
    if [ -n "$OC_BIN" ]; then
        # Run these in background or with very short timeouts to avoid blocking server start
        $OC_BIN config set gateway.mode remote --timeout 2000 2>/dev/null || true
        $OC_BIN config set gateway.host "$OPENCLAW_GATEWAY_URL" --timeout 2000 2>/dev/null || true
        if [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
            $OC_BIN config set gateway.auth.token "$OPENCLAW_GATEWAY_TOKEN" --timeout 2000 2>/dev/null || true
        fi
    fi
else
    if [ -n "$OC_BIN" ]; then
        echo "Starting OpenClaw Gateway..."
        # Start the gateway in the background
        $OC_BIN gateway start --port 18789 &
    else
        echo "Warning: No remote OPENCLAW_GATEWAY_URL set and OpenClaw binary not found"
    fi
fi

echo "[entrypoint] Starting Mission Control Server on PORT=${PORT:-3000}..."
echo "[entrypoint] Current user: $(id -u -n)"
echo "[entrypoint] Working directory: $(pwd)"

# Final permission fix for the data directory
if [ -d "/app/data" ]; then
    echo "[entrypoint] Verifying /app/data permissions..."
fi

# Start the Next.js standalone server
if [ -f "server.js" ]; then
    # Ensure node_modules exists (even as a symlink or empty dir)
    if [ ! -d "node_modules" ]; then
        echo "[entrypoint] WARNING: node_modules not found in $(pwd), server might fail"
    fi
    exec node server.js
else
    echo "[entrypoint] ERROR: server.js not found in $(pwd)"
    ls -la
    exit 1
fi
