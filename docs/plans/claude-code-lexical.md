# Claude Code ↔ Lexical documents

**Status: proposal, rev 2 (2026-08-06).** Supersedes the Markdown interchange in
`mcp/` (shipped Jul 2026) — that server stays, its transport changes.

Rev 2 rewrites §3 and §6 of the original. Rev 1 proposed persistent block ids
carried in Lexical `NodeState`; a spike disproved the assumption that made that
cheap (§2.1), and a second finding disproved the `expectedHead` guard it relied
on (§2.2). A third spike **retracted rev 1's headline data-loss bug** (§2.4) —
it was never real, and phase 0 is deleted with it. All three are measured, not
argued. The central insight of rev 1 — _address blocks, don't serialize
documents_ (§4.1) — survives unchanged and is still the whole design.

## 1. Why

Claude Code should do the heavy lifting — "publish this session as an article",
"rewrite this piece to be more concrete" — while **every result is viewed in the
app, as real Lexical**. Markdown outside the app is explicitly not wanted, and
that rules out both the current MCP transport and the file-sync alternative.

The constraint is capability, not correctness. **Rev 1 and early rev 2 claimed
the in-app Copilot silently deletes rich nodes on every edit. That claim is
false and is retracted — see §2.4.** The Copilot already protects them.

What remains is a real limit on the MCP side. `mcp/lexical.ts` converts through
the app's `TRANSFORMERS` (`MarkdownTransformers.tsx:1095`), which covers table,
HR, image, checklist, graph, sketch, math, sticky and the base element/text
sets, and does **not** cover `AttachmentNode`, `CanvasNode`, `DetailsNode`,
`IFrameNode`, `KanbanNode`, `LayoutNode` or `PageBreakNode`. So:

- `read_post` shows Claude a document with those blocks **missing, and says
  nothing about it** — a post with a kanban board reads back as if the board
  were not there.
- `update_post` refuses outright (`unsupportedNodeTypes`) rather than corrupt
  them.

Which means that for exactly the rich posts worth writing about, Claude Code
gets an incomplete view and no write access at all. That is the problem this
plan solves.

## 2. What the spikes measured

Both findings are the reason rev 2 exists. Neither was reachable by reading
docs; both took under an hour to settle empirically.

### 2.1 Node state does not survive this app's custom nodes

Rev 1 §3.2 claimed persistent ids ride along free, because `NODE_STATE_KEY` is
in the base `SerializedLexicalNode` type and therefore serializes for **every**
node class — so "no subclassing, no `version` bump, no `importJSON` override".

Stamping a `blockId` via `createState`/`$setState` on one of each type in a
headless editor (Lexical 0.28):

```
paragraph          $={"blockId":"blk_para"}     ✓  survives export, import, edit-clone
heading            $={"blockId":"blk_head"}     ✓  survives export, import, edit-clone
layout-container   $={"blockId":"blk_layout"}   ✓  exports … ✗ lost on import
math               $=null                       ✗  dropped at export
image              $=null                       ✗  dropped at export
horizontalrule     $=null                       ✗  dropped at export
```

Free for Lexical's own classes. Not free for ours, because ours predate
`NodeState`:

- **8 classes drop `$` on export** — they build the object literally instead of
  spreading `...super.exportJSON()`: `MathNode`, `ImageNode`, `KanbanNode`,
  `StickyNode`, `AttachmentNode`, `CanvasNode`, `HorizontalRuleNode`,
  `PageBreakNode`.
- **Every custom class drops `$` on import** — all hand-roll `static importJSON`
  without routing through `updateFromJSON`. `layout-container` exports its id
  correctly and still loses it on parse.

Two of the casualties, `math` and `image`, were in rev 1's *authorable* set, so
this landed on the write path, not only on reading.

What did hold: ids survived `setTextContent` and `setFormat` through Lexical's
immutable clone (`afterCloneFrom`). The risky-looking half was fine; the boring
half was broken.

**Consequence.** Persistent ids are not a free precondition. They cost a
serialization-conformance pass over ~20 node classes touching the stored
revision format, a backfill over every stored revision, and a permanent rule
that every future node class cooperates. Rev 2 does not pay that (§4.2).

### 2.2 `head` is not a version — revisions are mutable in place

Rev 1 §3.5 guarded writes with `expectedHead`, refusing on mismatch. That guard
does not fire when it matters. `src/repositories/revision.ts:59-65`:

```ts
// "Create a revision, or rewrite one already open under the same id."
return prisma.revision.upsert({
  where: { id: data.id as string },
  create: data,
  update: { data: data.data, createdAt: data.createdAt },
});
```

The editor deliberately folds a stretch of autosaves into a single revision
(`useSave`), so an open editor **rewrites `Revision.data` under an unchanged
`head`**. A document's content can therefore move arbitrarily far while
`expectedHead` reports no change.

**Consequence.** The concurrency token must be derived from content, not from
`head` (§4.3). This is also what makes ephemeral addressing safe, so the finding
that broke rev 1's guard is the one that removes rev 1's need for stored ids.

### 2.3 Not fixed by any of this: the app can still clobber Claude

`PATCH /api/documents/[id]` accepts `head` as a client-chosen uuid with no
compare-and-set (`src/app/api/documents/[id]/route.ts:54`). A stale open editor
can point `head` back at its own revision and orphan Claude's, with nothing on
screen to say so — autosave went quiet in Aug 2026
(`docs/plans/quiet-autosave-plan.md`). Recoverable from history, but only if you
know to look.

The bridge guards its own writes. Closing the other direction means a CAS on
that route, and is out of scope here — recorded in §8.
### 2.5 The conformance pass was a bug fix, not a cost

§2.1 measured that node state does not survive this app's custom classes, and
priced the fix as phase 5's entry ticket. Doing it revealed the price was
already being paid.

`importJSON` is the **only** parse path — `$parseSerializedNodeImpl` calls it
and nothing afterwards restores what the implementation forgot. So a hand-rolled
`importJSON` that never delegates loses base fields too, not just `$`. Measured
by round-tripping a state through a real editor:

```
details-container   format center -> ""   indent 2 -> 0   direction ltr -> null
details-summary     format center -> ""   indent 2 -> 0   direction ltr -> null
details-content     format center -> ""   indent 2 -> 0   direction ltr -> null
layout-container    format center -> ""   indent 2 -> 0   direction ltr -> null
layout-item         format center -> ""   indent 2 -> 0   direction ltr -> null
paragraph           (Lexical's own)                                        ok
```

**Five classes dropped alignment, indent and direction on every single load.**
Not a phase-5 concern at all — a live bug in the editor, invisible because the
document still opens, it just quietly comes back different. Stored content shows
all-default values on those types, which is consistent with either "never set"
or "already lost" and cannot distinguish them.

Fixed by routing every `importJSON` through `updateFromJSON` and spreading
`super.exportJSON()`. Two guards keep it fixed:
`src/editor/nodes/__tests__/serialization.test.ts` for the classes that import
without a DOM, and `npm run check:nodes` — a static check over *all* of them,
since the `.tsx` node modules cannot be parsed in the test environment. The
check found two classes the manual pass had missed.

### 2.4 Retracted: the Copilot does not lose rich nodes

Rev 1 §1 and rev 2's first draft both asserted that the in-app Copilot's
`edit_document` rebuilds the tree from Markdown and silently drops any node type
without a transformer. Both were reading `mcp/lexical.ts` (which does use the
app's `TRANSFORMERS`) and attributing its behaviour to
`src/editor/utils/markdownBridge.ts`, which is a different mechanism.

`markdownBridge` protects rich nodes as **opaque base64 tokens** embedded in the
agent-facing Markdown:

```
[[lexblk:eyJ0eXBlIjoia2FuYmFuIiwidGFza3MiOlt7...]]
```

`stripCustomNodes` replaces every node outside a 13-type standard allowlist with
a token carrying its full serialized JSON; `restoreCustomNodes` reverses it on
the way back. The allowlist is a **default-opaque** design, so unknown and
future node types are protected automatically rather than needing enumeration.

Measured, on a document holding kanban, layout-container, details-container,
math, pagebreak and attachment, running exactly what `applyWrite` runs:

```
kanban             1 -> 1  OK        layout-container   1 -> 1  OK
details-container  1 -> 1  OK        math               1 -> 1  OK
pagebreak          1 -> 1  OK        attachment         1 -> 1  OK
edit actually applied: true
```

Two supporting checks: the shared module-level headless editor does **not** leak
state between consecutive `markdownToSerializedState` calls, and the agent is
told the rule in both `src/lib/ai/prompts.ts:115` and
`src/app/api/copilot/route.ts:41` ("never edit their contents").

**Consequences.** The original phase 0 — a refusal guard mirroring
`unsupportedNodeTypes` — is deleted; it would have removed the Copilot's ability
to edit rich posts while guarding nothing. Phase 4 becomes a capability upgrade
rather than a bug fix, and loses its urgency.

One residual hazard is real but agent-mediated rather than structural: an agent
that mangles a token, spans one with `edit_document`'s `old_text`, or omits one
from a `write_document` full rewrite drops that node. The tool description
(`copilot/route.ts:84`) says "Preserve any [[lexblk:...]] tokens you want to
keep", so omission is by design — but a token that vanishes is a rich block
deleted with nothing on screen to say so. §8 asks what to do about it.

Worth noting for §4.1: this token scheme is the same insight as this plan's,
in a cruder form — preserve by not touching. It works, and it is prior evidence
in this codebase that the approach holds. What it cannot do is let Claude *read
or author* what is inside the token, which is exactly the gap the block IR
closes.

## 3. What exists today, and why it is not enough

`mcp/content-server.ts` speaks Markdown in both directions:

| Tool          | Behaviour                                                             |
| ------------- | --------------------------------------------------------------------- |
| `read_post`   | Flattens through `TRANSFORMERS`. Untransformed types vanish, silently  |
| `update_post` | Replaces the whole body; refuses posts containing untransformed types  |
| `create_post` | Markdown in, so only ever authors what Markdown can express            |
| `list_posts` / `list_series` | Fine, keep                                          |

So for exactly the rich posts worth writing about, Claude gets an incomplete
view and cannot write at all. There is no addressing, so every edit is a
full-document rewrite; and no search, so reviewing a series costs every body in
full.

The in-app Copilot solves the *preservation* half of this differently and
correctly (§2.4), by tokenizing rich nodes into opaque base64. But a token is
unreadable and unauthorable by the agent, so it trades silent loss for a blind
spot. Both callers want the same thing: blocks they can see into.

Nothing off the shelf closes this. Lexical ships `@lexical/headless` (already
used) and the Markdown transformers, and no block-addressing API.
`@lexical/yjs` would give genuinely stable per-node identity and real concurrent
merge — at the price of standing up collaboration infrastructure for a
single-user blog, and it does nothing for the other half of the problem, which
is Claude understanding the format. We build the layer.

## 4. The model

Raw Lexical JSON is unauthorable by a model — version fields, format bitmasks,
`direction`/`indent` boilerplate, deep nesting — and ruinous on context.
Markdown is lossy. The third option is to **address blocks rather than
serialize documents**.

### 4.1 The central property

> **Losslessness comes from addressing, not from format coverage.**

The applier loads the real editor state, mutates only the nodes Claude named,
and re-serializes. A kanban board Claude never mentioned comes out
byte-identical because nothing touched it. The intermediate representation
therefore never needs to express every node type — only the ones being written.
Today's refuse-the-whole-post guard becomes unnecessary rather than better.

This is rev 1's insight and it is correct. Everything below is a cheaper way to
get it.

### 4.2 Addressing: ephemeral, derived, hash-validated

Addresses are **minted per read from document order, never stored**:

```
b1     heading[2]
b4     layout
b4.1     paragraph
b4.2     graph
```

An address is a structural path. `apply_ops` re-derives paths from the state it
loads, so resolution is a walk, not a lookup. No node-class changes, no
backfill, no agent scaffolding in the stored document, and no new class of
document that the bridge silently cannot address.

The cost is that an address is only valid against the state that minted it. That
is acceptable because it is *detectable* — §4.3 — and because the failure is a
loud "re-read", not a wrong write. Rev 1 bought resilience across concurrent
human edits, at the price measured in §2.1, for a single-user blog where that
window is a few seconds wide.

Persistent ids remain available later as a pure upgrade (§7, phase 5) if
concurrent editing ever proves annoying in practice. Nothing here forecloses it.

**Built (phase 5): ids are opportunistic, and there is no backfill.**
Rev 1 wanted every stored revision stamped up front. Instead: a stamped block is
addressed by its id, an unstamped one by its path, both spellings resolve, and a
write stamps only the blocks it touched. Documents accrue ids exactly where
editing happens, nothing is migrated, and nothing breaks if a document is never
stamped.

Stamping *everything* on first write was the obvious implementation and is wrong
twice over: a kanban board nobody mentioned would gain an id and stop being
byte-identical, breaking §4.1; and a one-paragraph change buried in a 200-block
restamp is not reviewable, breaking §4.7's diff-against-the-previous-revision
story. Stamping what was touched costs nothing on either count.

**Built (phase 1): the applier works on serialized JSON, not a live editor.**
§4.1 describes loading "the real editor state"; operating on the stored JSON is
strictly better. The preservation guarantee becomes literal rather than a matter
of trusting a round-trip through node classes; it removes the headless-editor
fragility in §9 (no node registration, no DOM shim, so no new node type can
break the server by touching `document` at import); and the same code runs
unchanged in the browser and in Node. The cost is that nodes are hand-built
rather than minted by a node class, which is what §4.6.1's per-codec round-trip
spec is for.

### 4.3 The concurrency token is a content hash

Every read returns `stateHash` — a hash over the canonicalized revision data.
Every write requires it, and is refused on mismatch with "the document changed,
re-read it".

Per §2.2 this is not a stylistic preference over `expectedHead`: head is simply
not a version here. The hash also happens to be exactly the right token for
§4.2, because it certifies the *content the addresses were derived from*. If the
hash matches, the paths are valid by construction.

### 4.4 Reading — an outline, then bodies

`outline(postId)` returns the skeleton. Prose shows a preview; rich blocks show
a typed **descriptor** rather than being flattened or dropped:

```
b1     heading[1]  "Gradient descent, revisited"
b2     paragraph   "The usual derivation starts from…"      (312 chars)
b3     math        \nabla f(x_k)^T d_k < 0
b4     layout      2 columns
b4.1     paragraph "…"
b4.2     graph     geogebra · f(x)=x^2, tangent at x=1
b5     code[ts]    18 lines
b6     kanban      3 lanes · 11 cards
```

`read_blocks(postId, ids)` then pulls only what is needed. This is the
grep-shaped navigation MCP otherwise lacks: reviewing a 12-post series costs 12
outlines, not 12 full bodies. `read_post` returns the whole thing as blocks, for
when the document is small enough that the round trip is not worth it.

Crucially, **a descriptor says the block is there**. The board that is invisible
today (§3) is visible, addressable, and movable — just not authorable until it
has a codec (§4.6).

**A descriptor is shape, not content.** `kanban  3 lanes · 11 cards` does not
carry the card text, so until a type has a codec Claude cannot reason about
what is inside it — "summarize this post" will silently skip it. This is a
weaker claim than "full view of the document", and the difference is worth
stating plainly: **full structural view from day one, full content view only
for typed blocks.** Descriptors could cheaply carry extracted read-only text
for the types that have text at all; that is §8.

### 4.5 Inline formatting: Markdown inside a block, never across blocks

Rev 1 modelled a paragraph as a plain string, which quietly destroys bold,
links and inline math on every `set_text` — the same losslessness bug one level
down, on the main prose-rewrite path.

Blocks carry their inline runs as **Markdown extended to a closed inline set**.
The set must be the app's, not Markdown's: the toolbar offers **highlight,
underline, superscript and subscript** alongside bold/italic/code/strikethrough,
and standard Markdown expresses none of those four. A vocabulary of
bold/italic/code/strike/link/math would therefore destroy an underline on every
`set_text` — the same silent-loss bug this section exists to prevent, one level
further down.

So the closed set is: **bold, italic, code, strikethrough, link, inline math,
highlight, underline, superscript, subscript**. Any inline format outside the
set — an inline text colour, say — makes the block **text-opaque**: readable,
replaceable whole, but not editable via `set_text`. That fallback is what keeps
the rule total rather than aspirational.

**Built (phase 1), and the spelling changed under test.** Every mark delimiter
is two characters and none is a prefix of another:

| | | | |
| --- | --- | --- | --- |
| `**bold**` | `__italic__` | `==highlight==` | `++underline++` |
| `~~strike~~` | `^^sup^^` | `,,sub,,` | `` `code` `` |
| `[text](url)` | `$latex$` | | |

Italic is `__` rather than `*` because the obvious spelling makes bold+italic
render `***`, which the parser splits the wrong way — it takes `**` first and
the stranded `*` decays to literal text, losing the italic. Markdown resolves
that with flanking rules; a prefix-free set resolves it by construction. The
property test found it, along with a literal `]` inside link text terminating
the link early, and code content touching its own fence.

Because every delimiter is doubled, a lone marker character needs no escaping:
"2 * 3", `snake_case` and "a ^ b" all survive as written. A mark character is
escaped only where it is doubled, or where it sits at the very edge of a run and
would merge with the delimiter about to wrap it.

```jsonc
{ "id": "b2", "type": "paragraph",
  "text": "The usual derivation starts from **the gradient**, see [here](/x)." }
```

Structured runs (`[{t:"…"},{t:"…",b:true}]`) would be lossless without an
escaping story, but they are verbose in exactly the place the context budget is
spent, and worse to author. Markdown-inline is the right trade **provided the
escaping is real**, so it carries an obligation: a property test asserting
`parse(render(x)) === x` over a corpus including literal `*`, `_`, `[`, `` ` ``
and `$` in body text. Without that test this section is a liability, not a
design.

Note the blast radius is far smaller than document-level Markdown: no tables, no
fences, no lists, no block images. Only the inline transformers.

### 4.6 Blocks: one vocabulary, codecs graduate

The same block JSON is used for reading and writing. What changes over time is
which types have a **codec** (a bidirectional mapping to node classes):

```jsonc
{ "type": "heading", "level": 2, "text": "Results" }
{ "type": "math",    "latex": "\\nabla f(x)^T d < 0" }
{ "type": "code",    "language": "ts", "code": "…" }
{ "type": "details", "summary": "Full diff", "children": [ … ] }
{ "type": "layout",  "columns": [ [ … ], [ … ] ] }
```

Types without a codec are **opaque**: readable, addressable, deletable,
movable — never rewritten.

```jsonc
{ "id": "b7", "type": "graph", "summary": "geogebra · f(x)=x^2", "opaque": true }
```

Phase 1 codecs: paragraph, heading, quote, list, code. Everything else opaque.
Per §4.1 an opaque block costs nothing — it is preserved by not being touched —
so graduation is purely additive, has no correctness deadline, and a
half-finished codec set is never *wrong*, only less capable. This is the main
property the design is buying and the reason the phase order below is free.

#### 4.6.1 Codecs must carry through what they do not model

A clean IR is the hazard. `{ "type": "math", "latex": "…" }` does not mention
`style`, so a `replace_block` built from it strips the node's styling —
silently — the failure mode this whole plan is meant to avoid.

Eleven node classes carry `__style` and/or `__width`: `MathNode`, `ImageNode`,
`GraphNode`, `SketchNode`, `CodeNode`, `TableNode`, `TableCellNode`,
`IFrameNode`, `StickyNode`, `KanbanNode`, plus `nestedConfig`. Tables add
`colSpan`, `headerState` and column widths on top.

**Rule: a codec round-trips the whole node, not the modelled subset.** Fields
the IR does not express are carried opaquely on the block and restored on write.
Each codec ships with a round-trip spec over a node carrying every optional
field populated. Without that rule, "graduate a codec" becomes a way to
introduce data loss one type at a time — and it would land on the types most
worth having.

#### 4.6.2 What can graduate, and what never will

The limit is not the architecture. It is whether a node's content is authorable
by a language model at all, and that splits three ways.

**What the corpus actually contains** (counted across every stored revision,
recursively, 2026-08-06). The a-priori tiering below was written without this,
and it was wrong in two places — see the note after the table.

| Node type | Count | State |
| --------- | ----- | ----- |
| `paragraph` / `heading` / `code` / `quote` | 30k+ | phase 1 |
| `list`, including 1893 nested | 6070 | **graduated**, nesting and all |
| `horizontalrule` | 1785 | **graduated** as `divider` |
| `layout-item` | 741 | opaque (structural; you address *into* it) |
| `blog-tablecell` + `matheditor-tablecell` | 5943 | opaque — **the biggest remaining gap** |
| `tablerow` | 1357 | opaque |
| `layout-container` | 247 | **graduated** as `layout` |
| `attachment` | 164 | graduated, but see below |
| `canvas` | 131 | §4.6.3 |
| `blog-table` + `matheditor-table` | 263 | opaque — ~263 tables |
| `image` | 67 | §4.6.3 |
| `sketch` | 64 | never (§tier 3) |
| `graph` | 10 | never |
| `math` | 8 | inline only — already handled in `inline.ts` |
| `kanban`, `details-container`, `iframe`, `sticky`, `pagebreak` | **0** | no stored content at all |

Two corrections this forced:

- **`horizontalrule` was missing from the tiering entirely**, and is the second
  most common non-prose block in the corpus. It is now `divider`.
- **`kanban`, `details` and `iframe` have no stored content whatsoever.** They
  were argued for on authoring value, which is real for `details` and `kanban`
  (§5's two worked examples need them) — so those were built anyway — but
  `iframe` has neither content nor a workflow and was skipped.

Nested lists were the last content gap, and the measurement again decided the
shape. Nesting is structural — a `list` inside a `listitem` — 1 to 4 levels
deep, no item ever carries more than one sublist, and `indent` is *exactly* the
nesting depth minus one in every stored list. So the IR is recursive
(`item.sublist = {listType, items}`) and **`indent` is derived on write rather
than exposed**, which makes an item whose indent contradicts its nesting
unrepresentable rather than merely unlikely.

The check that mattered: every one of the 6070 stored lists was read, rebuilt
through the codec, and read again. **5917 came back identical and 0 mismatched**
— the remaining 153 are read-only because their inline content is outside §4.5's
vocabulary, which is the designed fallback rather than a failure.

Adding tables raised the number of *addressable* blocks in this blog from
~23.7k to ~31k, because a table's interior was previously not reachable at all —
263 tables became 263 tables plus 1357 rows and 5943 cells. The share reading as
typed rather than opaque moved 87.8% → 87.1%, which is the denominator growing,
not coverage shrinking.

A third thing only showed up when the codecs were run over real revisions:
**`attachment` is an inline node**, sitting inside paragraphs rather than at
block level, so the block codec never sees the 164 stored ones. They reach the
reader through `describeNode` instead, and a paragraph containing one is
text-opaque. Making attachments editable means giving them an inline spelling in
§4.5, not a block codec.

**Tier 1 — trivial, all scalars or plain recursion:**

| Type | Shape | Note |
| ---- | ----- | ---- |
| `math` | `{value, style, id}` | `value` is LaTeX; native to author |
| `iframe` | `{src, …}` (extends image) | a URL |
| `details` | `{open, editable}` + children | recurse the block IR |
| `layout` | `{templateColumns}` + item children | `"1fr 1fr"` is the whole config |
| `attachment` | `{url, filename, mimetype, size, expanded}` | scalars; creating one still needs an upload (§9) |
| `kanban` | `{tasks: Task[], style}` | see below |

`kanban` was classed describe-only in rev 1 and in early rev-2 drafts. That is
wrong: `Task` is `{id, name, description?, stage, priority, tags, createdAt,
updatedAt}` (`KanbanNode/utils.ts`) — plain scalars end to end. It is among the
*easiest* types to author and one of the most useful ("turn these session notes
into a board"), so it belongs early in phase 3 rather than never.

**Tier 2 — structural, real work:**

- `table` — **done.** The IR is not the 2D array of cell block-lists predicted
  here. Measured first: stored tables are 3–7 rows, and **97.4% of cells hold
  exactly one paragraph**. So a cell is *text-bearing* rather than a container —
  `set_text` edits it directly, and addressing does not descend through to the
  paragraph inside. That halves the depth of every table in an outline and gives
  one address per piece of content instead of two. The 2.6% holding more go
  read-only, the same fallback §4.5 uses for inline. Authoring takes a bare
  string per cell (`[["Name","Count"],["apples","3"]]`) with an object form for
  spans and headers. Both the current and pre-rename `type` spellings are read;
  writes produce the current one.
- `image` — mostly scalars, but `caption` is a `SerializedEditor`. First
  appearance of §4.6.3.

**Tier 3 — describable forever, and that is the correct outcome:**

- `graph` carries a GeoGebra state blob; `sketch` carries an Excalidraw scene —
  geometry with coordinates, seeds and version nonces. Technically JSON, so
  technically authorable; practically nothing good comes of a model hand-writing
  it. They stay read-describe-move-delete permanently. Claude can still
  reposition one, delete it, edit its `altText`, and write prose around it.
- `canvas` splits: note *text* is authorable through §4.6.3, board geometry is
  not.

#### 4.6.3 Nested editors — undecided, blocks three codecs

`image.caption`, `sticky.editor`, and every entry in `canvas.notes` each hold a
**complete serialized Lexical editor** inside a block. So the IR has to recurse
into sub-documents, and addressing has to either reach into them
(`b7.note2.b1`) or refuse to explicitly.

Neither the address scheme (§4.2) nor the op set (§4.7) currently says which.
This needs deciding before `image`, `sticky` or `canvas` starts — not before
phase 1, since none of the phase-1 codecs nest.

### 4.7 Writes land directly

An applied batch creates a `Revision` and advances `Document.head`. No proposal
queue, no accept step; review is the existing history UI, diffed against the
prior revision.

Ops apply **atomically against one `stateHash`** — all or nothing — and the
result returns the new hash plus a fresh outline, so Claude can chain edits
without a re-read between them.

```
set_text(id, text)              replace_block(id, block)
insert_blocks(after|before|append_to: id, blocks)
delete_block(id)                move_block(id, after: id)
```

Terminal output stays terse: `updated 4 blocks in "Gradient descent" (rev_10)`.

## 5. The tool surface

```
outline(postId)                        -> { stateHash, blocks[] }
read_blocks(postId, ids[])             -> { stateHash, blocks[] }
read_post(postId)                      -> { stateHash, blocks[] }
search(query, { postId? })             -> block-level hits with ids
apply_ops(postId, stateHash, ops[])    -> { stateHash, outline, revisionId }
create_post({ title, blocks, seriesId? })
list_posts() / list_series()             (unchanged)
```

`read_post`/`update_post`'s Markdown path retires with phase 2.

## 6. Where it lives

```
src/lib/content-bridge/
    address.ts     document-order paths <-> nodes, outline numbering
    stateHash.ts   canonical hash of revision data
    inline.ts      inline runs <-> restricted Markdown (property-tested)
    blocks.ts      block IR <-> nodes; per-type codecs + opaque fallback
    ops.ts         apply an op batch to a real node tree
    index.ts
        │
        ├── mcp/content-server.ts                    phase 2  (headless, terminal)
        └── src/editor/utils/copilotAgentExecutors.ts phase 4  (live editor, browser)
```

`mcp/lexical.ts`'s headless-editor construction moves in; `bootstrap.mjs` stays
in `mcp/` and must never be reachable from the Next build.

In the browser the same core runs against the live editor, where node keys are
already stable for the editor's lifetime — `address.ts` resolves a path to a
`NodeKey` there instead of re-walking. That is the one seam that differs.

## 7. Phases

| # | Work                                                                                                                                                   | Gate |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 0 | ~~Refusal guard in the Copilot's Markdown path.~~ **Deleted — premise was false (§2.4).** The Copilot already protects rich nodes via opaque tokens; the guard would have removed capability and prevented nothing | |
| 1 | **DONE.** `src/lib/content-bridge/`: `address`, `stateHash`, `inline` (+ property test), `blocks` (paragraph/heading/quote/list/code + opaque fallback), `ops`, `outline`. 50 specs; pure JSON, no DOM | |
| 2 | **DONE.** `mcp/content-server.ts` on §5's surface; Markdown path retired. `mcp/lexical.ts`, `bootstrap.mjs` and `css-loader.mjs` **deleted** — the bridge is pure JSON, so the server needs no headless editor and no DOM shim, which closes the §9 fragility outright | |
| 3 | **DONE for every content type this blog holds.** `divider`, `layout`, `attachment`, `details`, `kanban`, `summary`, `table`, `cell`, and **nested `list`**. 93.2% of addressable blocks read as typed; the only opaque ones left are `tablerow` (1357) and `layout-item` (741), both pure structure with nothing to author. `iframe` skipped — zero occurrences, no workflow, inherits image's caption problem | §4.6.3 still gates image/sticky/canvas |
| 4 | **DONE.** `copilotAgentExecutors` + `virtualRepo` on the core; `markdownBridge.ts` **deleted**. Tools are now `outline_document` / `read_blocks` / `read_document` / `search_documents` / `apply_ops` / `create_document(blocks)`; `edit_document`, `write_document` and `read_current_document` are gone | |
| 5 | **DONE, and it cost less than §2.1 predicted.** The conformance pass fixed a *live* bug rather than merely enabling ids (§2.5). Ids are **opportunistic** — stamped on write, never backfilled, both spellings resolve — so there is no migration and no big-bang | |

Rev 1's phase 0 spike is answered (§2.1), its phase 3 backfill is deleted, and
its urgency is gone (§2.4) — nothing here is racing a live bug.

Phase 1 landed three things the design did not anticipate, all found by tests
rather than by reading: the inline delimiters had to become prefix-free (§4.5),
the applier is better off on serialized JSON than on a live editor (§4.2), and
a tree walk that lazily creates `children: []` breaks the central preservation
property outright — a kanban node gained a field it never had, and the ops spec
caught it.

Phase 4 made the Copilot's content layer the same code as the terminal's, and
deleted the Markdown transport's last user. Three things it settled:

- The `.md` path fiction (`<id>.md`) is gone; documents are addressed by id.
  Keeping it would have described a folder of Markdown files that no longer
  exists anywhere in the system.
- `read_current_document` collapsed into an optional `id` on the three document
  readers — omitted, they act on the open editor including unsaved edits. One
  fewer tool whose only difference was its subject.
- Search now returns a **block address** rather than a line number. A line
  number was useless to every other tool, so a hit meant re-reading the whole
  body to act on it.

The `stateHash` guard bites harder here than over MCP, and deliberately: the
document being edited is usually the one on screen, and a proposal sits waiting
for the user to accept it. If they typed meanwhile, the addresses may no longer
point where they did, so the write is refused with something actionable instead
of applied to the wrong block. In practice the user is reading the proposal, not
typing, in that window.

Phase 3 was reordered by evidence rather than by the tiering in §4.6.2: the
counts above put `horizontalrule` (absent from the plan) second by volume, and
showed that three of the types argued for as "trivial and useful" have no
stored content at all. It also surfaced a design bug — the outline advertised a
kanban as editable and then refused the edit, because one flag was answering
two different questions. `editable` (can `replace_block` touch it) and
`textEditable` (will `set_text` work) are now separate, with one shared
definition so the outline and the applier cannot drift.

Phase 2 removed more than it added. Choosing plain JSON in phase 1 meant the
MCP server stopped needing a headless editor at all, so three files and a whole
class of import-time fragility went with the Markdown path. Verified against the
live database (203 posts): outline, read_blocks and search over real content,
and a create → edit → stale-hash-refused cycle whose stored JSON is real Lexical
— `==highlight==` arrives as a text node with `format: 128`, not as literal
characters. One fix came out of that run: a paragraph wrapping a canvas read
back empty, so the outline said a block was there and read-only without saying
what it was; unspellable inline nodes now contribute a descriptor.

**Phase 3 is next: graduate codecs in tier order (§4.6.2).**

## 8. Open questions

- **Inline escaping.** §4.5's property test is the gate on trusting `set_text`.
  If the corpus proves ugly — and ten marks is more than Markdown was built to
  carry — fall back to structured runs for blocks containing inline marks and
  keep the plain string for the common case.
- **Nested editors (§4.6.3).** Address into sub-documents, or refuse? Blocks
  `image`, `sticky` and `canvas`; blocks nothing before phase 3.
- **Should descriptors carry text?** Extracting read-only text into a descriptor
  (kanban card names, canvas note text) would close most of the "structural view
  only" gap in §4.4 for a morning's work, with no write-path risk.
- **Should a vanished `[[lexblk:…]]` token be surfaced?** Per §2.4 an agent can
  legitimately delete a rich block, so a refusal is wrong — but so is deleting a
  kanban board with nothing on screen to say so. The Copilot already has an
  accept/reject proposal flow; the likely answer is that the proposal names what
  it will remove ("deletes 1 kanban block"). Small UI change, needs a product
  call, and is independent of everything else here.
- **The app can still clobber Claude (§2.3).** Wants a compare-and-set on
  `PATCH /api/documents/[id]`. Separate change; should it ride along with phase
  2, or wait?
- **Local drafts are out of reach *from the terminal*.** MCP reaches Postgres
  via Prisma, so guest and local IndexedDB documents stay invisible to Claude
  Code. Phase 4 closed this for the in-app Copilot — it runs client-side and
  reads every local document — but the two agents still see different libraries.
  Accepted?
- **Series/project placement on create** — does "publish this session" pick a
  series itself, or always land at root for you to file?
- **Does `search` need to be semantic?** Postgres `ILIKE` over block text is a
  morning's work and probably enough at this corpus size.

## 9. Limitations

Accepted consequences, recorded so they are not rediscovered as surprises.

**Inherent to the design**

- **A write is still refused when the document moved under it.** `stateHash`
  is a whole-document token, so an actively-typed editor refuses writes until
  you stop, even where persistent ids (phase 5) would have kept the addresses
  valid. Ids fixed *addressing* across edits; they did not make the guard
  finer-grained. Doing that means a per-block hash, and is not planned.
- **Claude reasons about a projection, not Lexical.** Whatever the IR omits is
  invisible. That is what makes it affordable on context.
- **Block granularity.** No sub-block surgery; changing a word rewrites the
  block's text, and merging two paragraphs is delete + `set_text`.
- **Some blocks are never authorable** — §4.6.2 tier 3, by the nature of the
  content rather than any limit here.

**Scope not covered**

- Local IndexedDB and guest drafts are invisible (§8).
- No document lifecycle: content only. No publish, rename, move, status or
  handle management.
- No uploads, so `image` and `attachment` can only reference existing files.
- No revision history access — Claude cannot read or diff prior revisions.
- Single author, scoped to `MCP_AUTHOR_ID`.

**Operational**

- ~~**The headless server is fragile.**~~ **Closed by phase 2.** The bridge is
  plain JSON manipulation, so the server imports no editor node classes and
  needs no DOM shim; `bootstrap.mjs`, `css-loader.mjs` and `mcp/lexical.ts` are
  deleted. A new node class touching browser APIs at import can no longer break
  it.
- **It bypasses the app's authorization seam.** `content-server.ts` talks Prisma
  directly and scopes by `authorId` by hand — the pattern CLAUDE.md warns
  against — rather than going through `src/lib/access.ts`. Low stakes at one
  user, but it is a second unguarded path to the documents.
- **No cross-post transactionality.** A multi-post refactor is N independent
  writes; failing halfway leaves the set inconsistent.
