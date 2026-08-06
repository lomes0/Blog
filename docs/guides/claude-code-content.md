# Editing blog content from Claude Code

Claude Code can navigate, read, write and create posts in this blog directly,
through an MCP server that exposes the Prisma/Lexical content as tools. This
page is the usage guide: how to switch it on, and how to drive it.

For *why* it addresses content by block rather than by Markdown, see
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

Find yours if you are not sure:

```bash
npx prisma studio          # browse the User table
```

The server never reads or writes another author's content: every query is
filtered on `authorId`. That is the whole authorization model — it is built for
personal, single-user use.

### 3. Start Claude Code from the repo root

`.mcp.json` is picked up per project directory, so launch `claude` from
`/…/blog-simple`. On first run it asks you to approve the server. After that:

```
/mcp
```

should list **blog-content** as connected, with eight tools. If it doesn't,
run the server by hand to see the error — a missing `DATABASE_URL` or an
`MCP_AUTHOR_ID` matching no user both fail loudly at startup:

```bash
npm run mcp:server
```

### 4. Verify end to end (optional)

```bash
npm run mcp:smoke              # read-only
RUN_WRITE=1 npm run mcp:smoke  # also creates a throwaway post and edits it
```

The write path only touches the post it just created. It also asserts that a
stale `stateHash` is refused, which is the guard everything else rests on.

---

## The read → write cycle

Documents are Lexical JSON, not files, so there is no "open the file, edit the
text" step. The loop is always the same three moves:

```
1. outline(id)            → block addresses + a stateHash
2. read_blocks(id, [...]) → the bodies you actually need
3. apply_ops(id, hash, [...]) → edits naming those addresses
```

**Always start with `outline`.** It is one line per block, so scanning a long
article costs a fraction of reading it, and it is the only thing that hands out
addresses:

```
"Gradient descent, revisited"
stateHash: h_3f2ab9c14d0e7712

b1         heading[1]      Gradient descent, revisited  (27 chars)
b2         paragraph       The usual derivation starts from…  (284 chars)
b3         kanban          3 lanes · 11 cards  [read-only]
b4         list[check]     5 items, 2 levels · Check the Hessian
```

Then edit by address, passing back the `stateHash` from the read those
addresses came from:

```jsonc
{
  "id": "…",
  "stateHash": "h_3f2ab9c14d0e7712",
  "ops": [
    { "op": "set_text", "id": "b2", "text": "The usual derivation starts from the **chain rule**." },
    { "op": "insert_blocks", "after": "b2", "blocks": [
      { "type": "paragraph", "text": "A worked example follows." }
    ] }
  ]
}
```

Ops apply **all-or-nothing**, and blocks you do not name are left byte-identical
— including ones the bridge cannot express at all. Every write lands as a new
`Revision` with `head` advanced, so you can diff an agent edit against what came
before.

In practice you just ask for what you want in English ("tighten the third
section of the gradient descent post") and Claude runs this loop itself. The
mechanics matter when something is refused.

---

## Tools

| Tool           | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `list_posts`   | The author's posts — id, title, handle, series, published, updated |
| `list_series`  | The author's series                                                |
| `outline`      | Block skeleton + `stateHash`. **Start here**                       |
| `read_blocks`  | Full content of specific blocks, by address                        |
| `read_post`    | The whole post as nested blocks — short documents only             |
| `search`       | Block-level text hits across posts, each with an address           |
| `apply_ops`    | Edit by block, all-or-nothing, guarded by `stateHash`              |
| `create_post`  | New post from blocks — real code nodes and lists, not fenced Markdown |

Ops accepted by `apply_ops`: `set_text{id,text}`, `replace_block{id,block}`,
`insert_blocks{blocks, after|before|appendTo}`, `delete_block{id}`,
`move_block{id, after|before|appendTo}`.

---

## Writing blocks

Authorable types: `paragraph`, `heading`, `quote`, `code`, `list`, `divider`,
`details`, `summary`, `layout`, `table`, `cell`, `kanban`, `attachment`.

```jsonc
{ "type": "heading", "level": 2, "text": "Setup" }
{ "type": "code", "language": "ts", "code": "const x = 1;" }
{ "type": "list", "listType": "check",
  "items": [{ "text": "first", "checked": true,
              "sublist": { "listType": "bullet", "items": [{ "text": "nested" }] } }] }
{ "type": "table", "headerRow": true,
  "rows": [["Name", "Count"], ["apples", "3"]] }
```

Nesting is structural — indent is derived from it, never supplied. Table cells
are plain strings in the common case, with an object form
(`{text, header, colSpan, rowSpan}`) for headers and spans.

Inline formatting inside any `text` field:

| Markup            | Result    |     | Markup           | Result     |
| ----------------- | --------- | --- | ---------------- | ---------- |
| `**bold**`        | bold      |     | `++underline++`  | underline  |
| `__italic__`      | italic    |     | `^^sup^^`        | superscript |
| `` `code` ``      | code      |     | `,,sub,,`        | subscript  |
| `~~strike~~`      | strike    |     | `[text](url)`    | link       |
| `==highlight==`   | highlight |     | `$latex$`        | math       |

Italic is `__`, not `*`, so that no delimiter is a prefix of another.

For `layout`, `details` and `table`, the nested `columns`/`body`/`rows` are
**required when inserting** a new one and **optional when replacing** — omit
them to keep the contents already there.

---

## Things that will trip you up

**"The document changed since it was read."** The `stateHash` guard fired: the
addresses in the write may no longer point where they did. Re-run `outline` and
retry with the fresh hash. Note that `apply_ops` returns the new outline and
hash, so a follow-up edit needs no extra read.

**`[read-only]` blocks.** Math as a block, images, graphs, sketches, canvases
and sticky notes have no codec. They are visible, addressable, movable and
deletable — but not rewritable. `[replace only]` means `replace_block` works but
`set_text` does not, because the block has no single text field.

**A block that "carries inline formatting the bridge cannot express."**
Something inside it (an inline colour, say) has no spelling in the inline
markup. `set_text` refuses rather than flatten it; use `replace_block` if you
mean to overwrite it deliberately.

**Only cloud content is visible.** The server reads Postgres. Documents living
in browser IndexedDB — anything created while signed out — never reach it. Those
are reachable only from the in-app Copilot, which runs the same bridge
client-side.

**Attachments cannot be uploaded.** An `attachment` block can only reference a
URL that already exists.

**`create_post` creates unpublished.** Publish from the app.

**Careful with a post open in the editor.** An agent write creates a new
revision, but a browser tab holding the older state can autosave over it.
Reload the editor after an agent edit rather than leaving both live.

---

## Where the code is

| Path                             | What                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `mcp/content-server.ts`          | The MCP server: tool definitions, Prisma reads, revision writes |
| `mcp/smoke.ts`                   | End-to-end check against the live database                   |
| `src/lib/content-bridge/`        | Addressing, codecs, ops applier, `stateHash` — pure JSON, no DOM |
| `src/editor/utils/copilotAgentExecutors.ts` | The same bridge, driving the in-app Copilot        |

The bridge is covered by `src/lib/content-bridge/__tests__/` and needs no
database; `npm run mcp:smoke` is what covers the server.
