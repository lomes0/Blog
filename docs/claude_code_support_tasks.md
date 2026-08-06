# Claude Code support — remaining tasks

**Status: backlog.** Everything the plan in
[plans/claude-code-lexical.md](./plans/claude-code-lexical.md) scoped is built
(phases 1–5, plus tables and nested lists). This file is what is _left_, why
each item exists, and what it would cost. Nothing here is in progress.

Read the plan first for the design; this file assumes it.

## Where things stand

The content bridge (`src/lib/content-bridge/`) addresses Lexical documents by
block. Both agents run on it: the MCP server (`mcp/content-server.ts`) for
Claude Code in the terminal, and the in-app Copilot
(`src/editor/utils/copilotAgentExecutors.ts`). Nothing converts documents to
Markdown any more.

Coverage against this blog's real content, measured 2026-08-06 across every
stored revision:

|                                         |                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Addressable blocks                      | ~31,000                                                                    |
| Reading as a typed block                | **93.2%**                                                                  |
| Still opaque at block level             | `tablerow` (1357), `layout-item` (741) — pure structure, nothing to author |
| Block-level content types with no codec | **none**                                                                   |

That last row is narrower than it sounds, and the difference is item 4. Stored
`image`, `canvas` and `sketch` nodes sit _inside_ paragraphs rather than at the
top level, so they never reach `nodeToBlock` — they reach the model as bracketed
descriptors through `plainText` (`blocks.ts:58`), which is why they do not show
up as opaque blocks. They still have no codec.

So the remaining work is not "finish the codecs". The one correctness hole is
now closed (item 1, kept here for the record); what is left is capability and
four decisions.

---

## 1. Compare-and-set on `head` — **DONE (6 Aug 2026)**

The hole: `head` was a client-chosen uuid written unconditionally, so a tab open
a while could point it back at its own revision and orphan an agent's, with
nothing on screen to say so — autosave went quiet in Aug 2026
(`plans/quiet-autosave-plan.md`), so there is no indicator to notice either. The
content bridge guarded _its_ writes with `stateHash`; this was the other
direction.

**Both writers are now conditional**, which is what the fix turned out to
require — a guard on `PATCH` alone would have left the MCP server writing `head`
straight through Prisma next to it.

- `updateDocument(handle, data, expectedHead)` (`repositories/document.ts`).
  `undefined` writes unconditionally, which is what a rename or a publish toggle
  wants; anything else — including `null` for "no revision yet" — makes the
  write conditional. `updateMany` carries the guard, because `head` is not
  unique and `update`'s `where` will not take it; it also takes scalars only, so
  the nested `revisions`/`coauthors` writes are split off and replayed inside
  the same transaction on the row the guard has already locked. A miss throws
  `StaleHeadError`, which the route answers as **409**.
- `saveRevision` (`mcp/content-server.ts`) does the same on the head its read
  came from, so an editor save landing between `outline` and `apply_ops` is
  refused rather than overwritten. `stateHash` still guards addresses; this
  guards the write.
- The editor sends the head its _last successful save_ wrote (`useSave.ts`), not
  the head at load — autosave folds a stretch into one revision and mints a
  fresh id every `REVISION_SESSION_MS`. On a 409 it stops asking (every retry
  would be refused identically), keeps buffering into `pendingSaves` so nothing
  typed after the conflict is lost, and lets the store announce the server's own
  wording. The rejected content is also in history: the revision row lands, it
  just is not `head`.
- `Failure` (`store/thunks/createApiThunk.ts`) now carries `statusCode`, because
  a 409 is a fact the editor has to act on rather than text to display.

**Verified** against the dev database: a null-head first save, a matching head
writing both scalars and its nested revision, a stale head refused with nothing
written and no orphan revision, an unconditional write still working, and two
overlapping writers on the same expected head — exactly one lands, the other
gets `StaleHeadError`.

**Still owed:** the browser pass. What the DB check cannot answer is what the
conflict _looks like_ — that the snackbar reads sensibly, that the tab stops
retrying, and that reopening the document restores the buffered text.

---

## 2. Descriptors could carry text

Reading a block with no codec gives shape, not content: `canvas  7 notes` says a
board is there but not what the notes say. So "summarise this post" silently
skips them.

Extracting read-only text into the descriptor closes most of that gap. It is
strictly a read-path change — no new authoring surface, no write risk — and the
policy is already written down and already followed: `describeNode`'s docstring
in `blocks.ts` states it, its `tablerow` case joins the row's cell text rather
than counting cells, and `plainText` does the same for inline nodes it cannot
spell.

**`canvas` (131 stored) is the one that is left**, and it needs walking each
note's nested editor state. `image` captions join it if item 4 lands on
"refuse".

Not `kanban`: it has had a full codec since `6abf8c09` — `nodeToBlock` returns
`{type: "kanban", tasks}` and `readKanbanTasks` (`blocks.ts:252`) already yields
`name`, `description`, `tags`, `stage` and `priority` — and this blog stores
zero of them anyway. The `3 lanes · 11 cards` example that used to be here was
copied from the plan §4.4, written before that graduation; the descriptor now
only fires for a kanban reached inline.

**Cost.** A morning.

**Blocked by.** Nothing. Note that `canvas` here is _read-only extraction_,
which is unrelated to and unblocked by item 4.

---

## 3. Semantic search

`search` is `ILIKE`-equivalent: a case-insensitive substring over each block's
text, walked in Node (`mcp/content-server.ts`) or over the Redux snapshot
(`virtualRepo.ts`). Hits are block-level and carry an address, which is the part
that matters.

At 203 posts this is very likely enough. Only worth revisiting if you find
yourself unable to locate something you know is there.

**Cost.** Unclear, and deliberately unestimated — do not start this without a
concrete failure to point at.

**Blocked by.** Nothing, but it needs a reason first.

---

## 4. Nested editors — decision required

**Blocks three codecs and 198 real nodes.**

`image.caption`, `sticky.editor` and every entry in `canvas.notes` each hold a
**complete serialized Lexical editor** — a whole sub-document inside a block.

| Type     | Occurrences |                                                                               |
| -------- | ----------- | ----------------------------------------------------------------------------- |
| `canvas` | 131         | gated by this decision                                                        |
| `image`  | 67          | gated by this decision                                                        |
| `sticky` | 0 stored    | gated, but nothing stored to gate                                             |
| `sketch` | 64          | _not_ counted — see "never" below; only its `altText` is reachable either way |

Neither the address scheme (§4.2) nor the op set (§4.7) says what happens here.
Two coherent answers:

- **Address into them.** A nested editor becomes addressable, e.g.
  `b7.note2.b1`. Most capable; costs a second addressing dimension, and every op
  has to know which document it is operating on.
- **Refuse explicitly.** Nested editors stay opaque and the blocks around them
  are read/move/delete only. Cheapest, and consistent with how `graph` and
  `sketch` are already treated.

There is a middle option worth considering: read-only text extraction (item 2)
gets most of the _visibility_ benefit without either commitment, which may make
the full decision less urgent than it looks.

**Cost.** The decision is the work; the implementation follows from it.

**Blocked by.** Nothing — but it blocks `image`, `sticky` and `canvas` codecs.

---

## 5. A deleted rich block should be visible in the proposal

An agent can legitimately be asked to delete a canvas or a table, so refusing
the operation is wrong. But a board of 40 notes disappearing with nothing on
screen to say so is also wrong. In this blog the deletes that carry
unrecoverable-looking content are `canvas` (131), `image` (67), `sketch` (64)
and `table` (263).

The Copilot already has an accept/reject proposal flow, and `ActionPreview.tsx`
already renders one line per operation — including `delete b7`. What it does not
do is say _what_ `b7` is, because the preview only sees the op, not the
document.

Likely answer: the proposal resolves the address and names what it will remove
("deletes 1 canvas · 7 notes"). Small UI change.

**Cost.** Small, once the wording is decided.

**Blocked by.** A product call on how loud it should be — inline note, or
something that demands a second confirmation.

---

## 6. Series placement on create

`create_post` takes an optional `seriesId` and otherwise lands the post at root,
unpublished. When you say "publish this session as an article", should the agent
pick a series itself (it can list them), or always land at root for you to file?

**Cost.** Trivial either way.

**Blocked by.** Your preference. This is the only item here that is purely a
taste question.

---

## 7. Local drafts are invisible from the terminal

The two agents see different libraries:

- **In-app Copilot** runs client-side, so it reads every document including
  guest and local IndexedDB drafts.
- **Claude Code over MCP** reaches Postgres via Prisma, so local-only documents
  do not exist to it.

This is inherent to where each runs, not an oversight. Closing it would mean
either syncing local drafts to the server (a product change with its own
questions about guest data) or giving the MCP server a browser, which is absurd.

**Recommendation:** accept and document, which is what the plan currently does.
Listed here so it is a decision rather than a gap nobody noticed.

---

## Never — recorded so they are not re-proposed

- **`graph` and `sketch` codecs.** They carry GeoGebra state and Excalidraw
  scene graphs — geometry with coordinates, seeds and version nonces.
  Technically JSON, so technically authorable; practically nothing good comes of
  a model hand-writing one. They stay read-describe-move-delete. Their `altText`
  is editable, which covers the useful case.
- **`iframe` codec.** Zero occurrences in this blog, no workflow asking for it,
  and it inherits `ImageNode`'s nested-caption problem for nothing.
- **Per-block hashing.** `stateHash` is a whole-document token, so an
  actively-typed editor refuses writes even where persistent ids would have kept
  the addresses valid. Making the guard finer-grained means a hash per block,
  and the complexity is not worth the narrow window it would recover.
- **Backfilling block ids.** Ids are opportunistic by design — stamped on write,
  never migrated. Stamping a whole document breaks byte-identical preservation
  and buries real edits in unreviewable diffs. See the plan §4.2.

---

## Scope gaps, if you ever want them

None of these are bugs; the surface was scoped to content on purpose.

- **No document lifecycle.** Content only — no publish, rename, move, status or
  handle management from either agent. The command registry already exposes some
  of this to the in-app Copilot; MCP has none of it.
- **No uploads.** `image` and `attachment` can only reference files that already
  exist. Authoring an image means someone uploaded it first.
- **No revision history access.** Claude can write a new revision but cannot
  read or diff prior ones — so it cannot answer "what changed last week".
- **Single author.** Everything is scoped to `MCP_AUTHOR_ID`.
- **No cross-post transactionality.** A multi-post refactor is N independent
  writes; failing halfway leaves the set inconsistent.
- **`content-server.ts` bypasses the authorization seam.** It talks Prisma
  directly and scopes by `authorId` by hand — the pattern CLAUDE.md warns
  against — rather than going through `src/lib/access.ts`. Low stakes at one
  user, but it is a second unguarded path to the documents, and it will stop
  being low stakes if this is ever exposed to more than one person.

---

## Verification debt

**The in-app Copilot's edit path has never been exercised in a browser.**

Everything else was checked against the live database: the MCP tools over 203
real posts, a create → edit → stale-hash-refused cycle, all 263 tables, and all
6070 lists read-rebuilt-reread with zero mismatches. Phase 4 — the Copilot
moving onto the bridge — has only `tsc`, lint and a spec over the pure repo
layer, because its executors depend on the Redux store and a live Lexical
editor.

Worth one manual pass before leaning on it. Specifically: that a proposal
renders, that accepting it lands the edit in the open editor, and that a stale
`stateHash` produces the refusal message rather than a crash.

**The compare-and-set (item 1) owes the same pass, and it is the same session.**
Its database half is verified; what is not is the editor's side of a 409 — that
the snackbar reads sensibly, that the tab stops retrying instead of announcing
every two seconds, and that reopening the document brings the buffered text
back. Set it up by opening a post in the editor, editing it from Claude Code
over MCP, then typing in the browser tab.
