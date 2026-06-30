"""Minimal Odoo XML-RPC client.

Wraps the two standard Odoo external API endpoints:
  - /xmlrpc/2/common  -> authentication (login)
  - /xmlrpc/2/object  -> execute_kw (read/write model methods)

Docs: https://www.odoo.com/documentation/master/developer/reference/external_api.html
"""

from __future__ import annotations

import os
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

        missing = [
            name
            for name, val in (
                ("ODOO_URL", self.url),
                ("ODOO_DB", self.db),
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
        self._uid: int | None = None

    @property
    def uid(self) -> int:
        """Authenticate lazily and cache the resulting user id."""
        if self._uid is None:
            try:
                uid = self._common.authenticate(
                    self.db, self.username, self.password, {}
                )
            except xmlrpc.client.Fault as exc:  # pragma: no cover - network
                raise OdooError(f"Authentication failed: {exc.faultString}") from exc
            if not uid:
                raise OdooError(
                    "Authentication failed: check ODOO_DB, ODOO_USERNAME and "
                    "ODOO_PASSWORD (or API key)."
                )
            self._uid = uid
        return self._uid

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
