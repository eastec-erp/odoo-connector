# Odoo Connector

A Claude connector ([MCP](https://modelcontextprotocol.io) server) for [Odoo](https://www.odoo.com), exposing Odoo's records and methods as tools Claude can call.

## Installing (easiest → most manual)

**1. Claude Desktop Extension (recommended for most users).** Download
`odoo-connector.mcpb` from the [latest release](https://github.com/eastec-erp/odoo-connector/releases/latest),
then in **Claude Desktop → Settings → Extensions → Advanced** click **Install
extension…** and select the file. Fill in the form (Odoo URL, username, API
key — leave Database blank). No terminal, no config files. See
[`desktop-extension/README.md`](desktop-extension/README.md).

**2. Command-line (Claude Code / power users).** Run one of the servers below
as a local stdio MCP server and register it with `claude mcp add`. See each
implementation's README.

---

## Implementations

This repo contains **two parallel implementations** sharing the same tool surface:

| Dir | Stack | Odoo transport | Used by |
|-----|-------|----------------|---------|
| [`python/`](python/) | Python + [FastMCP](https://github.com/modelcontextprotocol/python-sdk) | XML-RPC (`xmlrpc.client`) | CLI install |
| [`typescript/`](typescript/) | Node + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | JSON-RPC (`/jsonrpc`) | CLI install + `.mcpb` bundle |

They are feature-equivalent; the Desktop Extension bundles the TypeScript one.

Each end user supplies their **own** Odoo credentials at install time — nothing
is hardcoded or shared.

## First run — verify the connection

After installing, just tell Claude:

> **"Test my Odoo connection"**

Claude calls the `test_connection` tool, which runs a staged health check —
**server reachable → database → authentication → user identity** — and reports
which step failed with the exact field to fix. There's also a built-in
**`setup`** prompt (in Claude Desktop's prompt menu) that walks you through it.

## Tools exposed

Both servers expose the same tools:

- `test_connection` — staged health check of config + credentials (run this first)
- `list_models` — list available Odoo models (optionally filtered)
- `search_records` — search a model with a domain, returns matching records
- `read_record` — read fields of a record by id
- `create_record` — create a new record
- `update_record` — update fields on an existing record
- `delete_record` — delete a record
- `call_method` — call an arbitrary model method (escape hatch)

## Configuration

Both implementations read the same environment variables (see each dir's `.env.example`):

```
ODOO_URL=https://your-instance.odoo.com
ODOO_DB=your-database-name        # optional — auto-detected (see below)
ODOO_USERNAME=your-username-or-email
ODOO_PASSWORD=your-password-or-api-key
```

- **`ODOO_DB` is optional.** Leave it blank and it's auto-detected: the
  `*.odoo.com` subdomain, or the sole database if the server exposes one. Set it
  only if auto-detect fails or you run multiple databases.
- **Tip:** use an Odoo **API key** (Settings → Account Security → New API Key)
  instead of your password.

## Quick start

See [`python/README.md`](python/README.md) or [`typescript/README.md`](typescript/README.md).
