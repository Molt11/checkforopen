#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /app/data/db

# Check if OpenClaw is installed in node_modules
if [ -f "/app/node_modules/.bin/openclaw" ]; then
    echo "Starting OpenClaw Gateway..."
    # Start the gateway in the background
    # We use --daemon-port if supported or just ensure it matches MC config
    /app/node_modules/.bin/openclaw gateway start --port 18789 &
else
    echo "Warning: OpenClaw binary not found at /app/node_modules/.bin/openclaw"
fi

echo "Starting Mission Control Server..."
# Start the Next.js standalone server
exec node server.js
