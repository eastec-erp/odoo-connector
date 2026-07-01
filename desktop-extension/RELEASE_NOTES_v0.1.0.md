Connect Claude to your Odoo instance. Search, read, create, and update Odoo
records straight from a chat — with a one-click desktop install and a built-in
setup wizard.

## Install (Claude Desktop)

1. Download **`odoo-connector.mcpb`** from the Assets below.
2. Open **Claude Desktop → Settings → Extensions** and drop the file in.
3. Fill in your **Odoo URL**, **username**, and **API key**
   (Database is optional — it's auto-detected). Click **Save**.
4. In a chat, say **"test my Odoo connection"** — Claude confirms you're
   connected or tells you the exact field to fix.

No terminal, no config files, no Python/Node install required.

> Tip: create an Odoo **API key** at Settings → Account Security → New API Key
> and use that instead of your password.

## What's included

- **8 tools:** `test_connection`, `list_models`, `search_records`,
  `read_record`, `create_record`, `update_record`, `delete_record`,
  `call_method`.
- **Setup wizard** — a `test_connection` health check (server → database →
  authentication → user identity) plus a guided `setup` prompt that points at
  the precise setting to fix when something's wrong.
- **Minimal config** — `ODOO_DB` is auto-detected from the `*.odoo.com`
  subdomain or a single-database server, so most users only enter three fields.
- **Two implementations** in the repo — a Python (FastMCP) and a TypeScript
  server; the desktop extension bundles the TypeScript one.

## Requirements

- Claude Desktop with Extensions support.
- An Odoo instance reachable over HTTPS with external API access enabled
  (Odoo Online / *.odoo.com works out of the box).

## Security

Each user supplies their own Odoo credentials at install time — nothing is
hardcoded or shared. The API key is stored by Claude Desktop's secure config.
