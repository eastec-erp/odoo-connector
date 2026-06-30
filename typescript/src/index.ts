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

const server = new McpServer({ name: "odoo-connector", version: "0.1.0" });

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
