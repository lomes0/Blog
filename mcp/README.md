# Content MCP server

Exposes this blog's Prisma/Lexical content to **Claude Code** as MCP tools, so
Claude can navigate, read, write and create posts from the terminal.

Personal, single-user use: everything is scoped to one author (`MCP_AUTHOR_ID`),
and it authenticates to Claude via your normal Claude Code login — no API key.

**To actually use it, start with
[docs/guides/claude-code-content.md](../docs/guides/claude-code-content.md)** —
setup and the caveats. How to drive the tools is in their own descriptions in
`content-server.ts`, which the agent already has; this file is the design
rationale.

## How it works

Posts are stored as Lexical editor-state JSON in `Revision.data`, not files.
Claude addresses that JSON **by block** rather than round-tripping it through
Markdown — see [docs/plans/claude-code-lexical.md](../docs/plans/claude-code-lexical.md).

```
outline(id)          ->  b1  heading[1]  "Gradient descent, revisited"
                         b2  paragraph   "The usual derivation starts from…"
                         b3  kanban      3 lanes · 11 cards   [read-only]
                         …plus a stateHash

apply_ops(id, hash, [{op:"set_text", id:"b2", text:"…"}])
```

The applier touches only the blocks an op names, so **anything Claude did not
mention comes out byte-identical**. That is where losslessness comes from — not
from the format covering every node type. Block types with no codec (kanban,
math, image, table, graph, …) are still listed, addressable, movable and
deletable; they just cannot be rewritten. Under the old Markdown transport they
were simply absent from what Claude saw, with nothing to say they had been
there. The outline marks the difference: `[read-only]` has no codec at all,
`[replace only]` can be replaced but has no single text field for `set_text`.

Across this blog's stored content, 93.2% of addressable blocks read as a typed
block rather than an opaque descriptor, and **every content-bearing type has a
codec** — the only opaque blocks left are table rows and layout columns, which
are pure structure. Tables are addressed down to individual cells, so `set_text`
edits one cell and leaves the rest of the grid alone.

`stateHash` is a hash of the document's content, and it does double duty: it
detects that someone else wrote, *and* certifies that the addresses still point
where they pointed. `Document.head` cannot do that job, because the editor folds
a run of autosaves into one revision id and rewrites it in place.

All of the logic lives in `src/lib/content-bridge/` and is plain JSON
manipulation — no DOM, no `@lexical/headless`, no editor node classes. That is
why this server no longer needs a DOM shim or a `.css` loader hook, and why a
new node class touching browser APIs at import can no longer break it.

## Tools

| Tool | Purpose |
|------|---------|
| `list_posts`   | List the author's posts (id, title, series, published, updated) |
| `list_series`  | List the author's series |
| `outline`      | Block skeleton + `stateHash`. **Start here** — addresses come from it |
| `read_blocks`  | Full content of specific blocks, by address |
| `read_post`    | The whole post as nested blocks (short documents only) |
| `search`       | Block-level text hits across posts, with addresses |
| `apply_ops`    | Edit by block, all-or-nothing, guarded by `stateHash` |
| `create_post`  | New post from blocks — real code nodes and lists, not fenced Markdown |

Authorable block types are paragraph, heading, quote, code, list, divider,
details, layout, table, cell, kanban, attachment and summary. A table's cells
are plain strings in the common case — `[["Name","Count"],["apples","3"]]` —
with an object form for headers and spans. Lists nest through
`item.sublist = {listType, items}`; indent is derived from the nesting, not
supplied. For `layout` and `details`, the
nested `columns`/`body` are required when inserting a new one and optional when
replacing — omit them to keep the contents already there. Inline formatting
inside a block's `text` uses `**bold**`, `__italic__`, `` `code` ``,
`~~strike~~`, `==highlight==`, `++underline++`, `^^sup^^`, `,,sub,,`,
`[link](url)` and `$latex$` — italic is `__` rather than `*` so that no
delimiter is a prefix of another.

Every write is saved as a **new** `Revision` with `Document.head` advanced, so
history is preserved and you can diff an agent edit against what came before.

## Content only, by decision

The in-app Copilot has these tools *and* one generated from every command in
`src/commands/` — open a pane, focus a tab, rename, set a theme. This server
has none of them, and that is the boundary rather than a backlog: almost every
one of those commands acts on the **browser's** workspace, and a stdio server
has no session to perform it against. Exposing them would ship tools that fail.
`get_selection` is the same argument in miniature — there is no cursor in a
terminal.

So the two surfaces are not drifting towards each other. They meet at content,
which is why `src/lib/content-bridge/` is shared and the command registry is
not. If Claude Code ever needs to drive the running app, that is a channel from
this server to a live session — a feature with its own plan, not a matter of
registering more tools here. See
[docs/plans/ai-surface-consolidation.md](../docs/plans/ai-surface-consolidation.md)
§4.3.

Parity runs the other way too: `list_series` above exists in both, because
enumerating series is content, and the Copilot was missing it.

## Configuration

Registered in `.mcp.json` at the repo root. Set the author:

- `MCP_AUTHOR_ID` — a `User` id or email. Set in `.mcp.json`'s `env`.
- `DATABASE_URL` — loaded from `.env` via `--env-file`.

## Testing

The bridge itself is covered by `src/lib/content-bridge/__tests__/` and needs no
database. This exercises the server end to end against real content:

```bash
# read-only unless RUN_WRITE=1
MCP_AUTHOR_ID=you@example.com npm run mcp:smoke
```
