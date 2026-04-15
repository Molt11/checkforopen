#!/bin/bash

# Configuration
NODE_PATH="/Users/mac/.nvm/versions/node/v24.14.0/bin"
MC_DIR="/Users/mac/Downloads/Claw/mission-control"
PORT=3000

# Setup Environment
export PATH="$NODE_PATH:$PATH"
export NODE_ENV=production
export PORT=$PORT

cd "$MC_DIR" || exit 1

# Start the server (Production build first if needed)
# Since the user wants it to run 'consistently', 
# we'll run 'pnpm dev' or 'pnpm start' based on preference.
# pnpm dev is better for active development, pnpm start for stability.
# Given the 'production environment' comment, pnpm start is safer.

# Ensure dependencies are installed
pnpm install

# Start Mission Control
# We use exec so the process replaces the shell and launchd can track it
exec pnpm dev
