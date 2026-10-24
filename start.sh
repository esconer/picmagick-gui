#!/usr/bin/env bash
# One-click launcher for picmagick-gui on Linux.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v bun >/dev/null 2>&1; then
  echo
  echo "  bun is not installed or not on PATH."
  echo "  Install it from https://bun.sh"
  echo
  exit 1
fi

echo "Starting picmagick-gui..."
exec bun run src/server.ts --open
