# Claude Code Integration

How Claude edits this blog's content. Two agents — Claude Code in the terminal
and the in-app Copilot — sit on one shared layer, `src/lib/content-bridge/`,
which addresses a Lexical document **by block**. Nothing converts documents to
Markdown files any more.

This is the architecture. For _how to set it up_ see
[guides/claude-code-content.md](../guides/claude-code-content.md) (driving it is
documented in the tool descriptions themselves); for _why it is shaped this way_
see [plans/archive/claude-code-lexical.md](../plans/archive/claude-code-lexical.md) and
[mcp/README.md](../../mcp/README.md).

---

## Map

```
Claude Code (terminal)                    In-app Copilot (browser)
   │ stdio        │ HTTP                          │
   ▼              ▼                               ▼
mcp/           /api/mcp                  /api/copilot  (declares tool
content-       ├─ agent token            │  schemas only — no execute)
server.ts      ├─ scopes, budgets        │
   │           └─ TLS or loopback        ▼
   └──────┬───────┘                     copilotAgentExecutors.ts (client)
          ▼                              ├─ reads auto-run
   src/lib/mcp/server.ts                 ├─ writes = reviewable proposals
   ├─ 10 tools, scoped to one author     └─ virtualRepo.ts: Redux + IndexedDB
   └─ Prisma direct: no dev server                  │
          │                                         │
          └──────────────┬──────────────────────────┘
                         ▼
            src/lib/content-bridge/     ← pure JSON, no DOM, no Lexical
            address · blockId · blocks · inline · ops · outline · stateHash
                         │
                         ▼
            Revision.data  (Lexical editor-state JSON)
            Document.head  (which revision is current)
```

The bridge is the whole integration. Both agents get the same addressing, the
same ops, the same guard; the three doors differ only in transport, in how they
decide whose content it is, in what content they can see, and in whether a write
needs human acceptance.

---

## Storage model it operates on

A post's body is not a file. It is Lexical editor-state JSON in `Revision.data`,
and `Document.head` names the revision that is current. The bridge reads and
writes that JSON directly — never through node classes, never through a headless
editor.

That choice is load-bearing:

1. **Preservation is literal.** An untouched subtree is the same object, so "a
   block nobody named comes out byte-identical" is true by construction rather
   than by trusting a round-trip.
2. **No DOM, no node registry.** A new node class that touches `document` at
   import time cannot break the MCP server. There is no shim and no `.css`
   loader hook.
3. **One implementation.** The same module runs in Node and in the browser, and
   is testable in vitest's default `node` environment.

The cost: nodes minted by a codec are hand-built, so **every codec owes a
round-trip spec** (plan §4.6.1, enforced by `__tests__/codecs.test.ts`).

---

## The bridge, module by module

| Module         | Responsibility                                                                         |
| -------------- | -------------------------------------------------------------------------------------- |
| `address.ts`   | Structural addresses — `b3`, `b4.2` — minted per read, never stored                    |
| `blockId.ts`   | Optional persistent ids (`blk_…`) in Lexical `NodeState` under the reserved `$` key    |
| `blocks.ts`    | The codecs: `nodeToBlock` / `blockToNode`, plus `describeNode` for types with no codec |
| `containers.ts`| Where a container keeps its children when they are not at `children` — a sticky's and a nested doc's editor, a canvas's notes, an image's caption |
| `inline.ts`    | Inline runs ↔ restricted Markdown (`**bold**`, `__italic__`, `$latex$`, …)             |
| `ops.ts`       | `applyOps` — snapshot addressing, all-or-nothing, touch only what is named             |
| `outline.ts`   | `outline` / `readBlocks` / `readAll` — the cheap skeleton and the targeted reads       |
| `stateHash.ts` | The freshness token every write carries                                                |

### Addressing

`BLOCK_CONTAINERS` in `address.ts` is an **allowlist** of structural containers
(`root`, layout, details, table, table row, code snippet, sticky, nested doc,
canvas, canvas note). An unrecognised node is therefore one opaque block —
addressable, movable, preserved — rather than something the walker descends into
and mints addresses for children no codec understands.

**A container's children are not always at `children`.** A sticky note and a
nested doc keep a whole serialized editor; a canvas keeps `notes`, an array of
frames that carry no `type` of their own. `containers.ts` is the one module that
knows where each keeps them, so the address scheme does not have to: a canvas is
`b2`, its second note `b2.2`, and that note's first paragraph `b2.2.1` — the
same two levels a table descends, for the same reason. Every arm returns the
**live** array rather than a copy, because `ops.ts` splices what it is handed
and a copy would leave every read correct while writes landed nowhere
(`__tests__/canvas.test.ts` asserts array identity, not equality).

This is what made the three inline decorators reachable at all
([nested-editor-support.md](../plans/nested-editor-support.md)). `CanvasNode`,
`ImageNode` and `StickyNode` were `isInline()` by inheritance and were wrapped
in a paragraph on insert, so they sat *inside* a block and had no address to
descend from — the seam existed and could not fire. They are block-level now, a
node transform unwraps anything that predates the change, and
`pnpm nodes:unwrap` rewrote the stored revisions (259 wrapper paragraphs across
5 documents, 0 skipped).

Two spellings coexist in one document. A document no agent has touched is
addressed by path; a write **stamps persistent ids on the blocks it touched
only** (`stampBlockIds(state, only)`). Stamping everything would break
byte-identity for untouched blocks and bury a one-paragraph edit inside a
200-block restamp. Reads never stamp — a read that mutated would change the
document's own hash and refuse the very next write.

### The `[read-only]` / `[replace only]` ladder

`formatOutline` marks each block so a caller learns the limit up front instead
of by having a write refused:

- **plain** — `set_text` works: paragraph, heading, quote, summary, cell, code.
- **`[replace only]`** — no single text field, so it is rewritten whole with
  `replace_block`: list, table, layout, details, kanban, image. An image's
  `caption` is a codec **field** alongside `alt` and `src`, not addressable
  children — the split is between content that is *about* a block and content
  that *is* a document (`plans/archive/haklex-reprise.md` §2.4).
- **`[read-only]`** — no codec at all: math-as-a-block, graph, sketch, iframe,
  and the pure containers (canvas, canvas note, table row, layout item).
  Readable, addressable, movable, deletable, never rewritten.

`[read-only]` is a claim about the block itself, not about its interior. A
canvas refuses `replace_block` and always will — it is structure, and
`scripts/check-codecs.mjs` records why — while the paragraphs inside its notes
are ordinary text blocks that `set_text` edits like any other.

Losslessness comes from **addressing, not format coverage**. The IR never has to
be able to express a kanban board for one to survive an edit.

### Ops

`applyOps(state, expectedHash, ops)` supports `set_text`, `replace_block`,
`insert_blocks`, `delete_block`, `move_block`. Two properties:

- **All-or-nothing.** A batch that fails anywhere writes nothing.
- **Snapshot addressing.** Every address resolves against the state the batch
  was written against, not the half-mutated tree — targets are resolved to node
  references up front and positions recomputed at apply time. So `b5` still
  means what it meant in the read even if an earlier op in the same batch
  deleted `b2`.

---

## Concurrency: two guards, at different layers

The document can be written by an editor tab and by an agent at the same time.
Neither guard alone is enough.

**1. `stateHash` — do these addresses still point where they pointed?** A
content hash of the state (`stateHash.ts`), returned by every read and required
by every write. `Document.head` cannot do this job: the editor folds a run of
autosaves into one revision by re-posting its id, so `Revision.data` moves while
`head` stays put. A mismatch throws `StaleStateError`; the caller re-reads.
`apply_ops` returns the new outline and hash, so a follow-up edit needs no extra
round trip.

**2. Compare-and-set on `head` — did someone commit first?** `stateHash` is
checked in-process against a state read moments earlier, so a save landing in
that window would simply be overwritten. The guard has to be in the database:

- `updateDocument(handle, data, expectedHead)` (`repositories/document.ts`) —
  `undefined` writes unconditionally (a rename or publish toggle is not racing
  anyone); any other value, including `null` for "no revision yet", makes the
  write conditional. `updateMany` carries the guard because `head` is not unique
  and `update`'s `where` will not take it; it takes scalars only, so nested
  `revisions`/`coauthors` writes are split off and replayed inside the same
  transaction on the row the guard has already locked. A miss throws
  `StaleHeadError`, which `PATCH /api/documents/[id]` answers as **409**.
- **An agent write does not move `head` at all**, so there is nothing for it to
  guard at write time — that is what gating changed. The compare-and-set moved
  to *approval*: `proposeOps` records the head it read as the proposal's
  `baseRevisionId`, and approving does `where: { id, head: expectedHead }` with
  that value (`repositories/revision.ts`), never "whatever head is now". An
  editor save landing between `outline` and `apply_ops` therefore does not
  refuse the proposal; it makes it **stale**, and the next batch replaces it
  rather than folding onto something approval could only reject.
- The editor (`useSave.ts`) sends the head its **last successful save** wrote —
  not the head at load, because autosave mints a fresh revision id every
  `REVISION_SESSION_MS`. On a 409 it stops retrying (every retry would be
  refused identically), keeps buffering into `pendingSaves` so nothing typed
  after the conflict is lost, and lets the store announce the server's wording.
- `Failure` (`store/thunks/createApiThunk.ts`) carries `statusCode`, because a
  409 is a fact the editor acts on rather than text to display. `expectedHead`
  is a precondition, not a column — `store/backend/local.ts` strips it before
  persisting, and IndexedDB has one writer so there is no race to guard there.

> The database behaviour is verified; the browser pass — what the conflict looks
> like on screen — is still owed. See
> [claude-code-backlog.md](../plans/claude-code-backlog.md) §1.

Every agent write lands as a **new** `Revision` with `head` advanced, so history
is preserved and an agent edit can be diffed against what came before. Agent
writes are deliberately never folded into the editor's open revision.

---

## Entry point 1 — MCP server (`src/lib/mcp/server.ts`)

Registered in `.mcp.json` at the repo root; Claude Code picks it up per project
directory, so `claude` must be launched from the repo root. It runs
`node --import tsx --env-file=.env mcp/content-server.ts` over stdio and talks
**straight to Postgres** — no dev server, no `/api/*`.

The ten tools and the transport are separate files, which is what let a second
door be added without touching a tool (docs/plans/archive/mcp-support.md):
`createContentServer({ resolveAuthorId })` in `src/lib/mcp/server.ts` knows
nothing about processes or the environment, and `mcp/content-server.ts` is only
the ~50 lines that resolve `MCP_AUTHOR_ID` and connect stdio.

**Authorization is one line of policy:** everything is filtered on whatever
`resolveAuthorId` returns — under stdio, the user named by `MCP_AUTHOR_ID` (a
`User` id or email, resolved before the transport connects, so a bad value is a
startup error). No tool takes an author from its arguments, so the server cannot
read or write another author's content. This is personal, single-user tooling;
there is no session and no API key.

### The same tools over HTTP — `POST /api/mcp`

The remote door, for a machine with no checkout. It builds the same server per
request, with three things stdio does not have, because its caller is not
already inside the machine:

| | stdio | `/api/mcp` |
| --- | --- | --- |
| Who you are | `MCP_AUTHOR_ID` | the owner of the presented `AgentToken` |
| What you may do | everything | the token's `scopes` — six tools for `read`, eight with `propose`, ten with `manage` |
| What you may spend | unmetered | three token-bucket budgets, and a 1 MiB body |
| Transport | a pipe | HTTPS, or 426 (loopback and `MCP_ALLOW_INSECURE=1` excepted) |
| Origin recorded | `claude-code` | `claude-code:<token name>` |

Stateless: no session id, a server per request, closed when the request ends.
Nothing about the author is module state, so two requests carrying two tokens
cannot see each other's content — which is the property
`src/lib/mcp/__tests__/server.test.ts` exists to pin.

`tokenRoute` (`src/lib/api-utils.ts`) is a fourth route wrapper rather than a
`publicRoute` with a check inside it, so `grep -rn "publicRoute" src/app/api`
stays the complete list of unauthenticated surfaces.

| Tool          | Purpose                                                               |
| ------------- | --------------------------------------------------------------------- |
| `list_posts`  | The author's posts — id, name, handle, series, published, updated     |
| `list_series` | The author's series                                                   |
| `outline`     | Block skeleton + `stateHash`. **Start here** — addresses come from it |
| `read_blocks` | Full content of named blocks                                          |
| `read_post`   | The whole post as nested blocks — short documents only                |
| `search`      | Block-level text hits across posts, each with an address              |
| `apply_ops`   | Edit by block, all-or-nothing, guarded by `stateHash`                 |
| `create_post` | New post from blocks — real code nodes and lists, not fenced Markdown |
| `rename_post` | Propose a new title. Waits for approval — `propose` scope |
| `delete_post` | Delete a post and its history. **Irreversible** — `manage` scope |

`delete_post` is the one write that is not a proposal: it lands on the live post
the moment it is called, and `Document` has no `deletedAt`, so it takes the
revision history with it. Hence the separate `manage` scope, which no default
grants, and hence the tool refusing unless it is passed the post's exact title
as `confirm` — aimed at acting on the id next to the one you meant, not at an
agent that has decided to be destructive.

`rename_post` was in that scope until renames became reviewable
(docs/plans/claude-code-backlog.md §8). A proposed title now lands in
`Document.pendingTitle` and the post keeps its own until the author approves it
from the same rail a content proposal is answered on — separate columns,
separate buttons, so approving an edit never carries a rename with it and
rejecting one leaves the other pending.

`search` walks every post's head revision in JS. Fine at one author's scale; if
it gets slow, prefilter in SQL on the revision JSON before walking.

Tool input schemas are zod, converted to JSON Schema by the MCP SDK. Recursive
shapes (nested lists, layout columns, details bodies, table rows) are typed
loosely there and validated by the codec, because a lazy zod schema does not
survive that conversion.

`pnpm mcp:smoke` exercises the server end to end against real content —
read-only unless `RUN_WRITE=1`, in which case it also creates a throwaway post
and confirms the stale-`stateHash` refusal.

---

## Entry point 2 — in-app Copilot

Same bridge, different plumbing. Tools are **declared** on the server
(`/api/copilot/route.ts` — schemas only, no `execute`) and **executed on the
client** (`packages/editor/src/utils/copilotAgentExecutors.ts`), because the browser is
the only place both content stores and the live editor exist.

- `src/lib/ai/copilotAgentTools.ts` is the dependency-free source of truth both
  sides agree on: `READ_TOOLS` auto-execute so the agent loop keeps flowing;
  `WRITE_TOOLS` (`apply_ops`, `create_post`) surface as proposals the user
  accepts before anything is saved.
- The content tool **names are the table above** — `list_posts`, `search`,
  `outline`, `read_blocks`, `read_post`, `apply_ops`, `create_post`, plus
  `list_series` and the browser-only `get_selection`. Not `rename_post` or
  `delete_post`: renaming is reachable here as a `command_` tool — which has its
  own preview/accept step, so both surfaces make the author say yes — and there
  is no destructive equivalent. One operation, one name,
  whichever agent is calling. Command tools carry a `command_` prefix, so they
  cannot collide with the bare `search` / `outline`.
- `packages/editor/src/utils/virtualRepo.ts` is the Copilot's view of the library — pure
  synchronous functions over a Redux snapshot. Search hits carry a **block
  address** a later tool can act on. Cloud-only posts expose metadata and are
  hydrated on demand.
- Everything the app can _do_ (open, navigate, rename, describe the workspace)
  is generated from the command registry by `src/lib/ai/commandTools.ts`, so
  adding a command needs no edit to the route.
  `commands/__tests__/toolParity.test.ts` keeps the two in sync.

The `stateHash` guard matters more here than over MCP: the document being edited
is usually the one on screen, so a keystroke between the agent's read and the
user's accept can invalidate the addresses. Persistent block ids (`blk_…`) exist
largely to soften that — they survive edits elsewhere in the tree.

**The two agents do not see the same content.** The MCP server reads Postgres,
so documents living in browser IndexedDB (anything created while signed out) are
invisible to it. Those are reachable only from the Copilot.

---

## Rules when changing this

- **Adding a codec** obliges a round-trip spec in
  `src/lib/content-bridge/__tests__/codecs.test.ts` over a node with every
  optional field populated (plan §4.6.1). A codec is the only way a block type
  graduates out of `[read-only]`.
- **Never create a `children` array while walking.** A leaf that gains an empty
  one no longer serializes identically, which is the one property `ops.ts`
  exists to hold.
- **New node classes must delegate to `updateFromJSON`** — persistent ids ride
  in `NodeState` and are dropped otherwise. `pnpm check:nodes` enforces it
  statically; `editor/nodes/__tests__/serialization.test.ts` covers it at
  runtime.
- **Do not make `stateHash` cryptographic.** It is an integrity token, not a
  security boundary, and it is synchronous on purpose — `crypto.subtle` is async
  and would push `await` through every caller.
- **A read must not mutate.** Stamping, normalizing or reformatting during a
  read changes the hash and refuses the next write.
- Bridge tests: `inline`, `ops`, `outline`, `codecs`, `blockId` under
  `src/lib/content-bridge/__tests__/`. They need no database.

---

## Known limits

| Limit                                       | Why                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Local IndexedDB posts invisible over MCP    | The server reads Postgres directly                                                                          |
| No uploads                                  | `attachment` can only reference a URL that already exists                                                   |
| No `graph` / `sketch` codec                 | GeoGebra state and Excalidraw scene graphs — coordinates, seeds, version nonces. Their `altText` is editable, which covers the useful case |
| `tablerow` / `layout-item` / `canvas` opaque | Pure structure; nothing to author. Their children are addressable                                          |

Coverage across this blog's stored content (measured 6 Aug 2026): ~31,000
addressable blocks, **93.2% read as a typed block**, and no block-level content
type is without a codec. That measurement predates nested-editor addressing
(27 Aug 2026), which added a canvas's notes and their blocks to the addressable
set and graduated `image` out of `[read-only]`; it has not been re-run.

Remaining work and open decisions live in
[claude-code-backlog.md](../plans/claude-code-backlog.md).
