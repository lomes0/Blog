# Haklex reprise — the five cut items, reopened

Status: **DONE — five of seven phases shipped 14 Aug 2026.** Phase 7 was
investigated and **refused on evidence**; §11.3 says why, and it invalidates a
claim §9 makes about what this plan closes. Nothing in §1–§7 should be read as a
to-do list without reading §11 first — four of its claims turned out to be
wrong, and one of those was load-bearing.

Reopens the five capabilities
[archive/haklex-adoption.md](./archive/haklex-adoption.md) cut in §10.7 and
§10.8. Written after re-reading the code the cuts were made against, not the
plan that recorded them — three of the five blockers do not survive that
reading, and one of the three dissolves into a seam that also answers
[claude-code-backlog.md](./claude-code-backlog.md) §4, open since 6 Aug.

The archive plan's cuts were correct **as reasons about what haklex ships**.
They were not reasons about what the capability costs us, because in three cases
the blocker was a property of their implementation rather than of the feature.
This plan separates those.

## 1. Scope

Five capabilities, sequenced by what unblocks what:

| # | Capability | Cut in | Depends on |
| - | ---------- | ------ | ---------- |
| 1 | Container-children seam (bridge only, no pixels) | — (new) | — |
| 2 | Live Shiki highlighting | §10.7 | — |
| 3 | jotai, fenced to the editor package | §10.7 | — |
| 4 | Nested doc node | §10.7 | 1 |
| 5 | Code snippet node | §10.7 | 1, (2) |
| 6 | Image resize modes + selection-anchored toolbar | §10.7 | (3) |

Phase 1 is new work this plan invents; the other five are the cut items. Phases
1, 2 and 3 are mutually independent and can run in any order or in parallel.

**Non-goals, carried forward from the archive plan and still refused:**

- **Not** `@lexical/code-shiki`. Phase 2 takes Shiki the *tokenizer*, not the
  Lexical integration — see §3.1 for why those are separable and §10.7 for what
  the integration does wrong.
- **Not** CodeMirror. Phase 5 builds the snippet on nodes we already have.
- **Not** haklex's image field model (`layout` / `displayWidth` as serialized
  fields). §10.7's positional-constructor hazard is real and unchanged; phase 6
  adds a `static`, never a field.
- **Not** a hover toolbar. Phase 6 anchors to selection, for the reason in §7.2.
- **Not** their `review-engine`, diff overlay, LiteXML, the block drag handle,
  the in-browser agent loop, or the static/edit node split. Those cuts stand and
  nothing here reopens them.

## 2. Measurements

Taken 13 Aug 2026 against the current tree. These are the facts the plan rests
on; each is a file and line, because three of them contradict the archive plan.

### 2.1 The Shiki blocker is their tokenizer, not Shiki

`registerCodeHighlighting(editor, tokenizer?)` takes a **custom tokenizer**:

```ts
// node_modules/@lexical/code-prism/dist/CodeHighlighterPrism.d.ts:16
export interface Tokenizer {
  defaultLanguage: string | null;
  tokenize(code: string, language?: string): (string | Token)[];
  $tokenize(codeNode: CodeNode, language?: string): LexicalNode[];
}
```

§10.7's finding — `node.setStyle(stringifyTokenStyle(...))` writing serializing
hex into `TextNode.__style` — is a property of `@lexical/code-shiki`'s
`$tokenize`. It is not something Shiki forces on a consumer.

Our class channel is intact and already dual-scheme: `theme.tsx:22` maps ~30
prism token names to `LexicalTheme__token*` classes, `theme.css:814` resolves
those to `var(--tok-*)`, and `theme.css:1314` overrides all eight under
`html.dark`. Nothing about that channel is prism-specific — it is keyed on
*token type strings*, and a tokenizer chooses those.

### 2.2 The bridge never touches a live editor

`applyOps` has **one** call site: `src/lib/agentWrites.ts:288`, against
`post.state`. Every read path (`outline`, `readBlocks`) likewise walks stored
JSON. There is no path where an op is applied through a mounted editor.

This is the fact that collapses `claude-code-backlog.md` §4. That decision is
framed as a choice between "address into nested editors — costs a second
addressing dimension, and **every op has to know which document it is operating
on**" and "refuse explicitly". The quoted cost is a live-editor cost. In
serialized JSON, `sticky.editor.editorState.root.children` is a children array
at an unusual key and nothing more.

### 2.3 The descent assumption is three copies of two lines

```
src/lib/content-bridge/address.ts:56   const childrenOf = (node) => Array.isArray(node.children) ? node.children : [];
src/lib/content-bridge/ops.ts:100      (same, plus `ensureChildren` at :105)
src/lib/content-bridge/blocks.ts:38    (same)
```

`BLOCK_CONTAINERS` (`address.ts:25`) is a seven-entry allowlist. `outline.ts`
does not descend on its own — it goes through `walkBlocks` (`:164`, `:224`,
`:253`), so it inherits any change to the seam for free. `stateHash.ts` walks
generic JSON via `canonicalize` and needs no change at all. `blockId.ts` touches
only one node at a time.

So the total surface for phase 1 is: one new module, three call sites deleted,
and `ops.ts`'s mutation paths (`:105`, `:249`, `:304`, `:325`, `:336`) pointed at
it.

### 2.4 Nested editors come in two shapes, and they want different answers

| Where | Serialized at | Shape |
| ----- | ------------- | ----- |
| `image.caption` | `caption.editorState.root.children` (`ImageNode/index.tsx:211`) | one paragraph of rich text |
| `sticky.editor` | `editor.editorState.root.children` (`StickyNode/index.tsx:95`) | a block list |
| `canvas.notes[i].editor` | `notes[].editor.editorState…` (`CanvasNode/index.tsx:98`) | **an array of** block lists |
| nested doc (proposed) | its own `doc.root.children` | a block list |

`claude-code-backlog.md` §4 treats these as one decision. They are not:

- A **caption** is one rich-text run. Addressing it as a child block gives an
  agent `b7.1` for a piece of text that is conceptually an attribute of the
  figure. It wants a **codec field** carrying inline markdown through the
  existing `inline.ts` round-trip, not a container.
- A **sticky** or a **nested doc** is a document. It wants the container seam.
- A **canvas** is a *list of* documents, which needs one synthetic level between
  the block and its blocks. It is the hardest arm and is scheduled last.

There is a second reason captions cannot use the seam: stored `image` nodes sit
**inside paragraphs** (`claude-code-backlog.md`, "Where things stand"), and
`paragraph` is not a container and must not become one — it carries text, and
descending into it would give two addresses for one piece of content. An inline
image is therefore unreachable by address no matter what phase 1 does. Only a
codec field reaches it.

### 2.5 The image layout channel already exists

`imageLayout.ts` carries percent width and alignment through the `__style`
string, `ImageTools.tsx:375` already writes them from the main toolbar, and
`ImageResizer.tsx:201` writes px into `__width`/`__height` during a drag. The
capability gap §10.7 describes is not a missing feature — it is that the two
write paths disagree about units and that the controls are not near the image.

`GraphNode:38`, `SketchNode:44` and `IFrameNode:55` all extend `ImageNode` and
re-enumerate its fields positionally in `clone` (`:52`, `:57`, `:66`) and their
constructors (`:137`, `:133`, `:110`). That hazard is why phase 6 adds a static.

## 3. Phase 1 — the container-children seam

**Bridge only. No pixels, no node changes, no new capability on its own.** It is
first because phases 4 and 5 are cheap after it and expensive without it.

### 3.1 Shape

One module, `src/lib/content-bridge/containers.ts`, owning both extension
points and exporting the helpers the other three files currently each define:

```ts
/** Children of an addressable container — the real array, not a copy. */
export function childrenOf(node: SerializedNode): SerializedNode[];
/** Same, creating the array (and any intermediate) if absent. */
export function ensureChildrenOf(node: SerializedNode): SerializedNode[];
/** A child's effective type — `node.type`, unless its parent synthesizes one. */
export function typeOf(node: SerializedNode, parent?: SerializedNode): string;
```

backed by a table:

```ts
const NESTED_CHILDREN: Record<string, (n: SerializedNode) => SerializedNode[] | undefined> = {
  sticky: (n) => n.editor?.editorState?.root?.children,
  "nested-doc": (n) => n.doc?.root?.children,
};
```

with `BLOCK_CONTAINERS` gaining the same keys. Everything not in the table keeps
`node.children`, so the default path is byte-identical to today.

**`childrenOf` must return the live array**, not a mapped one — `ops.ts` splices
it in place (`:325`, `:336`). That constraint is what makes `canvas` a separate
phase: its notes are frames without a `type`, so they need `typeOf` to
synthesize `canvas-note` *and* a second table arm for the note's own children.
`typeOf` exists in phase 1 with only the default implementation, so that phase 7
is an entry rather than a refactor.

### 3.2 What must not change

- **Addressing stays one dimension.** `b7.2` is the second child of the seventh
  block whether that block is a layout column or a sticky note. No `b7.note2.b1`
  spelling, contra `claude-code-backlog.md` §4's first option — a nested editor
  is a container like any other, and if it needs its own dimension then so does
  `details-content`.
- **`stateHash` must move when nested content moves.** It already will —
  `canonicalize` hashes the whole JSON — but it needs a spec saying so, because
  the guard silently degrading is how a stale write gets promoted.
- **A round-trip must remain loadable.** `ImageNode.importJSON` parses
  `caption.editorState` through a nested editor; the same for sticky. Ops that
  only splice `children` arrays inside are safe, and a spec should assert that
  by loading a mutated state through `importJSON`.

### 3.3 Gate

`npm test` at **+8 or more** specs over the pre-phase count, and the number
asserted rather than the colour (the §4.3 lesson). New coverage in
`content-bridge/__tests__/`: address and outline over a sticky fixture; an op
inserting, replacing, moving and deleting inside one; the freshness guard firing
on a nested edit; and a mutated state surviving `importJSON`. Plus
`npx tsc --noEmit`, `npm run lint`, `npm run check:codecs` (unchanged — no type
graduates in this phase).

## 4. Phase 2 — live Shiki

Independent of everything else here.

### 4.1 Shape

Two modules, split on the rule this repo keeps re-learning (§10.10): the logic
goes somewhere a spec can construct it.

- **`packages/editor/src/plugins/CodePlugin/shikiScopes.ts`** — import-free. One
  function, TextMate scope string → one of the token-type names `theme.tsx:22`
  already maps (`keyword`, `string`, `comment`, `function`, `punctuation`, …).
  Pure, table-driven, and the whole of the phase's correctness risk.
- **`packages/editor/src/plugins/CodePlugin/shikiTokenizer.ts`** — the
  `Tokenizer` impl. `codeToTokens(code, { lang, theme, includeExplanation: "scopeName" })`,
  each token's scopes run through `shikiScopes`, emitted as prism-shaped
  `{ type, content }`. **It never calls `setStyle` and never reads a theme
  colour.**

### 4.2 The sync/async problem, and the answer

`tokenize` is synchronous; `createHighlighter` and `loadLanguage` are not.

A module-level highlighter singleton is created from `shiki/core` with
`createJavaScriptRegexEngine()` (no WASM) and a preloaded set of the languages
this blog actually uses. For a language outside that set, `tokenize` returns the
code as one plain token, starts `loadLanguage`, and on resolve forces a
re-highlight by dispatching an update that dirties the code node. One frame of
unhighlighted code on first use of a rare language is the cost.

The whole module is `import()`ed from `CodeHighlightPlugin` so no grammar
reaches a page with no code block.

### 4.3 Why this also fixes `/view`

`/view` renders `exportDOM` output over stored JSON, and the stored JSON already
contains real `CodeHighlightNode`s carrying `highlightType`. So a document
highlighted by phase 2 exports correct classes, and `theme.css`'s `html.dark`
block does the rest. §10.7's deferred server-side option is therefore **not**
needed as part of this phase; it survives only as an optional back-fill for
documents that are never re-saved, and should not be built speculatively.

### 4.4 Gate

`shikiScopes.test.ts` over a corpus of real scope strings per language, asserting
every mapped name is one `theme.tsx:22` knows — a scope mapping to a class that
does not exist renders unstyled, which is the safe direction, but silently.

**The guard for the bug that caused the cut:** a spec that tokenizes a snippet
through a headless editor over the real registry, serializes, and asserts every
`code-highlight` node's `style` is empty. Put it in
`packages/editor/src/nodes/__tests__/` beside `serialization.test.ts`, which is
where someone looking for it will go. Building the editor is not optional here —
§10.3's rule.

Plus `npm run check:theme` (unchanged, but it is what would catch a `--tok-*`
regression) and a bundle check: `ANALYZE=true npm run build`, confirming no
grammar in the main chunk.

## 5. Phase 3 — jotai, fenced

**Assumed decision, stated so it can be reversed cheaply:** adopt it, scoped to
`packages/editor`, with a lint fence. The archive plan's objection — "that state
is local to one node and should be local state or context" — is satisfied by
*scoping* rather than by avoiding the library: a `Provider`-scoped atom is
literally node-local, and jotai has no global store to leak.

- One `Provider` per node subtree that needs it. No app-level provider exists,
  and adding one is the failure mode to watch for.
- `eslint.config.mjs` gains `no-restricted-imports` on `jotai` under `src/**`,
  the mirror of §10.6.2's `@mui/*`-under-`packages/**` ban and scoped the same
  way — by directory, so it is inherited rather than rediscovered.
- Probe the fence in both directions per the phase-1a set: `jotai`,
  `jotai/utils` and a type-only import each fail under `src/`, and each stays
  green under `packages/editor/src`.

**Reversal cost if the call is wrong:** phase 6 is the only consumer this plan
creates, so backing out is one component rewritten to `useReducer`. That is why
this phase is cheap to decide wrong and expensive to defer — deferring it means
writing phase 6 twice.

Gate: `npm run lint` with the probes, and the dependency appearing in
`package.json` under `dependencies`, not `devDependencies`.

## 6. Phases 4 and 5 — nested doc, and the code snippet

Both ride phase 1. Neither needs a new addressing concept.

### 6.1 Nested doc (phase 4)

A `nested-doc` block node holding one nested editor at `doc`, rendered as a
titled card that opens a dialog. In `NESTED_CHILDREN` and `BLOCK_CONTAINERS`, so
its interior is `b7.1`, `b7.2` and **every existing codec works inside it with no
new codec**.

Its own codec covers the wrapper only — title, and open/collapsed — and is
therefore about thirty lines plus a schema arm. `check:codecs` then refuses the
type on `OPAQUE_ALLOWLIST`, which is the enforcement §10.7 correctly said the
haklex version would fail.

The node set for the nested editor is `nestedEditorConfig`
(`nodes/nestedConfig.tsx`), unchanged — it already excludes the container nodes
that would recurse without bound, and `nested-doc` must be added to that
exclusion list for the same reason.

### 6.2 Code snippet (phase 5)

**Assumed decision:** build it, on our own nodes. If the product answer is "the
code block is enough", cut this phase — nothing else depends on it.

A `code-snippet` ElementNode whose children are ordinary `code` nodes, one per
file, with a tab strip. It goes in `BLOCK_CONTAINERS` with the *default*
accessor, because its children are real Lexical children — so it needs no
`NESTED_CHILDREN` arm, and the existing `code` codec reads and writes each file
on day one.

What we give up against haklex is CodeMirror's editing affordances — bracket
matching, multi-cursor, per-language completion. What we avoid is a second
editor framework, a second theming contract to reconcile with `html.dark`, and
a second upgrade surface. On a blog, tabs plus correct colours is the feature.

The per-file language selector reuses the code block's existing one. With phase
2 landed, each file highlights through the same tokenizer.

### 6.3 Gate

`check:codecs` green with `nested-doc` **absent** from `OPAQUE_ALLOWLIST` —
that absence is the phase's real assertion. `check:nodes` for both new classes,
and a `serialization.test.ts` arm each, constructed through a live editor.
Outline and ops specs over a nested-doc fixture, which phase 1's fixtures make
mechanical.

## 7. Phase 6 — image resize modes and a selection-anchored toolbar

Two changes with different risks; ship them as two commits.

### 7.1 One resizer, two write modes

`ImageNode` gains `static resizeUnit: "percent" | "px"`, overridden to `"px"` in
`GraphNode`, `SketchNode` and `IFrameNode`. The drag already computes a pixel
delta; on commit it becomes `widthPatch(percent)` through `imageLayout.ts` when
the flag is `"percent"`, and `setWidthAndHeight` when it is `"px"`.

**A static, not a serialized field**, and the reason is §10.7's: a new field on
`ImageNode` is four constructors, four clones, four `importJSON`s, four
serialized types, four `check:nodes` arms and a migration for four stored node
types. A static is a property of the class, costs one line per subclass, and
cannot appear in stored JSON at all.

Percent for the three subclasses is refused on its own merits and not merely on
cost: an iframe or a GeoGebra applet at `width: 50%; height: auto` has no
intrinsic aspect ratio to resolve against and collapses.

### 7.2 Selection-anchored, not hover

The controls already exist — `ImageTools.tsx` has the width slider, the float
buttons and the alignment set. This phase **moves** them, rendering the same
controls in a floating panel anchored to the selected figure, positioned by the
mechanism `FloatingToolbar` already uses for text selection.

Anchoring to selection rather than hover is what avoids §10.6.3's structural
trap: the panel is a root-level popover, never opened from inside a
`Menu.Popup`, so its first click cannot read as an outside press. It is the same
resolution Table and Note reached when their colour triggers moved out of their
menus. Hover would additionally fight the resize handles' hit areas and is
hostile on touch.

### 7.3 Gate

`check:nodes`, `check:theme`, and `imageLayout.ts`'s existing spec extended for
the unit split — the parsing and the emitted CSS stay in that import-free module,
which is the whole reason it exists.

The caret contract is **not** gateable and goes on the browser list below. It is
the `finalFocus` failure class from §10.6.3 and it passes every check.

## 8. Verification

Per phase: `npx tsc --noEmit`, `npm run lint`, `npm test` **at an asserted
count**, plus `check:nodes` (2, 4, 5, 6), `check:codecs` (1, 4, 5),
`check:theme` (2, 6) and `npm run build` (2, for the bundle claim).

No automated check covers API authorization, and phase 1 changes what an op can
reach. `applyOps` is called from one place behind `agentWrites.ts`, so
authorization is unchanged by construction — but exercise one nested write end
to end against local Postgres before believing that, and **read the docker
warning in CLAUDE.md before starting anything on `5432`.**

### 8.1 What will need a human at a browser

Named per §10.6.5's rule that this list is written before the work, not after:

1. **Caret return** after the image panel closes, after Escape, and after an
   outside press (phase 6).
2. **A rare language** in a code block — the one-frame unhighlighted state, and
   that the re-highlight actually fires (phase 2).
3. **Dark mode over a Shiki-highlighted block** in both schemes. `check:theme`
   proves no literal is scheme-invariant; it cannot prove the result is legible.
4. **A nested doc round-trip through `/view`** — cached, so it needs a re-save.
5. **A sticky note edited by an agent**, then opened in the editor: the phase-1
   claim that a mutated nested state still parses.

## 9. Open questions

Two, both assumed in the text above so the plan is executable either way:

1. **jotai — adopt with a fence, or rewrite each port to context?** Assumed
   adopt (§5). The answer turns on how much more haklex UI we intend to port; if
   phase 6 is the last of it, context is cheaper. Deciding *after* phase 6 means
   writing phase 6 twice.
2. **Is the code snippet a real need, or is the code block enough?** Assumed
   real (§6.2). Nothing depends on this phase; cutting it costs nothing already
   spent.

A third is answered rather than asked: **`claude-code-backlog.md` §4 resolves as
"address into them — as ordinary containers".** The cost that decision was
deferred on does not exist (§2.2), and the split in §2.4 is what makes the
answer cheap: captions take a codec field, documents take the seam. That backlog
item, and the `sticky` / `canvas` codecs it blocks, close as phases 1 and 7.

## 10. What this plan is likely to get wrong

Recorded now, in the shape §10.6.3 took, so execution has something to correct
rather than a clean sheet to be surprised by:

- **The scope→class table will be the whole of phase 2.** The tokenizer is
  fifty lines; the mapping is where every wrong colour will come from, and the
  eight `--tok-*` variables are coarser than Shiki's output. Expect the table to
  want more variables, and expect that to be a `theme.css` change with an
  `html.dark` twin — which is the exact rot `check:theme` exists to catch.
- **`childrenOf` returning a live array will be violated by the first
  convenience.** Any arm that maps, filters or synthesizes silently breaks
  writes while reads stay correct. Canvas is where the pressure comes from, and
  it is scheduled last for that reason.
- **The count of things phase 1 unblocks is probably higher than four.**
  `kanban` is on `check:nodes`'s exempt list and holds cards; nobody has checked
  whether it wants an arm.
- **Phase 6's two commits will want to be one.** They should not be: the resize
  unit is a serialization-adjacent change with a stored-data blast radius, and
  the panel is pixels. Reviewing them together is how the first hides in the
  second.

## 11. Execution log (14 Aug 2026)

### 11.1 What shipped

| Phase | Commit | Note |
| - | ------ | ---- |
| 1 — container seam | `31eec273` | plus a 12-line vanilla-extract transform in `vitest.config.mts`, without which no spec can build a real editor |
| 2 — live Shiki | `6f8b5274` | `themes: []`; two measured pins, see §11.2 |
| 4 — nested doc | `a3418e4d` | first real consumer of the seam; closes a data-loss hazard phase 1 found |
| 5 — code snippet | `e546b2ed` | no `NESTED_CHILDREN` arm needed, as §6.2 predicted |
| 6a — resize unit | `0bdccf83` | `nodes/` only |
| 3 + 6b — jotai, anchored panel | `539164ae` | landed together; a fenced dependency with no importer is what `check:unused` exists to catch |
| 7 — canvas notes | — | **refused**, §11.3 |

**660 tests / 36 files → 964 / 45.** `tsc`, lint, `check:nodes` (21 classes),
`check:codecs` (15 encodable / 12 allowlisted of 27), `check:theme` (40 style
files), `check:unused` and `npm run build` all green at every commit.

### 11.2 What this plan got wrong

Worst first, in the shape §10.6.3 of the plan this one annotates took.

- **§9's third answer is wrong, and it is the load-bearing one.** It says
  `claude-code-backlog.md` §4 "resolves as address into them", with captions
  taking a codec field and documents taking the seam. The seam half is right and
  shipped. The rest does not follow, because **an inline node inside a paragraph
  is unreachable by *either* mechanism**: a codec field is reached through
  `nodeToBlock`, which only runs on addressable blocks. §2.4 states that fact
  about images in its own closing paragraph and then fails to apply it to the
  `sticky` and `canvas` rows two lines above, or to its own caption answer. What
  actually closes §4 is `nested-doc` — a type this plan invented and made
  block-level on purpose. For `image` (67 stored), `sticky` (0) and `canvas`
  (131) it stays open, and the blocker is not the bridge at all: it is that
  those three are inline decorators.
- **§2.4's canvas row costs the wrong thing.** It bills canvas as "the hardest
  arm" — a synthetic level, a threaded `parent`. The real blocker is one rung
  below: there is nothing to attach an arm to. See §11.3.
- **§2.3 undercounts `childrenOf` at three copies. There are four.** The fourth
  is `src/lib/proposalDiff.ts:112`, and it was deliberately left unmerged:
  reading through the seam without a matching *write* half is the same
  "reads correct, writes lost" failure the seam's own docs warn about, since
  `rebuild` writes children back as `{ ...proposal, children }`. Consequence,
  documented in that file: an edit inside a `nested-doc` reviews as one
  whole-block hunk. `code-snippet` is unaffected — it is the first container
  where both copies agree.
- **§6.1 omits `body` from the nested-doc codec, and the codec cannot work
  without it.** Addressing is snapshot-based, so a node inserted by op 1 has no
  address for op 2; with no `body` field an agent could create a nested doc and
  then never put anything in it. The same lesson applied to `code-snippet`'s
  `files`.
- **§7.1's merit argument for pixel resizing is only true of the iframe.** A
  sketch and a graph render as `<svg>` *with* an intrinsic ratio — `ImageTools`
  already offers them the percent slider for that reason. They are `"px"` on two
  other grounds: their own editors write pixels into `__width`/`__height`, and
  `ImageComponent` synthesizes `viewBox` from the source document's attributes,
  so a source declaring none yields `viewBox="0 0 null null"`.
- **§4's `codeToTokens(..., includeExplanation: "scopeName")` was not usable.**
  It requires a theme, i.e. loading colours in order to discard them. Shiki also
  merges tokens by resolved colour, so a rules-free theme returns one token per
  line with an empty explanation — measured. Phase 2 uses `tokenizeLine` against
  the raw grammar with `themes: []`, which makes "no colour reaches a node"
  structural rather than disciplinary.
- **§4 assumed a custom tokenizer decides which languages are supported. It does
  not.** `registerCodeHighlighting` gates on `@lexical/code-prism`'s
  `isCodeLanguageLoaded`, which reads `Prism.languages`, and returns *before*
  calling the tokenizer. So Prism stays, and `config.tsx`'s two hand-imported
  grammars are now load-bearing for an entirely different reason than the one
  they were added for — documented at the import site, because the next reader
  deletes them otherwise.
- **§10's own prediction that the scope table would want more `--tok-*`
  variables did not hold.** The existing eight covered every token type;
  `check:theme` did not move. The other half of that prediction — that the table
  *is* the phase — was right: two arms were wrong on first pass.
- **§5's gate says `package.json` under `dependencies`.** jotai is declared in
  the *root* manifest; `packages/editor/package.json` deliberately declares
  nothing. The enforcement is the lint fence, not the manifest location.

### 11.3 Phase 7 — refused, not deferred

`CanvasNode extends DecoratorNode` and never overrides `isInline()`, whose
Lexical default is `true`; `CanvasPlugin` wraps it on insert with
`$wrapNodeInElement`, the same line `StickyPlugin` has. Verified against a live
editor rather than read: a canvas placed at root, in a `layout-item` and in a
`details-content` comes back paragraph-wrapped in all three, because those two
containers are shadow roots and reject inline children exactly as root does.
Every other member of `BLOCK_CONTAINERS` is excluded some other way. And
`claude-code-backlog.md` already measured the corpus: all 131 stored canvases
are paragraph-wrapped today.

So the arm would resolve against hand-written fixtures and against **nothing in
the database**. Building it would have produced correct reads of zero documents
— phase 1's sticky arm again, without sticky's excuse of having no stored data.

`isInline(): false` was measured as the alternative and is not sufficient on its
own: a *freshly* created canvas would then sit at root, but the 131 stored ones
are **not** unwrapped on load. Closing this needs a migration or a hoisting
transform, and that is not mechanical — a paragraph can hold prose alongside the
board, so unwrapping means splitting it and deciding what happens to the
surrounding runs. That is a product and data call, not a phase.

**The cheap thing that is actually unblocked** is `claude-code-backlog.md` §2's
read-only extraction, which reaches inline nodes through `plainText` and would
turn `canvas 7 notes` into the notes' text. Unrelated to the seam, and it works
through a paragraph.

### 11.4 Guards added, and what each was for

Three of the four exist because execution found a live hazard, not because the
plan anticipated one:

- **`NESTED_EDITOR_REFUSES`** (phase 4). The block IR can author node types a
  nested editor cannot register, and `StickyNode.importJSON` swallows the parse
  failure and returns an *empty* note — the write reports success and the
  content is gone. Refused now at both `applyOps` and `stateFromBlocks`, along
  the whole ancestor chain. A parity test derives the set from the two configs
  rather than restating it.
- **`ONLY_CHILD_TYPE`** (phase 5). Without it an agent's stray paragraph inside
  a snippet is not refused, it is silently *relocated* by a transform in a later
  session.
- **The `collapseAtStart` transform** (phase 5). Backspace at the head of a file
  turns a code block into a paragraph — an ordinary keystroke breaking the
  invariant.
- **The empty-`style` spec** (phase 2), which is the one guard the plan did ask
  for, and the only one that pins a bug that already happened.

### 11.5 Still wants a human at a browser

§8.1 stands, minus item 2's mechanism (now covered by a spec that lazily loads
`rust` and asserts the re-highlight fires; what a spec cannot answer is how the
frame *looks*). Added since:

1. The anchored panel sits 10px below the figure and may overlap the outer hit
   area of the `s`/`se`/`sw` resize grips.
2. A nested doc and a code snippet rendered at `/view` in both schemes — cached,
   so both need a re-save.
3. The caret after the panel closes. It should be safe by construction — the
   panel contains no Base UI floating component at all and every control cancels
   `mousedown` — but that is the §10.6.3 failure class, and no gate here can see
   it.
