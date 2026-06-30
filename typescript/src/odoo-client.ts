/**
 * Minimal Odoo JSON-RPC client.
 *
 * Talks to Odoo's `/jsonrpc` endpoint, calling the `common.authenticate` and
 * `object.execute_kw` services — the JSON-RPC equivalents of the XML-RPC API.
 *
 * Docs: https://www.odoo.com/documentation/master/developer/reference/external_api.html
 */

export class OdooError extends Error {}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | null;
  result?: unknown;
  error?: { message: string; data?: { message?: string; debug?: string } };
}

export class OdooClient {
  private url: string;
  private db: string;
  private username: string;
  private password: string;
  private uid: number | null = null;
  private rpcId = 0;

  constructor(opts?: {
    url?: string;
    db?: string;
    username?: string;
    password?: string;
  }) {
    this.url = (opts?.url ?? process.env.ODOO_URL ?? "").replace(/\/$/, "");
    this.db = opts?.db ?? process.env.ODOO_DB ?? "";
    this.username = opts?.username ?? process.env.ODOO_USERNAME ?? "";
    this.password = opts?.password ?? process.env.ODOO_PASSWORD ?? "";

    const missing = (
      [
        ["ODOO_URL", this.url],
        ["ODOO_DB", this.db],
        ["ODOO_USERNAME", this.username],
        ["ODOO_PASSWORD", this.password],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      throw new OdooError(
        `Missing required configuration: ${missing.join(", ")}. ` +
          "Set them in the environment or a .env file."
      );
    }
  }

  /** Low-level JSON-RPC call against a service/method. */
  private async jsonRpc(
    service: string,
    method: string,
    args: unknown[]
  ): Promise<unknown> {
    const res = await fetch(`${this.url}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        id: ++this.rpcId,
        params: { service, method, args },
      }),
    });

    if (!res.ok) {
      throw new OdooError(`HTTP ${res.status} from Odoo at ${this.url}/jsonrpc`);
    }

    const body = (await res.json()) as JsonRpcResponse;
    if (body.error) {
      const detail =
        body.error.data?.message ?? body.error.message ?? "unknown error";
      throw new OdooError(detail);
    }
    return body.result;
  }

  /** Authenticate lazily and cache the user id. */
  private async getUid(): Promise<number> {
    if (this.uid === null) {
      const uid = (await this.jsonRpc("common", "authenticate", [
        this.db,
        this.username,
        this.password,
        {},
      ])) as number | false;
      if (!uid) {
        throw new OdooError(
          "Authentication failed: check ODOO_DB, ODOO_USERNAME and " +
            "ODOO_PASSWORD (or API key)."
        );
      }
      this.uid = uid;
    }
    return this.uid;
  }

  /** Call `model.method(...args, kwargs)` via execute_kw. */
  async executeKw(
    model: string,
    method: string,
    args: unknown[] = [],
    kwargs: Record<string, unknown> = {}
  ): Promise<unknown> {
    const uid = await this.getUid();
    try {
      return await this.jsonRpc("object", "execute_kw", [
        this.db,
        uid,
        this.password,
        model,
        method,
        args,
        kwargs,
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new OdooError(`${model}.${method} failed: ${msg}`);
    }
  }

  // --- convenience wrappers used by the MCP tools ---------------------------

  async searchRead(
    model: string,
    domain: unknown[] = [],
    fields?: string[],
    limit?: number,
    offset = 0,
    order?: string
  ): Promise<Record<string, unknown>[]> {
    const kwargs: Record<string, unknown> = { offset };
    if (fields) kwargs.fields = fields;
    if (limit !== undefined) kwargs.limit = limit;
    if (order) kwargs.order = order;
    return (await this.executeKw(model, "search_read", [domain], kwargs)) as Record<
      string,
      unknown
    >[];
  }

  async read(
    model: string,
    ids: number[],
    fields?: string[]
  ): Promise<Record<string, unknown>[]> {
    const kwargs = fields ? { fields } : {};
    return (await this.executeKw(model, "read", [ids], kwargs)) as Record<
      string,
      unknown
    >[];
  }

  async create(model: string, values: Record<string, unknown>): Promise<number> {
    return (await this.executeKw(model, "create", [values])) as number;
  }

  async write(
    model: string,
    ids: number[],
    values: Record<string, unknown>
  ): Promise<boolean> {
    return (await this.executeKw(model, "write", [ids, values])) as boolean;
  }

  async unlink(model: string, ids: number[]): Promise<boolean> {
    return (await this.executeKw(model, "unlink", [ids])) as boolean;
  }

  async listModels(nameFilter?: string): Promise<Record<string, unknown>[]> {
    const domain: unknown[] = [["transient", "=", false]];
    if (nameFilter) {
      domain.push("|", ["model", "ilike", nameFilter], ["name", "ilike", nameFilter]);
    }
    return this.searchRead("ir.model", domain, ["model", "name"], undefined, 0, "model");
  }
}
