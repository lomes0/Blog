# Nested editors — full support

Status: **DONE — both phases shipped 27 Aug 2026.** §6's acceptance list is
met: a canvas's notes are addressed `b2.1`, their blocks `b2.1.1`, an image's
caption is a codec field, and a sticky's blocks became reachable the moment its
node stopped being inline. The migration ran against the dev database — 259
wrapper paragraphs across 5 documents, 0 skipped. Two corrections to the text
below are in §7.

Originally: **decided 27 Aug 2026, not started.** `claude-code-backlog.md` §4 is
answered **"address into them"**, and this plan is what that costs. It reopens
`haklex-reprise.md` §11.3, which refused phase 7 on evidence — the evidence was
right about the mechanism and wrong about the corpus, and §2 below is the
re-measurement that says so.

Supersedes nothing. Closes `claude-code-backlog.md` §4 and the `image`,
`sticky` and `canvas` codecs it blocks.

---

## 1. What is unreachable, and why

`image.caption`, `sticky.editor` and every entry in `canvas.notes` hold a
complete serialized Lexical editor — a sub-document inside a block. The bridge
has had the seam for reaching them since `haklex-reprise.md` §3:
`containers.ts` already answers "where does this container keep its children",
and `BLOCK_CONTAINERS` already lists `sticky`. None of it fires, for a reason
that has nothing to do with nesting:

**All three nodes are inline.** `CanvasNode`, `ImageNode` and `StickyNode`
extend `DecoratorNode` and never override `isInline()`, whose Lexical default is
`true`, and their plugins wrap them on insert with `$wrapNodeInElement`. So each
one lands *inside a paragraph*, a paragraph is not a `BLOCK_CONTAINER`, and a
node inside one has no address at all. The seam is correct and unreachable.

That is the wall. It is not an addressing problem and never was.

## 2. The corpus, re-measured 27 Aug 2026

`haklex-reprise.md` §11.3 refused phase 7 because unwrapping the stored canvases
"is not mechanical — a paragraph can hold prose alongside the board, so
unwrapping means splitting it and deciding what happens to the surrounding
runs. That is a product and data call, not a phase."

Measured across **all 1,475 stored revisions**, wrapper paragraph by wrapper
paragraph:

| node         | occurrences | alone in its paragraph | sharing it |
| ------------ | ----------- | ---------------------- | ---------- |
| `canvas`     | 192         | **192**                | **0**      |
| `image`      | 67          | **67**                 | **0**      |
| `sticky`     | 0           | —                      | —          |
| `attachment` | 178         | 176                    | 2          |
| `sketch`     | 64          | 30 (34 in a heading)   | 0          |
| `math`       | 8           | 0                      | 7          |
| `graph`      | 13          | 0                      | 3          |

**The product call does not arise.** Not one stored canvas or image shares its
paragraph with anything. The unwrap is a mechanical replace-the-paragraph-with-
its-only-child, and the case §11.3 could not decide has no instances to decide
about.

Two things the same table settles:

- **`math` and `graph` are genuinely inline** — every stored one shares a
  paragraph or sits in a heading. They stay `DecoratorNode` defaults, and they
  are not in scope here.
- **`attachment` and `sketch` are borderline** and also out of scope: an
  attachment holds no nested editor, and a sketch's only reachable field is
  `altText` (`claude-code-backlog.md`). Nothing here blocks doing them later.

Current heads hold **4 canvases across 4 documents and no images**, so the live
blast radius is four nodes. The other 255 occurrences are history, which matters
only for a revision restore — §4 covers it.

## 3. Phase A — the wall comes down

1. `isInline(): false` on `CanvasNode`, `ImageNode`, `StickyNode`.
2. Drop `$wrapNodeInElement` from `CanvasPlugin`, `ImagePlugin`, `StickyPlugin`,
   the way `NestedDocPlugin` and `CodeSnippetPlugin` already do — both carry a
   comment saying why, and those comments become true of six plugins instead of
   two.
3. An unwrapping **node transform** for content that predates the migration —
   a pasted clipboard payload, a restored revision, an import bundle. A
   paragraph whose only child is one of the three collapses to that child.
   Precedent is `CodeSnippetNode/guard.ts`, which does the mirror image.

Point 3 is what makes point 4 optional rather than load-bearing, and it is
deliberately the same rule as the migration so there is one definition of
"unwrappable".

4. `pnpm nodes:unwrap` (`status | run [--dry-run]`) over stored revisions.
   Rewrites `data` only where the paragraph holds exactly one child of one of
   the three types; **counts and skips anything else** rather than deciding it.
   `blobHashes` is unaffected (an unwrap moves an `image` node, it does not
   change its `src`), but the script calls `reconcileDocumentBlobs` anyway,
   because the rule in CLAUDE.md is about writes that change revision content
   and not about writes that were reasoned to be safe.

## 4. Phase B — the seam, finally reached

1. `BLOCK_CONTAINERS` gains `canvas` and `canvas-note`. `sticky` is already
   there and starts working the day phase A lands.
2. `containers.ts` gains the canvas arm. This is the one place the shape is
   awkward: **a canvas's notes are frames with no `type` of their own**, so the
   dispatch cannot be `node.type`. `typeOf(node, parent)` is already in that
   file, unread, with a comment saying it exists for exactly this — it grows one
   arm returning `"canvas-note"` when the parent is a canvas, and `childrenOf`
   starts taking the parent so it can ask.
   - `canvas` → the live `notes` array.
   - `canvas-note` → `editor.editorState.root.children`, which is the same path
     `sticky` already declares.
3. `image` gets a codec with `caption` as a **field**, not as addressable
   children (`haklex-reprise.md` §2.4: captions take a codec field, documents
   take the seam). An image is one block with `alt`, `src` and `caption`; a
   canvas note is a container of blocks. The split is the difference between
   content that is *about* a block and content that *is* a document.
4. Schema arms in `content-bridge/schema.ts` for every new block type, or
   `check:codecs` fails the run — which is the obligation
   `archive/claude-code-lexical.md` §4.6.1 attaches to graduating a type.

## 5. What this is likely to get wrong

- **The live-array rule.** `containers.ts` documents it and
  `containers.test.ts` asserts array *identity*: an arm that maps or copies
  breaks writes while leaving every read correct. The canvas arm returns
  `node.notes`, which is a live array of frames rather than of nodes — the first
  arm in that table whose elements are not `SerializedNode`. If anything here
  rots, it is that.
- **Threading the parent.** `childrenOf` is called from `address.ts`,
  `blocks.ts`, `ops.ts` and `outline.ts`. A call site that keeps passing no
  parent silently loses canvas notes rather than failing.
- **`isInline` is observable in the editor, not just in JSON.** Selection,
  deletion and drag behaviour around a block-level decorator differ from an
  inline one. Four documents hold a canvas; they are the manual check.

## 6. Acceptance

- `outline` on a document holding a canvas addresses its notes, and
  `read_blocks` returns their text.
- `apply_ops` can insert a paragraph into a note and the note still loads.
- A revision predating the migration, restored, comes back unwrapped.
- A round-trip test per graduated type, fed to the zod schema — the standing
  rule in CLAUDE.md.

## 7. What this plan got wrong

Two things, both in §4:

1. **Threading the parent was avoidable, and avoiding it was the right call.**
   §4.2 and §5 assumed `childrenOf` would start taking the parent so a frame
   could be recognised by where it sits — thirty call sites, each of which
   fails *silently* if it keeps passing nothing. It is recognised by its own
   shape instead: a canvas note is the one thing in stored content with no
   `type` carrying a whole serialized editor, so `isCanvasNote(node)` answers
   from the node alone and `typeOf` lost its unused `parent` argument rather
   than gaining a used one. What did have to change is every *switch* on
   `node.type` in the bridge — three of them — which fails loudly.
2. **`canvas` needs no codec, and neither does a note.** §4 implies one. Both
   are structural containers like `layout-item`, so they stay opaque and
   `scripts/check-codecs.mjs` records why. `image` is the only type that
   graduated here, and its allowlist entry — "a cropped-source payload the IR
   has no shape for" — was describing fields carry-through already preserves.

The one thing §5 called correctly is where the risk sits: the canvas arm is the
first in `NESTED_CHILDREN` whose elements are not `SerializedNode`, and it
returns `node.notes` live for the reason at the head of `containers.ts`.
`__tests__/canvas.test.ts` asserts that identity rather than equality.
