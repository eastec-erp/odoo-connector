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

export interface ConnectionCheck {
  step: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

export interface ConnectionResult {
  ok: boolean;
  url: string;
  database?: string;
  server_version?: unknown;
  uid?: number;
  user?: Record<string, unknown>;
  checks: ConnectionCheck[];
  message: string;
  hint?: string;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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

    // Database is intentionally NOT required here — it can be auto-detected
    // later (subdomain for *.odoo.com, or a single-DB server).
    const missing = (
      [
        ["ODOO_URL", this.url],
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
    let res: Response;
    try {
      res = await fetch(`${this.url}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          id: ++this.rpcId,
          params: { service, method, args },
        }),
      });
    } catch (err) {
      // Network-level failure: DNS, TLS, connection refused, etc.
      throw new OdooError(
        `Could not reach Odoo at ${this.url} (${errMsg(err)}).`
      );
    }

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

  /** Server version info — no authentication required. */
  async getVersion(): Promise<Record<string, unknown>> {
    return (await this.jsonRpc("common", "version", [])) as Record<
      string,
      unknown
    >;
  }

  /**
   * Resolve the database name, auto-detecting when not configured:
   *   1. explicit ODOO_DB, else
   *   2. the subdomain of a *.odoo.com URL, else
   *   3. the sole database if the server exposes exactly one.
   */
  async ensureDb(): Promise<string> {
    if (this.db) return this.db;

    try {
      const host = new URL(this.url).hostname;
      if (host.endsWith(".odoo.com")) {
        this.db = host.split(".")[0];
        return this.db;
      }
    } catch {
      /* fall through to db.list */
    }

    try {
      const dbs = (await this.jsonRpc("db", "list", [])) as unknown;
      if (Array.isArray(dbs) && dbs.length === 1) {
        this.db = String(dbs[0]);
        return this.db;
      }
      if (Array.isArray(dbs) && dbs.length > 1) {
        throw new OdooError(
          `Server exposes multiple databases (${dbs.join(", ")}). ` +
            "Set the Database field to pick one."
        );
      }
    } catch (err) {
      if (err instanceof OdooError && err.message.includes("multiple")) throw err;
      // db.list is often disabled on hosted Odoo — fall through to a clear ask.
    }

    throw new OdooError(
      "Could not determine the Odoo database name. Set the Database field " +
        "(for *.odoo.com it is usually your subdomain)."
    );
  }

  /** Authenticate lazily and cache the user id. */
  private async getUid(): Promise<number> {
    if (this.uid === null) {
      const db = await this.ensureDb();
      const uid = (await this.jsonRpc("common", "authenticate", [
        db,
        this.username,
        this.password,
        {},
      ])) as number | false;
      if (!uid) {
        throw new OdooError(
          "Authentication failed: check the username and API key/password " +
            `for database "${db}".`
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
      throw new OdooError(`${model}.${method} failed: ${errMsg(err)}`);
    }
  }

  /**
   * Run a staged health check of the configuration and credentials, returning
   * a structured report rather than throwing. Powers the `test_connection`
   * tool and the setup wizard.
   */
  async testConnection(): Promise<ConnectionResult> {
    const checks: ConnectionCheck[] = [];

    // 1. Is the server reachable and speaking Odoo?
    let server_version: unknown;
    try {
      const v = await this.getVersion();
      server_version = v.server_version;
      checks.push({
        step: "Server reachable",
        status: "pass",
        detail: `Odoo ${server_version} at ${this.url}`,
      });
    } catch (err) {
      checks.push({ step: "Server reachable", status: "fail", detail: errMsg(err) });
      return {
        ok: false,
        url: this.url,
        checks,
        message: "❌ Could not reach the Odoo server.",
        hint: "Check the Odoo URL — it should include https:// and point at your instance, e.g. https://yourco.odoo.com",
      };
    }

    // 2. Which database?
    let database: string;
    try {
      database = await this.ensureDb();
      checks.push({ step: "Database resolved", status: "pass", detail: database });
    } catch (err) {
      checks.push({ step: "Database resolved", status: "fail", detail: errMsg(err) });
      return {
        ok: false,
        url: this.url,
        server_version,
        checks,
        message: "❌ Could not determine the database.",
        hint: "Fill in the Database field. For *.odoo.com it is usually your subdomain (e.g. \"yourco\").",
      };
    }

    // 3. Do the credentials authenticate?
    let uid: number;
    try {
      uid = await this.getUid();
      checks.push({ step: "Authentication", status: "pass", detail: `user id ${uid}` });
    } catch (err) {
      checks.push({ step: "Authentication", status: "fail", detail: errMsg(err) });
      return {
        ok: false,
        url: this.url,
        database,
        server_version,
        checks,
        message: "❌ Authentication failed.",
        hint: "Check the Username and API key/password. On *.odoo.com create an API key at Settings → Account Security → New API Key and use that.",
      };
    }

    // 4. Who are we? (nice confirmation; non-fatal if it fails)
    let user: Record<string, unknown> | undefined;
    try {
      const rows = await this.read("res.users", [uid], ["name", "login"]);
      user = rows[0];
      checks.push({
        step: "User identity",
        status: "pass",
        detail: `${user?.name} <${user?.login}>`,
      });
    } catch (err) {
      checks.push({ step: "User identity", status: "warn", detail: errMsg(err) });
    }

    return {
      ok: true,
      url: this.url,
      database,
      server_version,
      uid,
      user,
      checks,
      message: `✅ Connected to Odoo ${server_version} as ${
        user?.name ?? `user ${uid}`
      } (database "${database}").`,
    };
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
