"""FastMCP server exposing Odoo as Claude-callable tools."""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from .odoo_client import OdooClient, OdooError

mcp = FastMCP("odoo-connector")

# A single lazily-authenticated client is reused across tool calls.
_client: OdooClient | None = None


def client() -> OdooClient:
    global _client
    if _client is None:
        _client = OdooClient()
    return _client


@mcp.tool()
def test_connection() -> dict:
    """Verify the Odoo configuration and credentials.

    Runs a staged health check (server reachable -> database -> authentication
    -> user identity) and returns a report with an actionable hint for whichever
    step fails. Call this first after installing.
    """
    try:
        return client().test_connection()
    except OdooError as exc:
        return {
            "ok": False,
            "message": f"❌ {exc}",
            "hint": "Set ODOO_URL, ODOO_USERNAME and ODOO_PASSWORD (and optionally ODOO_DB).",
        }


@mcp.prompt()
def setup() -> str:
    """Guided setup & connection test for the Odoo Connector."""
    return (
        "Help me set up the Odoo Connector. Do this step by step:\n\n"
        "1. Call the `test_connection` tool.\n"
        "2. Read the `checks` array and tell me, in plain language, which steps "
        "passed and which failed.\n"
        "3. If everything passed, confirm I'm connected (name the database and "
        'user) and suggest one thing I can try, e.g. "list my most recent customers".\n'
        "4. If a step failed, use the `hint` to tell me the EXACT setting to fix, "
        'then ask me to fix it and say "retry" so you can run `test_connection` again.\n\n'
        "Reminder for me: on Odoo Online (*.odoo.com) I should use an API key "
        "(Settings → Account Security → New API Key), not my account password."
    )


@mcp.tool()
def list_models(name_filter: str | None = None) -> list[dict]:
    """List available Odoo models.

    Args:
        name_filter: Optional case-insensitive substring to match against the
            technical model name (e.g. "partner") or its label.
    """
    return client().list_models(name_filter)


@mcp.tool()
def search_records(
    model: str,
    domain: list | None = None,
    fields: list[str] | None = None,
    limit: int = 50,
    offset: int = 0,
    order: str | None = None,
) -> list[dict]:
    """Search a model and return matching records.

    Args:
        model: Technical model name, e.g. "res.partner".
        domain: Odoo search domain, a list of triplets, e.g.
            [["is_company", "=", true], ["country_id.code", "=", "AU"]].
            Defaults to all records.
        fields: Field names to return. Omit to return all fields.
        limit: Maximum number of records (default 50).
        offset: Number of records to skip (for pagination).
        order: Sort spec, e.g. "name asc, id desc".
    """
    return client().search_read(model, domain, fields, limit, offset, order)


@mcp.tool()
def read_record(model: str, record_id: int, fields: list[str] | None = None) -> dict:
    """Read the fields of a single record by id.

    Args:
        model: Technical model name, e.g. "res.partner".
        record_id: The record's database id.
        fields: Field names to return. Omit to return all fields.
    """
    records = client().read(model, [record_id], fields)
    if not records:
        raise OdooError(f"No {model} record found with id {record_id}")
    return records[0]


@mcp.tool()
def create_record(model: str, values: dict[str, Any]) -> int:
    """Create a new record and return its id.

    Args:
        model: Technical model name, e.g. "res.partner".
        values: Field/value mapping for the new record.
    """
    return client().create(model, values)


@mcp.tool()
def update_record(model: str, record_id: int, values: dict[str, Any]) -> bool:
    """Update fields on an existing record.

    Args:
        model: Technical model name, e.g. "res.partner".
        record_id: The record's database id.
        values: Field/value mapping to write.
    """
    return client().write(model, [record_id], values)


@mcp.tool()
def delete_record(model: str, record_id: int) -> bool:
    """Delete a record by id.

    Args:
        model: Technical model name, e.g. "res.partner".
        record_id: The record's database id.
    """
    return client().unlink(model, [record_id])


@mcp.tool()
def call_method(
    model: str,
    method: str,
    args: list | None = None,
    kwargs: dict | None = None,
) -> Any:
    """Call an arbitrary method on a model (escape hatch for anything the
    dedicated tools don't cover).

    Args:
        model: Technical model name, e.g. "sale.order".
        method: Method name, e.g. "action_confirm".
        args: Positional arguments list.
        kwargs: Keyword arguments mapping.
    """
    return client().execute_kw(model, method, args, kwargs)


def main() -> None:
    """Console-script entry point: run the server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
