# Odoo Connector

A Claude connector ([MCP](https://modelcontextprotocol.io) server) for [Odoo](https://www.odoo.com), exposing Odoo's records and methods as tools Claude can call.

This repo contains **two parallel implementations** sharing the same tool surface:

| Dir | Stack | Odoo transport |
|-----|-------|----------------|
| [`python/`](python/) | Python + [FastMCP](https://github.com/modelcontextprotocol/python-sdk) | XML-RPC (`xmlrpc.client`) |
| [`typescript/`](typescript/) | Node + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) | JSON-RPC (`/jsonrpc`) |

Pick whichever fits your deployment. They are feature-equivalent.

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
