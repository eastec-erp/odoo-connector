#!/usr/bin/env node
/**
 * MCP server exposing Odoo as Claude-callable tools (TypeScript).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { OdooClient } from "./odoo-client.js";

// A single lazily-authenticated client is reused across tool calls.
let _client: OdooClient | null = null;
function client(): OdooClient {
  if (_client === null) _client = new OdooClient();
  return _client;
}

/** Wrap a tool result as MCP text content (JSON-encoded). */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({ name: "odoo-connector", version: "0.1.3" });

server.tool(
  "test_connection",
  "Verify the Odoo configuration and credentials. Runs a staged health check " +
    "(server reachable → database → authentication → user identity) and returns " +
    "a report with an actionable hint for whichever step fails. Call this first " +
    "after installing.",
  {},
  async () => {
    try {
      return ok(await client().testConnection());
    } catch (err) {
      // Configuration errors (missing fields) surface here.
      const message = err instanceof Error ? err.message : String(err);
      return ok({
        ok: false,
        message: `❌ ${message}`,
        hint: "Open Claude Desktop → Settings → Extensions → Odoo Connector and fill in the required fields.",
      });
    }
  }
);

server.tool(
  "list_models",
  "List available Odoo models. Optionally filter by a case-insensitive substring of the technical name or label.",
  { name_filter: z.string().optional() },
  async ({ name_filter }) => ok(await client().listModels(name_filter))
);

server.tool(
  "search_records",
  "Search a model and return matching records.",
  {
    model: z.string().describe('Technical model name, e.g. "res.partner".'),
    domain: z
      .array(z.any())
      .optional()
      .describe('Odoo search domain (list of triplets). Defaults to all records.'),
    fields: z.array(z.string()).optional().describe("Field names to return; omit for all."),
    limit: z.number().int().default(50),
    offset: z.number().int().default(0),
    order: z.string().optional().describe('Sort spec, e.g. "name asc, id desc".'),
  },
  async ({ model, domain, fields, limit, offset, order }) =>
    ok(await client().searchRead(model, domain ?? [], fields, limit, offset, order))
);

server.tool(
  "read_record",
  "Read the fields of a single record by id.",
  {
    model: z.string(),
    record_id: z.number().int(),
    fields: z.array(z.string()).optional(),
  },
  async ({ model, record_id, fields }) => {
    const records = await client().read(model, [record_id], fields);
    if (records.length === 0) {
      throw new Error(`No ${model} record found with id ${record_id}`);
    }
    return ok(records[0]);
  }
);

server.tool(
  "create_record",
  "Create a new record and return its id.",
  {
    model: z.string(),
    values: z.record(z.any()).describe("Field/value mapping for the new record."),
  },
  async ({ model, values }) => ok(await client().create(model, values))
);

server.tool(
  "update_record",
  "Update fields on an existing record.",
  {
    model: z.string(),
    record_id: z.number().int(),
    values: z.record(z.any()).describe("Field/value mapping to write."),
  },
  async ({ model, record_id, values }) =>
    ok(await client().write(model, [record_id], values))
);

server.tool(
  "delete_record",
  "Delete a record by id.",
  { model: z.string(), record_id: z.number().int() },
  async ({ model, record_id }) => ok(await client().unlink(model, [record_id]))
);

server.tool(
  "call_method",
  "Call an arbitrary method on a model (escape hatch for anything the dedicated tools don't cover).",
  {
    model: z.string(),
    method: z.string(),
    args: z.array(z.any()).optional(),
    kwargs: z.record(z.any()).optional(),
  },
  async ({ model, method, args, kwargs }) =>
    ok(await client().executeKw(model, method, args ?? [], kwargs ?? {}))
);

// A guided setup "wizard" surfaced in Claude Desktop's prompt menu.
server.prompt(
  "setup",
  "Guided setup & connection test for the Odoo Connector.",
  async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Help me set up the Odoo Connector. Do this step by step:",
            "",
            "1. Call the `test_connection` tool.",
            "2. Read the `checks` array and tell me, in plain language, which steps passed and which failed.",
            "3. If everything passed, confirm I'm connected (name the database and user) and suggest one thing I can try, e.g. \"list my most recent customers\".",
            "4. If a step failed, use the `hint` to tell me the EXACT field to fix in Claude Desktop → Settings → Extensions → Odoo Connector, then ask me to save and say \"retry\" so you can run `test_connection` again.",
            "",
            "Reminder for me: on Odoo Online (*.odoo.com) I should use an API key (Settings → Account Security → New API Key), not my account password.",
          ].join("\n"),
        },
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logging must go to stderr — stdout is the MCP transport.
  console.error("odoo-connector MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
