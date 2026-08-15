# One code block card

Status: **Shipped 14 Aug 2026 in `7ec096a7`** — status line corrected 15 Aug,
having said "not started" since the day it landed. `ViewCodeEnhancer.tsx` is
deleted, `CodeActionMenuPlugin.tsx` lost its rect measurement, scroll-container
portal and reposition listeners, and the card lives in `CodeNode`'s own DOM with
`codeCard.test.ts` and `codeCollapse.test.ts` behind it. Read the body as the
argument for a thing that now exists, not as work outstanding.

Originally: specs the `CodeBlockCard` that
[archive/haklex-adoption.md](./archive/haklex-adoption.md) §6.1 described and
§10.7 cut — cut as collateral, because §6.1 bundled the card with live Shiki and
the cut was only ever about the tokenizer. [haklex-reprise.md](./haklex-reprise.md)
shipped Shiki; the card was never separately argued against.

**It is not new work. We already have this card twice**, in two languages, on two
surfaces, and they have drifted. This plan is convergence, and its likely net
LOC is negative.

## 1. What already exists

| | `CodeActionMenuPlugin.tsx` | `ViewCodeEnhancer.tsx` |
| - | -------------------------- | ---------------------- |
| Surface | the editor | `/view`, `/print`, any static render |
| Size | ~19 KB | 174 lines |
| Technique | React, portalled into the scroll container, positioned by bounding rect on every update + resize | imperative DOM, wrapped around each `<pre>`, re-run by a `MutationObserver` |
| Language glyph + label | yes | yes |
| Copy | yes | yes |
| Word wrap | **yes** | no |
| Collapse | no | **yes** |
| Ln/Col + line count footer | **yes** | no |
| Active-line highlight | **yes** | no |
| Filename | no | no |

They share exactly one module, `utils/codeLanguage.ts`. Everything else — the
copy button, its copied state and its 1500 ms reset, the glyph chip, the header
layout — is written twice, once in JSX and once in `document.createElement`.

Three consequences, and the third is the one that matters:

1. **The feature sets have already diverged**, in both directions. Neither is a
   subset of the other, so "make one match the other" is not a direction.
2. **A fix lands in one place.** The `width`-onto-the-wrapper handling in
   `ViewCodeEnhancer.tsx:58-65` has no editor counterpart.
3. **`filename` is plumbed and rendered by neither.** haklex-reprise phase 5 put
   it through `CodeNode` end to end — `__filename`, `data-filename`,
   `exportDOM`, `exportJSON` — and only the code snippet's tab strip reads it. A
   standalone block can carry a filename that nothing displays.

## 2. The decision this plan exists to make

**Card, not overlay.** The chrome becomes part of the block's own DOM rather
than a floating layer positioned over it.

The argument is not aesthetic. The overlay exists because "Lexical owns the
contentEditable DOM of each code block, so we cannot inject chrome as child
elements without fighting reconciliation" (that plugin's header comment). That
was true when it was written and is no longer the only option: haklex-reprise
phase 5 built exactly this — `CodeSnippetNode.createDOM` sets aside a host
element and `getDOMSlot(element).withElement(files)` points Lexical's
reconciliation at a *different* child, so the tab strip lives in the node's DOM
and Lexical never touches it. The same two calls work for a code block header.

What the card buys, beyond one implementation instead of two:

- The chrome scrolls, wraps, prints and exports with the block, because it *is*
  the block. The 46/32 px padding reservation, the rect recomputation, the
  scroll-container portal, the four listeners and the zero-rect guard added for
  hidden snippet files all become unnecessary.
- `/view` gets the header from `exportDOM` instead of from a `MutationObserver`
  racing hydration.

What it costs is in §4.

## 3. Scope

| # | Phase | Owns |
| - | ----- | ---- |
| 1 | The shared card | One React component + one token set; the editor renders it through `getDOMSlot` |
| 2 | Collapse | Overflow detection, the 50 vh threshold, and where the collapsed state lives |
| 3 | Filename | Rendering the field phase 5 already stores |
| 4 | Retire the two old chromes | Delete `ViewCodeEnhancer`, gut `CodeActionMenuPlugin` to the parts that are genuinely not card chrome |

**Non-goals:** the language *dropdown* stays where it is (it is an authoring
control, not chrome, and it is already a Base UI select that works); the Ln/Col
footer and active-line highlight stay in the editor only; no new highlighting
work — phase 2 of haklex-reprise owns that and nothing here touches it.

## 4. The four things that decide the shape

### 4.1 The snippet already is a header — suppress the card inside one

`CodeSnippetNode` renders a tab strip whose tabs are the child code blocks'
filenames. A card header on each file inside a snippet is a second header
directly under the first, repeating the filename it just showed.

**Rule: a `code` node whose parent is a `code-snippet` renders no card header.**
The tab strip is the header. The card's body treatment (collapse, width) still
applies to the visible file.

This is a rule the *node* enforces, not CSS, because `exportDOM` has to make the
same decision for `/view` and there is no parent selector available at that
point in the export.

### 4.2 `/view` is static HTML, so the card degrades there — deliberately

The reader's page is `$generateHtmlFromNodes` output. A card emitted by
`exportDOM` arrives with no event handlers: **copy and collapse are inert
unless something rehydrates them.**

Three options, and this plan picks the third:

- Keep a slimmed `ViewCodeEnhancer` that only *binds* handlers to a header that
  already exists in the HTML. Cheap, but keeps a second file alive.
- Emit the header only in the editor and keep the enhancer building it for
  `/view`. That is the status quo, i.e. no convergence.
- **Emit the header from `exportDOM`, and bind behaviour with one small
  delegated listener** on the view container — a single `click` handler matching
  `[data-code-action]`, not a per-block enhancer. Copy and collapse work,
  `MutationObserver` goes, tab switches need no re-enhancement because the
  markup is already in the HTML, and the listener is ~30 lines with no
  per-block state.

Print takes the header with it and must render collapsed blocks *expanded* —
a collapsed block in a printed article is a truncated one.

### 4.3 Collapse needs a threshold, an observer, and a home for its state

haklex collapses at 50 vh with overflow detection. Ours must decide three
things they did not have to:

- **Threshold.** 50 vh is a viewport unit and the editor is a pane, not a page —
  in a split workspace 50 vh may be most of the pane. Prefer a line count with a
  px ceiling, computed in an import-free module so it is testable (the
  `dragGeometry.ts`/`imageLayout.ts` rule this repo keeps).
- **Interaction with `__wrap` and `__width`.** Wrapping changes height, so
  overflow must be re-evaluated on wrap toggle and on width change. A
  `ResizeObserver` on the body, not a one-shot measurement.
- **Where collapsed-ness lives.** `ViewCodeEnhancer` keeps it in a class on a
  DOM node, which is right for a reader — it is a *view* preference, not
  content. **It must not become node state**: a collapsed flag in `exportJSON`
  is an author's editing convenience persisted into every reader's copy, and it
  would need a `check:nodes` arm and a migration for a preference. Keep it
  ephemeral, per element.

### 4.4 The language colour map is already outside the theme system

`codeLanguage.ts:27` holds `GLYPH_MAP` — 25-odd `{ text, bg, fg }` literals
(JS yellow-on-black, TS blue, Rust black) applied by setting `--code-glyph-bg` /
`--code-glyph-fg` as inline custom properties from JS.

`npm run check:theme` reads `.css` and `.css.ts`. **It cannot see these**, and
that is by construction, not by oversight.

Mostly this is correct and matches how the repo already treats brand colours
(GoogleIcon, the AI providers) and the colour picker's swatch data: a language's
brand colour does not respond to a colour scheme, and should not. But it is
currently *undeclared*, which is the state DESIGN.md §19 exists to prevent. This
plan should:

- Say so at the map, in the same words the `constant` token group in the `--ed-*`
  contract uses for values that deliberately do not respond to the scheme.
- Check the two that are **not** brand colours: `DEFAULT_GLYPH_BG = "#1d222a"`
  and the black-background entries, against the card's own surface in dark mode.
  A near-black chip on a dark card is the case to look at.

Do **not** move brand colours into `--ed-*` tokens. They are not part of the
palette and giving them a dark twin would mean inventing a "dark mode JavaScript
yellow".

## 5. What gets retired

Success is measured in deletion, and it should be stated up front so a phase
that only adds is visibly incomplete:

- `src/components/views/ViewCodeEnhancer.tsx` — 174 lines, gone, replaced by a
  delegated listener roughly a sixth its size.
- From `CodeActionMenuPlugin.tsx`: the rect measurement, the scroll-container
  portal and its rationale, `HEADER_HEIGHT`/`FOOTER_HEIGHT`, the resize and
  update listeners that exist only to reposition, and the zero-rect guard added
  in haklex-reprise phase 5 for hidden snippet files. What remains is the Ln/Col
  footer and the active-line highlight, which are genuinely not card chrome and
  may keep a much smaller overlay of their own.
- The `theme.css` padding reservation that exists so the floating head and
  footer do not cover code.

**If the net diff is positive, the plan was executed wrong.**

## 6. Gates

Per phase: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:nodes`
(phases 1 and 3 touch `CodeNode`), `npm run check:theme`, `npm run build`.

Specifics worth naming:

- The collapse threshold module gets a spec, because it is the only pure logic
  here and it is where the arithmetic will be wrong.
- A serialization spec asserting **collapsed-ness does not serialize** (§4.3).
- A spec asserting a `code` node inside a `code-snippet` exports **no** card
  header and a standalone one does (§4.1) — through `exportDOM`, not by reading
  the component.
- The existing empty-`style` guard from haklex-reprise phase 2 must stay green;
  the card must not tempt anyone into styling tokens inline.

### 6.1 What no gate can answer

- That the header does not fight the caret at the top of a code block, or the
  first-line gutter alignment.
- Collapse and expand at every width, with `__wrap` on and off.
- The dark-mode question in §4.4.
- Print: header present, collapsed blocks expanded.

## 7. Open questions

1. **Does the card replace the language dropdown's home?** Today the dropdown is
   in the floating head bar. If the head bar becomes the card header, the
   dropdown moves with it — which is fine, but it is a Base UI `Select` inside
   node DOM, and §10.6.3's floating-tree lesson says to check what it is nested
   inside before assuming it behaves.
2. **Should the card be the reader's collapse default?** A long block collapsed
   by default is good for scanning and bad for reading. haklex collapses at
   50 vh unconditionally. Suggest: collapse only above the threshold, expanded
   by default, and never in print.
3. **Does `filename` become author-editable outside a snippet?** Phase 5 gave it
   a UI only in the tab strip. Rendering it (phase 3) does not require editing
   it; adding an edit affordance is a separate, small decision.
