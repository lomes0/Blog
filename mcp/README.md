# Content MCP server

Exposes this blog's Prisma/Lexical content to **Claude Code** as MCP tools, so
Claude can navigate, read, write and create posts from the terminal.

Personal, single-user use: everything is scoped to one author (`MCP_AUTHOR_ID`),
and it authenticates to Claude via your normal Claude Code login — no API key.

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
there.

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

Authorable block types are paragraph, heading, quote, code and list. Inline
formatting inside a block's `text` uses `**bold**`, `__italic__`, `` `code` ``,
`~~strike~~`, `==highlight==`, `++underline++`, `^^sup^^`, `,,sub,,`,
`[link](url)` and `$latex$` — italic is `__` rather than `*` so that no
delimiter is a prefix of another.

Every write is saved as a **new** `Revision` with `Document.head` advanced, so
history is preserved and you can diff an agent edit against what came before.

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
