#!/bin/sh
set -e

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
