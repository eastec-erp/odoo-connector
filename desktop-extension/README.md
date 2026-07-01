# Odoo Connector — Claude Desktop Extension (.mcpb)

The **easiest way for end users to install** the Odoo Connector. Ships as a
single `.mcpb` file with the Node runtime and all dependencies bundled — no
terminal, no config files, no Python/Node install required.

## For end users

1. Download [**`odoo-connector.mcpb`**](https://github.com/eastec-erp/odoo-connector/releases/latest/download/odoo-connector.mcpb).
2. Open **Claude Desktop → Settings → Extensions**.
3. Drag the file in (or double-click it).
4. Fill in the form — **Odoo URL**, **Database**, **Username**, **API key** —
   and click **Save**. The API key field is stored securely.
   *(Database is optional — leave it blank to auto-detect.)*
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

Attach `odoo-connector.mcpb` to a **GitHub Release** — that's the download link
you share. The file is a build artifact and is not committed to the repo. The
stable link that always points at the newest release's asset is:

```
https://github.com/eastec-erp/odoo-connector/releases/latest/download/odoo-connector.mcpb
```

> **Note:** for others to download this, the repository (or at least the
> release) must be **public**. A private repo's release assets are only
> reachable by users with repo access.
