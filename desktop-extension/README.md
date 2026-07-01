# Odoo Connector — Claude Desktop Extension (.mcpb)

The **easiest way for end users to install** the Odoo Connector. Ships as a
single `.mcpb` file with the Node runtime and all dependencies bundled — no
terminal, no config files, no Python/Node install required.

## For end users

1. Download [**`odoo-connector.mcpb`**](https://github.com/eastec-erp/odoo-connector/raw/main/desktop-extension/odoo-connector.mcpb)
   (on the file page, click **Download raw file**).
2. Open **Claude Desktop → Settings → Extensions**.
3. Scroll to **Advanced** and click **Install extension…**, then select the
   downloaded `odoo-connector.mcpb`.
4. Fill in the form — **Odoo URL**, **Username**, **API key** — and click
   **Save**. The API key field is stored securely.
   *(Leave **Database** blank — it's auto-detected.)*
5. In a chat, say **"test my Odoo connection"** (or pick the **setup** prompt).
   Claude runs a staged health check and confirms you're connected — or tells
   you the exact field to fix.

That's it. Claude now has the Odoo tools available.

> Tip: create an Odoo API key at **Settings → Account Security → New API Key**
> and use that instead of your password.

## For maintainers — rebuilding

```bash
./build.sh
```

This compiles the TypeScript server, copies it into `server/`, installs
production dependencies, and packs `odoo-connector.mcpb`.

The bundle is defined by [`manifest.json`](manifest.json): the `user_config`
block declares the four fields shown in the install form, which are mapped to
`ODOO_*` environment variables for the server process.

## Distributing

`odoo-connector.mcpb` is **committed to the repo** so it can be shared as a
direct download link (no GitHub Release needed — GitHub Desktop can push it like
any other file). After running `./build.sh`, commit the updated bundle. The
public download link is:

```
https://github.com/eastec-erp/odoo-connector/raw/main/desktop-extension/odoo-connector.mcpb
```

> The repository must be **public** for others to download this link.
>
> Alternative: attach the `.mcpb` to a **GitHub Release** instead and share
> `.../releases/latest/download/odoo-connector.mcpb`. That keeps binaries out of
> Git history, but can't be done from GitHub Desktop (use the web UI or `gh`).
