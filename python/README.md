# Odoo Connector — Python

A [FastMCP](https://github.com/modelcontextprotocol/python-sdk) server that exposes Odoo over its XML-RPC external API.

## Setup

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env   # then edit with your Odoo credentials
```

## Run

```bash
# stdio server (what Claude launches)
odoo-connector

# or, for local development with the MCP Inspector:
mcp dev src/odoo_connector/server.py
```

## Register with Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or via `claude mcp add`):

```json
{
  "mcpServers": {
    "odoo": {
      "command": "odoo-connector",
      "env": {
        "ODOO_URL": "https://your-instance.odoo.com",
        "ODOO_DB": "your-database",
        "ODOO_USERNAME": "you@example.com",
        "ODOO_PASSWORD": "your-api-key"
      }
    }
  }
}
```

With Claude Code:

```bash
claude mcp add odoo -- odoo-connector
```

## Tools

`list_models`, `search_records`, `read_record`, `create_record`,
`update_record`, `delete_record`, `call_method`. See [`server.py`](src/odoo_connector/server.py).
