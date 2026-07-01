"""Minimal Odoo XML-RPC client.

Wraps the two standard Odoo external API endpoints:
  - /xmlrpc/2/common  -> authentication (login)
  - /xmlrpc/2/object  -> execute_kw (read/write model methods)

Docs: https://www.odoo.com/documentation/master/developer/reference/external_api.html
"""

from __future__ import annotations

import os
import socket
import urllib.parse
import xmlrpc.client
from typing import Any


class OdooError(RuntimeError):
    """Raised when Odoo returns a fault or configuration is missing."""


class OdooClient:
    def __init__(
        self,
        url: str | None = None,
        db: str | None = None,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        self.url = (url or os.environ.get("ODOO_URL", "")).rstrip("/")
        self.db = db or os.environ.get("ODOO_DB", "")
        self.username = username or os.environ.get("ODOO_USERNAME", "")
        self.password = password or os.environ.get("ODOO_PASSWORD", "")

        # Database is intentionally NOT required here — it can be auto-detected
        # later (subdomain for *.odoo.com, or a single-DB server).
        missing = [
            name
            for name, val in (
                ("ODOO_URL", self.url),
                ("ODOO_USERNAME", self.username),
                ("ODOO_PASSWORD", self.password),
            )
            if not val
        ]
        if missing:
            raise OdooError(
                f"Missing required configuration: {', '.join(missing)}. "
                "Set them in the environment or a .env file."
            )

        self._common = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/common")
        self._models = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/object")
        self._db_proxy = xmlrpc.client.ServerProxy(f"{self.url}/xmlrpc/2/db")
        self._uid: int | None = None

    def version(self) -> dict:
        """Server version info — no authentication required."""
        try:
            return self._common.version()
        except (OSError, xmlrpc.client.ProtocolError, socket.gaierror) as exc:
            raise OdooError(f"Could not reach Odoo at {self.url} ({exc}).") from exc

    def ensure_db(self) -> str:
        """Resolve the database name, auto-detecting when not configured:

        1. explicit ODOO_DB, else
        2. the subdomain of a ``*.odoo.com`` URL, else
        3. the sole database if the server exposes exactly one.
        """
        if self.db:
            return self.db

        host = urllib.parse.urlparse(self.url).hostname or ""
        if host.endswith(".odoo.com"):
            self.db = host.split(".")[0]
            return self.db

        try:
            dbs = self._db_proxy.list()
        except (OSError, xmlrpc.client.Fault, xmlrpc.client.ProtocolError):
            dbs = None
        if isinstance(dbs, list) and len(dbs) == 1:
            self.db = str(dbs[0])
            return self.db
        if isinstance(dbs, list) and len(dbs) > 1:
            raise OdooError(
                f"Server exposes multiple databases ({', '.join(dbs)}). "
                "Set the Database field to pick one."
            )

        raise OdooError(
            "Could not determine the Odoo database name. Set the Database field "
            "(for *.odoo.com it is usually your subdomain)."
        )

    @property
    def uid(self) -> int:
        """Authenticate lazily and cache the resulting user id."""
        if self._uid is None:
            db = self.ensure_db()
            try:
                uid = self._common.authenticate(db, self.username, self.password, {})
            except xmlrpc.client.Fault as exc:  # pragma: no cover - network
                raise OdooError(f"Authentication failed: {exc.faultString}") from exc
            if not uid:
                raise OdooError(
                    "Authentication failed: check the username and API key/password "
                    f'for database "{db}".'
                )
            self._uid = uid
        return self._uid

    def test_connection(self) -> dict:
        """Staged health check of config and credentials.

        Returns a structured report (never raises) so it can drive the
        ``test_connection`` tool and the setup wizard.
        """
        checks: list[dict] = []

        # 1. Server reachable?
        try:
            server_version = self.version().get("server_version")
            checks.append(
                {
                    "step": "Server reachable",
                    "status": "pass",
                    "detail": f"Odoo {server_version} at {self.url}",
                }
            )
        except OdooError as exc:
            checks.append({"step": "Server reachable", "status": "fail", "detail": str(exc)})
            return {
                "ok": False,
                "url": self.url,
                "checks": checks,
                "message": "❌ Could not reach the Odoo server.",
                "hint": "Check the Odoo URL — it should include https:// and point at your instance, e.g. https://yourco.odoo.com",
            }

        # 2. Database?
        try:
            database = self.ensure_db()
            checks.append({"step": "Database resolved", "status": "pass", "detail": database})
        except OdooError as exc:
            checks.append({"step": "Database resolved", "status": "fail", "detail": str(exc)})
            return {
                "ok": False,
                "url": self.url,
                "server_version": server_version,
                "checks": checks,
                "message": "❌ Could not determine the database.",
                "hint": 'Fill in the Database field. For *.odoo.com it is usually your subdomain (e.g. "yourco").',
            }

        # 3. Authentication?
        try:
            uid = self.uid
            checks.append({"step": "Authentication", "status": "pass", "detail": f"user id {uid}"})
        except OdooError as exc:
            checks.append({"step": "Authentication", "status": "fail", "detail": str(exc)})
            return {
                "ok": False,
                "url": self.url,
                "database": database,
                "server_version": server_version,
                "checks": checks,
                "message": "❌ Authentication failed.",
                "hint": "Check the Username and API key/password. On *.odoo.com create an API key at Settings → Account Security → New API Key and use that.",
            }

        # 4. Who are we? (non-fatal)
        user = None
        try:
            rows = self.read("res.users", [uid], ["name", "login"])
            user = rows[0] if rows else None
            checks.append(
                {
                    "step": "User identity",
                    "status": "pass",
                    "detail": f"{user['name']} <{user['login']}>" if user else "unknown",
                }
            )
        except OdooError as exc:
            checks.append({"step": "User identity", "status": "warn", "detail": str(exc)})

        who = user["name"] if user else f"user {uid}"
        return {
            "ok": True,
            "url": self.url,
            "database": database,
            "server_version": server_version,
            "uid": uid,
            "user": user,
            "checks": checks,
            "message": f'✅ Connected to Odoo {server_version} as {who} (database "{database}").',
        }

    def execute_kw(
        self,
        model: str,
        method: str,
        args: list[Any] | None = None,
        kwargs: dict[str, Any] | None = None,
    ) -> Any:
        """Call ``model.method(*args, **kwargs)`` on the Odoo server."""
        try:
            return self._models.execute_kw(
                self.db,
                self.uid,
                self.password,
                model,
                method,
                args or [],
                kwargs or {},
            )
        except xmlrpc.client.Fault as exc:  # pragma: no cover - network
            raise OdooError(f"{model}.{method} failed: {exc.faultString}") from exc

    # --- convenience wrappers used by the MCP tools ---------------------------

    def search_read(
        self,
        model: str,
        domain: list | None = None,
        fields: list[str] | None = None,
        limit: int | None = None,
        offset: int = 0,
        order: str | None = None,
    ) -> list[dict]:
        kwargs: dict[str, Any] = {"offset": offset}
        if fields is not None:
            kwargs["fields"] = fields
        if limit is not None:
            kwargs["limit"] = limit
        if order is not None:
            kwargs["order"] = order
        return self.execute_kw(model, "search_read", [domain or []], kwargs)

    def read(self, model: str, ids: list[int], fields: list[str] | None = None) -> list[dict]:
        kwargs = {"fields": fields} if fields is not None else {}
        return self.execute_kw(model, "read", [ids], kwargs)

    def create(self, model: str, values: dict) -> int:
        return self.execute_kw(model, "create", [values])

    def write(self, model: str, ids: list[int], values: dict) -> bool:
        return self.execute_kw(model, "write", [ids, values])

    def unlink(self, model: str, ids: list[int]) -> bool:
        return self.execute_kw(model, "unlink", [ids])

    def list_models(self, name_filter: str | None = None) -> list[dict]:
        domain = [["transient", "=", False]]
        if name_filter:
            domain.append("|")
            domain.append(["model", "ilike", name_filter])
            domain.append(["name", "ilike", name_filter])
        return self.search_read(
            "ir.model",
            domain=domain,
            fields=["model", "name"],
            order="model",
        )
