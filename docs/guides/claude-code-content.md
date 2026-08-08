# Editing blog content from Claude Code

Claude Code can navigate, read, write and create posts in this blog directly,
through an MCP server that exposes the Prisma/Lexical content as tools.

**This page is setup and caveats only.** How to drive the tools — block
addressing, the outline → read → write loop, the authorable block types, the
inline markup, what each refusal means — lives in the tool descriptions in
`mcp/content-server.ts`, which are in the agent's context whenever the server is
connected. Documenting it twice here would only give it somewhere to rot. For
_why_ content is addressed by block rather than by Markdown, see
[mcp/README.md](../../mcp/README.md) and
[docs/plans/claude-code-lexical.md](../plans/claude-code-lexical.md).

---

## Setup

### 1. A working database

The server talks straight to Postgres — no dev server, no HTTP API. You need
`DATABASE_URL` in `.env` and a database that is actually up. Check what is
already on 5432 before starting anything (see CLAUDE.md):

```bash
docker ps
pg_isready -h localhost -p 5432
```

### 2. Name the author

Everything is scoped to one user. Set `MCP_AUTHOR_ID` in `.mcp.json` at the repo
root — a `User` id or an email:

```jsonc
{
  "mcpServers": {
    "blog-content": {
      "command": "node",
      "args": ["--import", "tsx", "--env-file=.env", "mcp/content-server.ts"],
      "env": { "MCP_AUTHOR_ID": "you@example.com" }
    }
  }
}
```

Find yours with `npx prisma studio` if you are not sure.

The server never reads or writes another author's content: every query is
filtered on `authorId`. That is the whole authorization model — it is built for
personal, single-user use.

### 3. Start Claude Code from the repo root

`.mcp.json` is picked up per project directory, so launch `claude` from
`/…/blog-simple`. On first run it asks you to approve the server. Afterwards
`/mcp` should list **blog-content** as connected, with eight tools. If it
doesn't, run the server by hand to see the error — a missing `DATABASE_URL` or
an `MCP_AUTHOR_ID` matching no user both fail loudly at startup:

```bash
npm run mcp:server
```

### 4. Verify end to end (optional)

```bash
npm run mcp:smoke              # read-only
RUN_WRITE=1 npm run mcp:smoke  # also creates a throwaway post and edits it
```

The write path only touches the post it just created. It also exercises the
stale-`stateHash` refusal, which is the guard everything else rests on — it
prints the refusal rather than failing on it, so read the output.

---

## Caveats the tools cannot state themselves

**Only cloud content is visible.** The server reads Postgres. Documents living
in browser IndexedDB — anything created while signed out — never reach it. Those
are reachable only from the in-app Copilot, which runs the same bridge
client-side.

**Careful with a post open in the editor.** `apply_ops` writes a pending
proposal, and the `stateHash` guard covers only the state the agent read — it
cannot see a browser tab holding older content, which can autosave over the
document and leave the proposal unapprovable. Reload the editor after an agent
edit rather than leaving both live.

**Attachments cannot be uploaded.** An `attachment` block can only reference a
URL that already exists.

**Posts can be created but not deleted**, by design — one you regret has to be
removed from the app. Creates land unpublished; publish from the app.

---

## Where the code is

| Path                                        | What                                                             |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `mcp/content-server.ts`                     | The MCP server: tool definitions, Prisma reads, revision writes  |
| `mcp/smoke.ts`                              | End-to-end check against the live database                       |
| `src/lib/content-bridge/`                   | Addressing, codecs, ops applier, `stateHash` — pure JSON, no DOM |
| `src/editor/utils/copilotAgentExecutors.ts` | The same bridge, driving the in-app Copilot                      |

The bridge is covered by `src/lib/content-bridge/__tests__/` and needs no
database; `npm run mcp:smoke` is what covers the server.
