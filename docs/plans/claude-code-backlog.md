# Claude Code support — remaining tasks

**Status: backlog.** Everything the plan in
[archive/claude-code-lexical.md](./archive/claude-code-lexical.md) scoped is built
(phases 1–5, plus tables and nested lists). This file is what is _left_, why
each item exists, and what it would cost. Nothing here is in progress.

Read the plan first for the design; this file assumes it.

## Where things stand

The content bridge (`src/lib/content-bridge/`) addresses Lexical documents by
block. Both agents run on it: the MCP server (`mcp/content-server.ts`) for
Claude Code in the terminal, and the in-app Copilot
(`packages/editor/src/utils/copilotAgentExecutors.ts`). Nothing converts documents to
Markdown any more.

Coverage against this blog's real content, measured 2026-08-06 across every
stored revision:

|                                         |                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Addressable blocks                      | ~31,000                                                                    |
| Reading as a typed block                | **93.2%**                                                                  |
| Still opaque at block level             | `tablerow` (1357), `layout-item` (741) — pure structure, nothing to author |
| Block-level content types with no codec | **none**                                                                   |

That last row used to be narrower than it sounded: stored `image`, `canvas` and
`sketch` nodes sat _inside_ paragraphs rather than at the top level, so they
never reached `nodeToBlock` and never showed up as opaque blocks either — they
reached the model as bracketed descriptors through `plainText`
(`blocks.ts:58`). **That is no longer true of the first two.** All three
decorators are block-level as of 27 Aug 2026, `canvas` descends to its notes and
their blocks, and `image` has a codec carrying its caption
([nested-editor-support.md](./nested-editor-support.md)). `sketch` and `graph`
stay describe-only on purpose — see "Never" below. The counts in the table
predate that work and have not been re-measured.

So the remaining work is not "finish the codecs", and it is no longer capability
either. The one correctness hole is closed (item 1, kept here for the record),
items 2 and 4 are closed by the nested-editor work, 5 and 6 are answered and
built, and **what is left is two decisions**: 3 and 7.

---

## 1. Compare-and-set on `head` — **DONE (6 Aug 2026)**

The hole: `head` was a client-chosen uuid written unconditionally, so a tab open
a while could point it back at its own revision and orphan an agent's, with
nothing on screen to say so — autosave went quiet in Aug 2026
(`plans/archive/quiet-autosave.md`), so there is no indicator to notice either. The
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

## 2. Descriptors could carry text — MOOT (27 Aug 2026)

The hole: reading a block with no codec gave shape, not content. `canvas
7 notes` said a board was there but not what the notes said, so "summarise this
post" silently skipped them. `canvas` (131 stored) was the one case left, and
the proposed fix was read-only text extraction into the descriptor — a morning's
work on the read path.

**It was closed by addressing instead, which is strictly better.** Item 4 landed
on "address into them", so a canvas's notes are containers rather than
descriptor text: the board is `b2`, a note `b2.1`, and the note's paragraphs
`b2.1.1` — ordinary text blocks that `read_blocks` returns and `set_text`
edits. Extraction would have made them readable; addressing made them
authorable, and there is nothing left to extract. `image` captions went the
other way for the reason `haklex-reprise.md` §2.4 gives — a caption is content
*about* a block, so it is a codec field next to `alt` and `src`, not a
sub-document.

What survives of the original complaint is narrow and was never the case being
argued: a decorator that **shares a paragraph with other content** is not
unwrapped (the transform and `pnpm nodes:unwrap` both collapse only a paragraph
whose sole child is one of the three, and count anything else rather than
deciding it), so it stays inline and still reaches the model as a bracketed
descriptor. The dev corpus held none — 259 wrapper paragraphs unwrapped across 5
documents, 0 skipped.

Not `kanban`: it has had a full codec since `6abf8c09` — `nodeToBlock` returns
`{type: "kanban", tasks}` and `readKanbanTasks` (`blocks.ts:252`) already yields
`name`, `description`, `tags`, `stage` and `priority` — and this blog stores
zero of them anyway. The `3 lanes · 11 cards` example that used to be here was
copied from the plan §4.4, written before that graduation; the descriptor now
only fires for a kanban reached inline.

**Cost.** Nil — the work happened elsewhere. Kept here for the record, and
because the reasoning ("extraction is cheaper than addressing") is the kind that
gets re-proposed.

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

## 4. Nested editors — ANSWERED 27 Aug 2026

**Answered: address into them.** The work is
[nested-editor-support.md](./nested-editor-support.md); this section stays as
the statement of the problem it solves. What follows is what the question looked
like before the answer, and the two things that turned out to be wrong about it
are recorded at the end.

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

### What the framing above got wrong

Two things, both found on the way to answering it:

1. **The stated cost of "address into them" does not exist.** It was "every op
   has to know which document it is operating on", which is a *live editor*
   cost; the bridge only ever walks stored JSON
   (`archive/haklex-reprise.md` §2.2). In serialized form a nested editor is a
   children array at an unusual key.
2. **The blocker was never nesting.** All three nodes are inline decorators, so
   they sit inside a paragraph and have no address to descend *from*. The counts
   in the table above are also all-revision counts — current heads hold 4
   canvases and no images (`nested-editor-support.md` §2).

---

## 5. A deleted rich block should be visible in the proposal — **ANSWERED + DONE (28 Aug 2026)**

An agent can legitimately be asked to delete a canvas or a table, so refusing
the operation is wrong. But a board of 40 notes disappearing with nothing on
screen to say so is also wrong. In this blog the deletes that carry
unrecoverable-looking content are `canvas` (131), `image` (67), `sketch` (64)
and `table` (263).

**Answered: an inline note naming what goes, and no second confirmation.** The
louder option was offered and declined. The gate was never the missing part — a
proposal is already reviewable and declinable, which is exactly what
`rename_post` and `delete_post` lack and why *those* two are confirmed. So
approving stays one click and what was added is the sentence.

**The wording is `removes 1 canvas · 7 notes`.** Verb first, count, then the
block's own descriptor — `1 table · 3 rows × 4 columns`, `1 collapsible
section · open · Appendix`. Past one block the qualifier is dropped and the
kinds are counted instead (`removes 2 images and 1 table`), because three
qualified nouns stop being scannable. None of it is a new vocabulary: the noun
is the block type `nodeToBlock` reads, and the qualifier is the outline's own
preview, exported as `blockPreview` so the two cannot drift. Prose is
deliberately silent — a removed paragraph is legible from the diff beside it,
and decorating every one of them would bury the case this exists for.

### Where it says it, and why not where this section said

The premise above had gone stale. `ActionPreview.tsx` stopped rendering content
ops in [archive/ai-surface-consolidation.md](./archive/ai-surface-consolidation.md)
§4.4 — a write proposes on the tool call now and is reviewed as a diff — so
there has been no `delete b7` line to annotate for some time.

An address resolves in exactly one place: **the write**, where the block is
still in the state the op was addressed against. So `proposeOps`
(`src/lib/agentWrites.ts`) builds the phrase there and folds it into the
proposal's `summary`, which `RightRail/ProposalsSection` and `AgentChangeBar`
already render — the two surfaces carrying an Approve button. Neither had to
learn anything and nothing loads a revision to find out. That column had no
other writer: no agent has ever passed a `summary`, so every proposal until now
read "Edited this document".

The review keeps a call of its own, because it holds the nodes rather than the
addresses: a delete card in `Diff/ProposalReview` names the block beside
"Removed", in its heading and its `aria-label`. That is what covers a block
whose `exportDOM` renders to nothing.

The logic is one import-free module, `content-bridge/removals.ts`, under
`removals.test.ts` — including the two degradations that matter: an address that
no longer resolves, and a stored node this build cannot read. Each costs its own
clause and nothing more. A stale proposal must never be the thing that crashes
the rail.

**Not covered, on purpose.** `replace_block` can drop a rich block too and is
not counted — its replacement is on screen next to it in the review. And a
squash keeps the *latest* batch's note, exactly as it already keeps the latest
batch's summary, so a canvas deleted in batch 1 stops being named if batch 2
removes something else. Naming the whole pending proposal instead means diffing
it against head at write time: a revision load per batch, for a line of prose.

---

## 6. Series placement on create — **ANSWERED + DONE (28 Aug 2026)**

The question: `create_post` takes an optional `seriesId` and otherwise lands the
post at root, unpublished. When you say "publish this session as an article",
should the agent pick a series itself (it can list them), or always land at root
for you to file?

**The answer: agent proposes, does not decide.** The post still lands at root —
no silent placement, ever — but the create's result carries the author's series
back as candidates, so a suggestion the agent could cheaply make is not lost to
a round trip nobody makes. The agent names one and says why; filing it stays
the author's action, in the app.

Two options rejected, recorded so nobody drifts back to them:

- _Always root, and say nothing._ Loses a suggestion that costs one three-column
  query, and leaves the agent's read of the piece on the floor.
- _Let the agent file it._ A wrong guess buries a post somewhere unexpected, and
  a create is not reviewable the way `apply_ops` is — there is no proposal to
  decline.

**What the tool returns now** (`src/lib/mcp/server.ts`, `create_post`):

- With `seriesId`: unchanged behaviour, plus one line saying it was filed there.
  The caller already decided, so there is nothing to suggest and no extra query.
- Without: the post lands at root, and the response says `Not filed`, lists the
  author's series (`id — title: description`, their own order, capped at 20 with
  a pointer to `list_series` past that), and states that no tool here moves a
  post between series. The wording is deliberately blunt about being advice: a
  model that read a series list and concluded the post was in one would report a
  placement that did not happen.
- The candidates come from the same author-scoped query `list_series` uses
  (`prisma.series.findMany({ where: { authorId } })`, shared as `authorSeries`),
  never the public `findAllSeries`.

Nothing about the created document changed: `seriesId` is still whatever the
caller passed, and a caller that ignores the suggestion gets exactly the old
behaviour. There is one tool definition — `mcp/content-server.ts` is only a
transport — so the stdio server and `POST /api/mcp` got this together. Covered
in `src/lib/mcp/__tests__/server.test.ts`, including the case that matters most:
an explicit `seriesId` suggests nothing and costs no read.

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
