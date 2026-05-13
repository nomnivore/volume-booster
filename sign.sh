#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.json"
ENV_FILE="$SCRIPT_DIR/.env"

# Load credentials from .env if present
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

if [[ -z "${AMO_API_KEY:-}" || -z "${AMO_API_SECRET:-}" ]]; then
  echo "Error: AMO_API_KEY and AMO_API_SECRET must be set (in .env or the environment)." >&2
  exit 1
fi

current_version=$(grep '"version"' "$MANIFEST" | head -1 | grep -oP '[\d.]+')
IFS='.' read -r major minor patch <<<"$current_version"
new_version="$major.$minor.$((patch + 1))"

# Bump the version now, but restore on any failure via trap.
sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$MANIFEST"
trap 'sed -i "s/\"version\": \"$new_version\"/\"version\": \"$current_version\"/" "$MANIFEST"; echo "" >&2; echo "Signing failed — manifest.json restored to $current_version." >&2' ERR

# Sign via AMO unlisted channel
cd "$SCRIPT_DIR"
pnpx web-ext sign \
  --channel=unlisted \
  --api-key="$AMO_API_KEY" \
  --api-secret="$AMO_API_SECRET" \
  --artifacts-dir=web-ext-artifacts \
  --ignore-files='.env' '.git' 'web-ext-artifacts' 'sign.sh' 'INSTALL.md'

trap - ERR
echo ""
echo "Bumped version $current_version -> $new_version"
echo "Signed XPI is in web-ext-artifacts/. Install it via about:addons in Zen."
