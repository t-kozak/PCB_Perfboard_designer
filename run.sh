#!/usr/bin/env bash
# Start the PCB Perfboard Designer dev server (http://localhost:3000).
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install it (e.g. 'npm i -g pnpm') and re-run." >&2
  exit 1
fi

# Install dependencies on first run or when the lockfile has changed.
if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules ]; then
  pnpm install
fi

exec pnpm start "$@"
