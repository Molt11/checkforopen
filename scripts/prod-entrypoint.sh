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
mkdir -p $OPENCLAW_HOME

# Check if we are running in Hybrid/Remote mode
if [ -n "$OPENCLAW_GATEWAY_URL" ] && [ "$OPENCLAW_GATEWAY_URL" != "http://127.0.0.1:18789" ]; then
    echo "Hybrid Mode: Connecting to remote gateway at $OPENCLAW_GATEWAY_URL"
else
    # Check if OpenClaw is installed in node_modules for Local/Cloud mode
    if [ -f "/app/node_modules/.bin/openclaw" ]; then
        # Initialize config if it doesn't exist
        if [ ! -f "$OPENCLAW_HOME/openclaw.json" ]; then
            echo "Initializing OpenClaw configuration..."
            /app/node_modules/.bin/openclaw init --non-interactive
        fi

        echo "Starting OpenClaw Gateway..."
        # Start the gateway in the background
        /app/node_modules/.bin/openclaw gateway start --port 18789 &
    else
        echo "Warning: No remote OPENCLAW_GATEWAY_URL set and OpenClaw binary not found at /app/node_modules/.bin/openclaw"
    fi
fi

echo "Starting Mission Control Server..."
# Start the Next.js standalone server
exec node server.js
