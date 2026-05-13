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

# Auto-increment the patch version in manifest.json so AMO accepts the upload.
current_version=$(grep '"version"' "$MANIFEST" | head -1 | grep -oP '[\d.]+')
IFS='.' read -r major minor patch <<< "$current_version"
patch=$(( patch + 1 ))
new_version="$major.$minor.$patch"

# Update manifest.json in-place
sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$MANIFEST"
echo "Bumped version $current_version -> $new_version"

# Sign via AMO unlisted channel
cd "$SCRIPT_DIR"
web-ext sign \
  --channel=unlisted \
  --api-key="$AMO_API_KEY" \
  --api-secret="$AMO_API_SECRET" \
  --artifacts-dir=web-ext-artifacts \
  --ignore-files='.env' '.git' 'web-ext-artifacts' 'sign.sh' 'INSTALL.md'

echo ""
echo "Signed XPI is in web-ext-artifacts/. Install it via about:addons in Zen."
