/**
 * Automatic proxy detection so the connector obeys the machine's proxy without
 * the user configuring anything. Node's global fetch ignores system proxy
 * settings, which is why a browser can reach Odoo while the connector can't on
 * a corporate network.
 *
 * Resolution order for a given target URL:
 *   1. HTTPS_PROXY / HTTP_PROXY / ALL_PROXY env vars (respecting NO_PROXY)
 *   2. OS system proxy — Windows registry, macOS scutil (static proxy or PAC)
 *   3. direct (no proxy)
 *
 * Everything is best-effort and wrapped so detection failures fall back to a
 * direct connection — never worse than having no proxy support at all.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetch, ProxyAgent, type Dispatcher } from "undici";

const pexec = promisify(execFile);

export interface ProxyInfo {
  /** e.g. "http://proxy:8080", or null for a direct connection. */
  proxyUrl: string | null;
  /** Human-readable note on where the setting came from (for diagnostics). */
  source: string;
}

let dispatcher: Dispatcher | undefined;
let activeInfo: ProxyInfo = { proxyUrl: null, source: "not configured" };

/** The undici dispatcher to pass to fetch (undefined = direct). */
export function getDispatcher(): Dispatcher | undefined {
  return dispatcher;
}

/** The proxy chosen on the last configureProxy() call, for reporting. */
export function getActiveProxyInfo(): ProxyInfo {
  return activeInfo;
}

/** Strip unresolved "${user_config.x}" placeholders and whitespace. */
function sanitize(v: string | undefined): string {
  const s = (v ?? "").trim();
  return /^\$\{.*\}$/.test(s) ? "" : s;
}

/** Add a scheme if the proxy is a bare host:port. */
function normalize(p: string): string {
  const s = p.trim();
  return /^\w+:\/\//.test(s) ? s : `http://${s}`;
}

function noProxyMatches(host: string): boolean {
  const np = sanitize(process.env.NO_PROXY || process.env.no_proxy);
  if (!np) return false;
  const h = host.toLowerCase();
  return np
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      const suffix = entry.startsWith(".") ? entry : `.${entry}`;
      return h === entry || h.endsWith(suffix);
    });
}

/** Detect the proxy to use for `targetUrl` without applying it. */
export async function detectProxy(targetUrl: string): Promise<ProxyInfo> {
  let host: string;
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    return { proxyUrl: null, source: "direct (invalid URL)" };
  }

  if (noProxyMatches(host)) return { proxyUrl: null, source: "direct (NO_PROXY)" };

  // 1. Standard env vars.
  const env = sanitize(
    process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy
  );
  if (env) return { proxyUrl: normalize(env), source: "HTTPS_PROXY env var" };

  // 2. OS system proxy.
  try {
    if (process.platform === "win32") return await detectWindows(targetUrl);
    if (process.platform === "darwin") return await detectMac(targetUrl);
  } catch (err) {
    return {
      proxyUrl: null,
      source: `direct (system-proxy lookup failed: ${(err as Error).message})`,
    };
  }

  return { proxyUrl: null, source: "direct (no proxy configured)" };
}

/**
 * Detect the proxy for `targetUrl` and install an undici dispatcher for it.
 * Returns the chosen ProxyInfo. Safe to call repeatedly.
 */
export async function configureProxy(targetUrl: string): Promise<ProxyInfo> {
  let info: ProxyInfo;
  try {
    info = await detectProxy(targetUrl);
  } catch (err) {
    info = { proxyUrl: null, source: `direct (detect error: ${(err as Error).message})` };
  }
  activeInfo = info;
  dispatcher = info.proxyUrl ? new ProxyAgent(info.proxyUrl) : undefined;
  return info;
}

// --- Windows ---------------------------------------------------------------

async function regQuery(valueName: string): Promise<string> {
  const key =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  try {
    const { stdout } = await pexec("reg", ["query", key, "/v", valueName], {
      timeout: 4000,
      windowsHide: true,
    });
    return stdout;
  } catch {
    return "";
  }
}

async function detectWindows(targetUrl: string): Promise<ProxyInfo> {
  // Static proxy (only if ProxyEnable == 1).
  const enabled = /ProxyEnable\s+REG_DWORD\s+0x1/i.test(
    await regQuery("ProxyEnable")
  );
  if (enabled) {
    const m = (await regQuery("ProxyServer")).match(/ProxyServer\s+REG_SZ\s+(.+)/i);
    const proxy = m ? pickProxyForHttps(m[1].trim()) : null;
    if (proxy) {
      return { proxyUrl: proxy, source: "Windows system proxy (ProxyServer)" };
    }
  }

  // PAC / auto-config.
  const pm = (await regQuery("AutoConfigURL")).match(
    /AutoConfigURL\s+REG_SZ\s+(.+)/i
  );
  const pacUrl = pm ? pm[1].trim() : "";
  if (pacUrl) {
    const resolved = await resolvePac(pacUrl, targetUrl);
    if (resolved) {
      return { proxyUrl: resolved, source: `Windows PAC auto-config (${pacUrl})` };
    }
    return {
      proxyUrl: null,
      source: `direct (PAC ${pacUrl} returned DIRECT or unsupported)`,
    };
  }

  return { proxyUrl: null, source: "direct (no Windows proxy configured)" };
}

/** Parse a Windows ProxyServer value into a proxy URL for HTTPS traffic. */
function pickProxyForHttps(spec: string): string | null {
  if (spec.includes("=")) {
    // "http=host:port;https=host:port;ftp=..." — prefer https, then http.
    const map: Record<string, string> = {};
    for (const part of spec.split(";")) {
      const [k, ...v] = part.split("=");
      if (k && v.length) map[k.trim().toLowerCase()] = v.join("=").trim();
    }
    const chosen = map["https"] || map["http"];
    return chosen ? normalize(chosen) : null;
  }
  return normalize(spec);
}

// --- macOS -----------------------------------------------------------------

async function detectMac(targetUrl: string): Promise<ProxyInfo> {
  const { stdout } = await pexec("scutil", ["--proxy"], { timeout: 4000 });
  const get = (k: string): string | undefined =>
    stdout.match(new RegExp(`${k}\\s*:\\s*(\\S+)`))?.[1];

  if (get("HTTPSEnable") === "1") {
    const h = get("HTTPSProxy");
    const p = get("HTTPSPort");
    if (h) {
      return {
        proxyUrl: `http://${h}${p ? `:${p}` : ""}`,
        source: "macOS system proxy",
      };
    }
  }
  if (get("ProxyAutoConfigEnable") === "1") {
    const pac = get("ProxyAutoConfigURLString");
    if (pac) {
      const resolved = await resolvePac(pac, targetUrl);
      if (resolved) return { proxyUrl: resolved, source: `macOS PAC (${pac})` };
    }
  }
  return { proxyUrl: null, source: "direct (no macOS proxy configured)" };
}

// --- PAC resolution --------------------------------------------------------

let quickjsModule: Promise<unknown> | undefined;

async function resolvePac(pacUrl: string, targetUrl: string): Promise<string | null> {
  try {
    // The PAC file itself is fetched directly (it's normally on the LAN).
    const res = await fetch(pacUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const pacText = await res.text();

    const { createPacResolver } = await import("pac-resolver");
    const { getQuickJS } = await import("@tootallnate/quickjs-emscripten");
    if (!quickjsModule) quickjsModule = getQuickJS();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qjs = (await quickjsModule) as any;
    const findProxy = createPacResolver(qjs, pacText);
    const answer: string = await findProxy(targetUrl);

    // Answer looks like "PROXY host:port; DIRECT" — take the first usable hop.
    for (const token of answer.split(";").map((s) => s.trim())) {
      if (/^direct$/i.test(token)) return null;
      const m = token.match(/^PROXY\s+(\S+)/i);
      if (m) return normalize(m[1]);
      // SOCKS is not supported by undici ProxyAgent — skip to next token.
    }
  } catch {
    /* fall through to direct */
  }
  return null;
}
