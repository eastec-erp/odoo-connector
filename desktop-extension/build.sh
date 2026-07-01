#!/usr/bin/env bash
# Rebuild the Odoo Connector Claude Desktop Extension (.mcpb).
#
# Produces desktop-extension/odoo-connector.mcpb, ready to double-click into
# Claude Desktop (Settings → Extensions) or attach to a GitHub Release.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"

echo "==> Compiling TypeScript server"
( cd "$repo/typescript" && npm install && npx tsc )

echo "==> Copying compiled server into extension"
rm -rf "$here/server"
mkdir -p "$here/server"
cp "$repo"/typescript/dist/*.js "$here/server/"

echo "==> Installing production dependencies"
( cd "$here" && npm install --omit=dev --no-package-lock )

echo "==> Packing .mcpb"
( cd "$here" && npx --yes @anthropic-ai/mcpb@latest pack . odoo-connector.mcpb )

echo "==> Done: $here/odoo-connector.mcpb"
