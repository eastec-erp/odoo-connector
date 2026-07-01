# Odoo Connector

A Claude connector ([MCP](https://modelcontextprotocol.io) server) for [Odoo](https://www.odoo.com), exposing Odoo's records and methods as tools Claude can call.

## Installing (easiest → most manual)

**1. Claude Desktop Extension (recommended for most users).** Download
`odoo-connector.mcpb` from the [desktop extension](desktop-extension/), open
**Claude Desktop → Settings → Extensions**, drop the file in, and fill in the
form (Odoo URL, database, username, API key). No terminal, no config files.
See [`desktop-extension/README.md`](desktop-extension/README.md).

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

## Tools exposed

Both servers expose the same tools:

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
ODOO_DB=your-database-name
ODOO_USERNAME=your-username-or-email
ODOO_PASSWORD=your-password-or-api-key
```

> Tip: use an Odoo **API key** (Settings → Account Security → New API Key) instead of your password.

## Quick start

See [`python/README.md`](python/README.md) or [`typescript/README.md`](typescript/README.md).
