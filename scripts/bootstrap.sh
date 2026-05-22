#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

info() {
  printf '[bootstrap] %s\n' "$1"
}

success() {
  printf '[bootstrap] %s\n' "$1"
}

cd "${REPO_ROOT}"

info "Starting project bootstrap..."

if ! command -v pnpm >/dev/null 2>&1; then
  printf '[bootstrap] pnpm is required but was not found in PATH.\n' >&2
  printf '[bootstrap] Install pnpm and run this script again.\n' >&2
  exit 1
fi

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    printf '[bootstrap] .env.example was not found.\n' >&2
    exit 1
  fi

  cp .env.example .env
  info "Created .env from .env.example."
else
  info "Found existing .env. Leaving it unchanged."
fi

mkdir -p data
info "Ensured local analytics storage exists at ./data."

info "Installing dependencies with pnpm..."
CI=true pnpm install

info "Running the test suite..."
CI=true pnpm test

success "Bootstrap complete."
printf '\n'
printf 'Next steps:\n'
printf '  1. Update .env with your real FMCSA and API keys if needed.\n'
printf '  2. Start the app with: pnpm run dev\n'
printf '  3. Open the analytics dashboard at: http://localhost:3000/analytics\n'
