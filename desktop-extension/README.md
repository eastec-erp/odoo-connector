# Odoo Connector — Claude Desktop Extension (.mcpb)

The **easiest way for end users to install** the Odoo Connector. Ships as a
single `.mcpb` file with the Node runtime and all dependencies bundled — no
terminal, no config files, no Python/Node install required.

## For end users

1. Download **`odoo-connector.mcpb`** from the
   [latest release](https://github.com/eastec-erp/odoo-connector/releases/latest).
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

`odoo-connector.mcpb` is distributed via **GitHub Releases** — it is a build
artifact and is *not* committed to the repo. To cut a release:

1. `./build.sh` to produce a fresh `odoo-connector.mcpb`.
2. Create a release (repo → Releases → new), tag e.g. `v0.1.0`, and **attach**
   the `.mcpb` as a binary. Leave "pre-release" unticked so it counts as latest.
3. Publish. The stable download link is:

```
https://github.com/eastec-erp/odoo-connector/releases/latest/download/odoo-connector.mcpb
```

> The repository must be **public** for others to use this link.
>
> Note: uploading a release asset can't be done from GitHub Desktop — use the
> web UI, or `gh release create <tag> odoo-connector.mcpb`.
