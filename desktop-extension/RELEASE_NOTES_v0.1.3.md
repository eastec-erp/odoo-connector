Automatic corporate-proxy support, plus clearer network diagnostics.

## Highlights

- **Works behind a corporate proxy automatically.** If the machine reaches the
  internet through a proxy, the connector now detects and uses it — no
  configuration needed. Fixes `fetch failed` on networks where the browser can
  reach Odoo but the connector couldn't.
- **Proxy detection order:** `HTTPS_PROXY`/`HTTP_PROXY` env → Windows system
  proxy (static `ProxyServer` and PAC auto-config) → macOS system proxy → direct.
- **Better diagnostics.** `test_connection` now reports the detected proxy, and
  an unreachable server shows the underlying cause (DNS / TLS / refused) instead
  of a bare "fetch failed".

## Install (Claude Desktop)

1. Download **`odoo-connector.mcpb`** from the Assets below.
2. Open **Claude Desktop → Settings → Extensions**.
3. Scroll to **Advanced** and click **Install extension…**, then select the
   downloaded `odoo-connector.mcpb`.
4. Fill in your **Odoo URL**, **username**, and **API key**
   (leave **Database** and **HTTPS proxy** blank — both are auto-detected).
   Click **Save**.
5. **Fully quit and reopen Claude Desktop** (⌘Q / Alt+F4 — not just the window),
   so it loads the new version.
6. In a chat, say **"test my Odoo connection"**.

> Tip: create an Odoo **API key** at Settings → Account Security → New API Key
> and use that instead of your password.

## Corporate networks

- Auto-detection covers the common cases. To **override**, set the optional
  **HTTPS proxy** field, e.g. `http://proxy.company.com:8080`.
- If the proxy does **TLS interception** (a `CERT_*` /
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` error), Node needs the corporate root CA:
  set `NODE_EXTRA_CA_CERTS` to the CA `.pem` path (IT can provide it).

## Upgrading from an earlier version

Uninstall the old extension, **fully quit Claude Desktop**, then install this
`.mcpb`. A full restart is required — updating files alone doesn't restart the
extension's background process.

## Requirements

- Claude Desktop with Extensions support.
- An Odoo instance reachable over HTTPS with external API access enabled
  (Odoo Online / *.odoo.com works out of the box).
