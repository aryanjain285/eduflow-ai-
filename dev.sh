#!/usr/bin/env bash
# Start both backend (FastAPI) and frontend (Next.js) together.
# Usage: ./dev.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure node/npm are on PATH (nvm doesn't work in non-interactive shells)
export NVM_DIR="$HOME/.nvm"
if [ -d "$NVM_DIR/versions/node" ]; then
  NODE_DIR=$(ls -d "$NVM_DIR/versions/node/"* 2>/dev/null | sort -V | tail -1)
  if [ -n "$NODE_DIR" ]; then
    export PATH="$NODE_DIR/bin:$PATH"
  fi
fi

# Activate venv if it exists
if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
  source .venv/bin/activate
fi

python scripts/start_web.py
