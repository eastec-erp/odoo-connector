# Odoo Connector — TypeScript

An MCP server built on [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) that exposes Odoo over its JSON-RPC external API.

## Setup

```bash
cd typescript
npm install
cp .env.example .env   # then edit with your Odoo credentials
npm run build
```

## Run

```bash
npm start
# or watch-compile during development:
npm run dev
```

## Register with Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or via `claude mcp add`):

```json
{
  "mcpServers": {
    "odoo": {
      "command": "node",
      "args": ["/absolute/path/to/odoo-connector/typescript/dist/index.js"],
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
claude mcp add odoo -- node /absolute/path/to/odoo-connector/typescript/dist/index.js
```

## Tools

`test_connection`, `list_models`, `search_records`, `read_record`,
`create_record`, `update_record`, `delete_record`, `call_method`, plus a
`setup` prompt. See [`index.ts`](src/index.ts).

Run `test_connection` first — it staged-checks the config and credentials.
