#!/usr/bin/env bash
set -e

# Check current Node.js major version
CURRENT_NODE_MAJOR=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v' || echo "0")

if [ "$CURRENT_NODE_MAJOR" -lt 22 ]; then
  if [ -d "$HOME/.nvm/versions/node/v22.23.2/bin" ]; then
    export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm use 22 2>/dev/null || true
  fi
fi

npm run build --workspace @startup-game/shared
npx concurrently --kill-others --names api,web "npm run dev --workspace @startup-game/server" "npm run dev --workspace @startup-game/client"
