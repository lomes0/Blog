# Content MCP server

Exposes this blog's Prisma/Lexical content to **Claude Code** as MCP tools, so
Claude can list, read, create, and update posts from the terminal.

Personal, single-user use: everything is scoped to one author (`MCP_AUTHOR_ID`),
and it authenticates to Claude via your normal Claude Code login — no API key.

## How it works

Posts are stored as Lexical editor-state JSON in `Revision.data`, not files. The
server runs a **headless Lexical editor** in Node (`@lexical/headless`) and reuses
the app's own `TRANSFORMERS` to convert:

```
Revision.data (Lexical JSON)  <->  Markdown  (what Claude reads/writes)
```

`bootstrap.mjs` must load first: the editor's custom nodes import browser-only
libraries (e.g. `mathlive`), so it installs a minimal DOM shim and neutralizes
`.css` imports. It deliberately leaves `window` undefined so the nodes'
`typeof window` guards short-circuit their browser-only side effects.

## Tools

| Tool | Purpose |
|------|---------|
| `list_posts`  | List the author's posts (id, title, series, published, updated) |
| `read_post`   | One post's content as Markdown |
| `create_post` | New post from Markdown (optionally in a series) |
| `update_post` | Replace a post's body from Markdown (new revision) |
| `list_series` | List the author's series |

**Fidelity:** prose, headings, lists, code, links, inline **math**, images,
graphs and sketches round-trip cleanly (the app has Markdown transformers for
them). Content Markdown can't represent — layout columns, attachments, tables,
kanban, collapsible/details — is registered so `read_post` still works, but
`update_post` **refuses** to overwrite such a post to avoid silent data loss.

Every write is saved as a new `Revision` with `Document.head` advanced, so full
version history is preserved.

## Configuration

Registered in `.mcp.json` at the repo root. Set the author:

- `MCP_AUTHOR_ID` — a `User` id or email. Set in `.mcp.json`'s `env`.
- `DATABASE_URL` — loaded from `.env` via `--env-file`.

## Testing

```bash
# read-only end-to-end check against the DB
MCP_AUTHOR_ID=you@example.com npm run mcp:smoke
```
