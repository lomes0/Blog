# Tokenizing theme.css

Status: **Phases 1–3 shipped (14 and 28 Aug 2026); phases 4–5 open.** §7 is the
execution log, and eight of this plan's own claims are wrong — read it before §2.
The largest is that §2.1 undercounted the work by a factor of five, because it
counted hex and not `rgb()`.

`packages/editor/src/theme.css` is the last stylesheet in the tree that holds
raw color literals, and it is the one file `pnpm check:theme` cannot see them
in. 1854 lines, **154 hex occurrences (96 distinct)** and **62 `rgb()`/`rgba()`
calls**, with **55 `html.dark` occurrences** maintaining a second palette by
hand.

That headline is misleading on its own, and the whole plan turns on why: three
quarters of the file is already correctly tokenized in a shape this plan should
not touch. The debt is one region — the attachment card, `theme.css:1376–1854`
— which is a hand-paired light/dark palette with no variables at all, plus a
**second syntax-highlighting theme** that duplicates `--tok-*` in different
colors and a different grouping.

So this is two pieces of work that look like one: **teach the checker the rule
that distinguishes the two cases**, and then **fix the one region that fails
it**.

## 1. Non-goals

- **Not** porting haklex's content styling. Their `rich-editor/src/styles/`
  (2142 lines of vanilla-extract across `shared`/`article`/`comment`/`note`/
  `details`/`grid`/`katex`) is the shape this file *could* take. It is not the
  shape it should take next: converting 1854 lines of live CSS to `.css.ts`
  moves every rule at once with no way to diff a subset, and the thing that
  makes their version good — no literals — is achievable here without moving a
  single rule. **Tokenize first. Whether the file then becomes `.css.ts` is a
  separate question this plan does not open.**
- **Not** the three typographic variants (`articleTheme`/`noteTheme`/
  `commentTheme`). Already refused as a CJK-publishing feature —
  `packages/editor/src/ui/index.ts` records it.
- **Not** promoting the scale into the token contract. `styles/scale.ts` states
  why it is a plain module, and the reasoning holds: nothing in it flips with
  the scheme, and `check:theme` exists to guard colors.
- **Not** retiring `--code-*` / `--tok-*` in favour of `--ed-*`. A syntax theme
  is not a content color (DESIGN.md §17.6, and `theme.css:1241` says so). §2.1
  measures those two sets as already compliant.

## 2. Measurements

Taken against `theme.css` at 1854 lines, 14 Aug 2026, after `7ec096a7` (the
code block card).

### 2.1 The literals are four populations, not one

| Population | Light | Dark | Hex | Paired how | Verdict |
| - | - | - | - | - | - |
| Code card + syntax — `--code-*` (18), `--tok-*` (8) | `116–160` | `1319–1345` | 44 | a local two-block contract on `.LexicalTheme__code` | **compliant, leave alone** |
| Document content — `--doc-*` (12) | `1247–1262` | `1265–1277` | 6 | contract + a light island (`html.dark .sticky-note`) and an invariant pair at `1285` | **compliant, leave alone** |
| The attachment card | `1376–1694` | `1696–1840` + print `1841–1854` | ~90 | **rule for rule, by hand, no variables** | **this is the work** |
| Stragglers | `328`, `329`, `716`, `758–782`, `879`, `921` | — | 12 | not paired at all | case by case, §4.2 |

The first two rows are exactly the pattern DESIGN.md §19.3 prescribes and the
third row is its absence. That is the entire finding: **the file does not need a
new architecture, it needs one region brought up to the one it already has.**

### 2.2 The attachment block carries a second syntax theme

`theme.css:1646–1694` (light) and `1794–1840` (dark) style Prism's own
`.token.*` classes under `:is(.attachment-preview, .view-attachment)` with a
GitHub Light / GitHub Dark palette. This is entirely separate from `--tok-*`,
which serves the same seven token groups through `.LexicalTheme__token*`
(`theme.css:753–784`) in different colors.

The two have already drifted in structure, not just value: light keeps
`operator/entity/url` (`1676`) and `atrule/attr-value/keyword` (`1682`) as two
rules with — by coincidence — the same `#d73a49`; dark merges all six selectors
into one (`1821–1827`). Adding a color to one palette does not add it to the
other, and nothing says they are related.

**Two syntax palettes, 24 literals, for one product.**

### 2.3 The attachment block is live, and it is not what you see

DESIGN.md §19.4, and the trap it was written about. An attachment renders
through three surfaces, not two:

| Surface | Markup from | Styled by |
| - | - | - |
| Editing | `decorate()` → React | `nodes/AttachmentNode/styles.css.ts` — 329 lines, **already fully tokenized** |
| Export / print / pre-hydration | `exportDOM` → `index.tsx:100–179` | `theme.css` `.attachment-*` |
| `/view`, hydrated | `ViewAttachment.tsx:145` → React, emits `view-attachment` | `theme.css`, via the `:is(.attachment-preview, .view-attachment)` rules |

`theme.css:1379` hides the static markup inside `.document-container`, so the
`.attachment-container` rules reach only print, export and the pre-hydration
frame. The `:is(…)` preview rules are the exception — they style a **live React
component a reader looks at**.

The consequence for sequencing: touching the container chrome (§4.3) is
near-invisible and safe; touching the preview rules (§4.4) changes what a reader
sees at `/view`. Those are different risk classes and this plan keeps them in
different phases.

### 2.4 `--ed-*` may not be defined where `theme.css` is loaded

Load-bearing, and it must be settled before phase 3 writes a single
`var(--ed-…)`.

`src/app/layout.tsx:8` imports `@/editor/theme.css` **directly**. It does not
import `theme.tsx`, and `theme.tsx:16` is the only thing that pulls
`./styles/tokens.css` into the graph. So the `--ed-*` contract is emitted on a
route only when something on that route imports the editor. `ViewDocument.tsx`
imports `@/editor/nodes/CodeNode/actions` — a plain `.ts` module with no CSS.

Whether `--ed-*` currently resolves on `/view` is therefore a property of
Next's per-route CSS bundling rather than of anything declared, which is not a
thing to build on. **The fix is one line in `layout.tsx`, next to the existing
import, and it is zero pixels today** because nothing in plain CSS reads the
contract yet. That is why it belongs in phase 1 rather than phase 3: it is the
precondition, and shipping it while it is provably inert is the cheap moment.

### 2.5 The checker's existing literal rule is wrong for `.css`

`scripts/check-theme.mjs` already globs `packages/**/*.css` — the four selector
rules (`[theme=]`, `prefers-color-scheme`, `grey-N`, `[data-theme=]`) run
against `theme.css` today and pass. Only `raw-color-in-css-ts` skips it, gated
on `appliesTo: (rel) => rel.endsWith(".css.ts") && rel !== CONTRACT`.

Pointing that rule at `.css` unchanged produces **~216 findings in `theme.css`
alone**, of which the large majority are correct code — every literal in the
`:root` / `html.dark` / `--code-*` / `--doc-*` blocks is a *definition*, which
is the one place a literal belongs.

The rule works in `.css.ts` because of an accident of the format: a
`createGlobalTheme` contract lives in one known file (`CONTRACT`), so every
literal in every *other* `.css.ts` is inside a rule. Plain CSS has no such
split — definitions and rules share a file. **The rule has to be about position,
not file extension.**

Scope beyond `theme.css`, for the same rule: `KanbanComponent.css` (2 `rgba`),
`MathNode/index.css` (1), `src/app/globals.css` (3 hex + 13 `rgba`). The other
four `.css` files are already clean.

### 2.6 Stale prose

- `theme.css:1241–1243` names `--cb-*` and "the toolbar (`--tb-*` in
  toolbar.css)". Both are gone — `plugins/ToolbarPlugin/toolbarLayout.css.ts:12`
  records the `--tb-*` retirement, and `--cb-*` has no remaining definition
  anywhere in the tree. That comment is the file's own description of its scope,
  so it is the first thing a reader of this region trusts.
- `theme.css:1122` explains a `#ccc`/`#444` pair that no longer exists.
- `docs/plans/archive/code-block-card.md`'s own status line still says "Not
  started"; `7ec096a7` shipped it and deleted `ViewCodeEnhancer.tsx`.
  `docs/plans/README.md` already records it as shipped, so the file disagrees
  with its own index. Not this plan's file, but this plan cites it and the next
  reader follows the link.

## 3. The rule the checker actually wants

**`color-literal-outside-scheme-block`**: in a `.css` file, a color literal is
an error unless it sits inside a block that defines custom properties for a
color scheme.

A **scheme-defining block** is one whose selector is `:root`, contains
`html.dark`, or is listed as a light island — and, in the body, the literal is
the value of a `--custom-property` declaration. Both halves are required: a
literal on `color:` inside `html.dark { … }` is still the bug (a paired rule
instead of a paired token), which is exactly what §2.1's third row is made of.

This makes each of §2.1's first two rows pass by construction, without an
allowlist and without naming them:

- `.LexicalTheme__code { --code-bg: #ffffff; … }` — hmm. **This one does not
  pass**, and the exception is real: the code card's light values are declared
  on the component's own selector (`theme.css:116`), not on `:root`, precisely
  so the card carries its palette wherever it is mounted. The rule must also
  accept **a block that declares only custom properties** — no ordinary
  declarations mixed in — as a definition block regardless of selector.
  `theme.css:116` mixes both (`--code-bg` … then `font-family`, `display`,
  `color`), so it needs the palette split into its own rule. That is a
  mechanical two-line change and it is worth doing: it is what makes the rule
  hold without an exemption list.

### 3.1 Three shapes it must not fire on

Each is present today and each would be a false positive that teaches people to
distrust the checker:

1. **`theme.css:879` — `.LexicalTheme__image svg [fill="#ffffff"]`.** An
   attribute *selector* matching markup in a user's pasted SVG. Not a color this
   codebase chooses, and not tokenizable at all. The rule must ignore anything
   inside a selector, i.e. must only read declaration values.
2. **`var(--tok-punctuation, #999)` — `theme.css:753–784`, 7 sites, plus
   `328–329`.** A fallback, not a color choice. §4.2 decides whether these
   survive; until then the rule must not fire on the fallback argument of
   `var()`.
3. **Scheme-invariant alpha washes** — `rgba(255, 212, 0, 0.14)` at `921`,
   `rgba(0, 0, 0, 0.06)` at `137`, box-shadow tints throughout. These composite
   correctly over both canvases and *deliberately* have no dark twin;
   `theme.css:1280` already says so about `--doc-selection-fill`. The rule fires
   on them, and that is correct — the fix is to name them in a definition block
   the way `1285` already does, not to exempt them. Budget for this: ~20 of the
   62 `rgb`/`rgba` calls.

## 4. Phases

Phases 1 and 2 are independent. Phase 4 wants phase 3 done first only because
they touch adjacent lines.

### 4.1 Phase 1 — the rule, with one named exemption (zero pixels)

1. Add `color-literal-outside-scheme-block` to `scripts/check-theme.mjs` per §3,
   including the three non-firing shapes in §3.1.
2. Split `theme.css:116–160` so the `--code-*` / `--tok-*` declarations sit in
   their own `.LexicalTheme__code { … }` rule ahead of the styling one.
3. Fix `KanbanComponent.css` (2), `MathNode/index.css` (1) and `globals.css`
   (3 hex + 13 `rgba`) — small enough to land with the rule rather than after
   it.
4. Exempt `theme.css:1376–1854` **by name, with a pointer at this document**,
   in the shape `check:codecs` already uses for its allowlist. Phase 5 deletes
   the entry; the entry existing is what stops the region regrowing while
   phases 2–4 run.
5. `import "@/editor/styles/tokens.css";` in `src/app/layout.tsx` beside line 8
   (§2.4), with the reason at the import.

Gate: `pnpm check:theme` green, `pnpm exec tsc --noEmit`, `pnpm lint`,
`pnpm build`. **No rendered pixel changes** — verify by diffing nothing but the
`.LexicalTheme__code` cascade, which the split must not alter.

### 4.2 Phase 2 — the stragglers

Six sites, and each is a decision rather than a mechanical swap:

- `716` — `box-shadow: 0 0 0 2px #a6cdfe` on a focused checklist item. A focus
  ring, so `var(--ed-accent-soft)`.
- `921` — `color: #999` on `.sticky-note .nested-placeholder`. Inside a light
  island; it needs the island's own value, not the contract's.
- `758–784`, `328–329` — the nine `var(--x, fallback)` defaults. `--tok-*` and
  `--code-glyph-*` are unconditionally defined by the rules above them, so every
  one of these fallbacks is dead. **Delete them**, which removes nine literals
  and one way for a typo'd variable name to render plausibly instead of
  visibly.
- `879` — leave, and add the one-line comment saying why the checker skips it.

Gate: as phase 1, plus a look at a focused checklist item and a sticky note in
both schemes.

### 4.3 Phase 3 — the attachment card, onto `--ed-*`

`theme.css:1390–1644` (light chrome) and `1698–1792` (its hand-written dark
twin), ~66 literals.

The card is a card: surface, hairline, ink, muted ink, hover. That is
`--ed-bg-secondary`, `--ed-border`, `--ed-text`, `--ed-text-secondary`,
`--ed-fill-*` — the contract `styles/tokens.css.ts` already emits with explicit
greppable names, for exactly this. **No new `--att-*` set.** `--code-*` earns
its own contract because a syntax theme genuinely is its own palette (§1); an
attachment card does not, and inventing a third local contract is how a fourth
one becomes reasonable.

The expected shape of the diff: **the entire `html.dark` block at `1698–1792`
disappears**, because the contract flips underneath. That is the measurable
claim of this phase — ~95 lines deleted, not rewritten.

Two decisions inside it:

- **The six `data-ext` icon gradients** (`1445–1478`, 12 literals). Decorative
  brand-ish fills on a saturated tile, correct in both schemes — DESIGN.md
  §19.3's first shape. They belong in a definition block as constants, the way
  `tokens.css.ts` handles `hueTrack` and `checkerboard`. Declared once, invariant
  by construction, and the checker stops being the only thing that has an
  opinion about them.
- **The print block at `1841–1854`** pins `#f8f9fa`/`#dee2e6`. Print is a real
  light island — keep the literals, move them into a definition block, and keep
  the comment at `1841` that records the selector bug they were written against.

Gate: as above, plus **print preview and `/view` with JS disabled**, in both
schemes. This is the phase where `check:theme` cannot help, because the surface
it changes is the one nobody looks at.

### 4.4 Phase 4 — one syntax theme

Delete `1646–1694` and `1794–1840`. Point
`:is(.attachment-preview, .view-attachment) .token.*` at the existing
`.LexicalTheme__token*` values, i.e. at `--tok-*`.

This is the phase with a real product question in it, so it is last: the
attachment preview's `<pre>` is not the code card's surface. In the editor it is
`styles.css.ts`'s `codePane` on `vars.color.fillTertiary`; the code card is on
`--code-bg`. `--tok-*` is tuned against `--code-bg`. **Contrast has to be
re-measured on the preview's actual surface in both schemes before this lands**,
and if it fails, the answer is to give the preview `--code-bg` — one more step
toward the two surfaces being one thing — rather than to keep a second palette.

Resolves §2.2's structural drift for free: there is one grouping afterwards
because there is one rule set.

### 4.5 Phase 5 — drop the exemption, fix the prose

Delete the phase-1 allowlist entry. Rewrite `theme.css:1241–1243` to name what
exists (`--code-*`, `--tok-*`, `--doc-*`, `--ed-*`) and drop `--cb-*` and
`toolbar.css`. Delete the dangling explanation at `1122`. Fix
`docs/plans/archive/code-block-card.md`'s status line to agree with the index
that already contradicts it, and move this plan's own row to `archive/`.

Gate: `pnpm check:theme` green **with no exemptions naming `theme.css`** — which
is the sentence this whole plan exists to be able to write.

## 5. Decisions this plan makes

Recorded here so a later reader does not have to reconstruct them from the diff.

1. **Tokenize in place; do not convert to `.css.ts`.** §1. The literals are the
   defect; the format is not.
2. **The attachment card joins `--ed-*`; it does not get its own contract.**
   §4.3.
3. **One syntax theme, and it is `--tok-*`.** §4.4. The GitHub pair is the newer
   and the less integrated of the two, and it is the one with no live editor
   surface behind it.
4. **The checker rule is about position, not file extension.** §2.5. This is the
   part that outlives the cleanup: it is what makes the next region impossible
   rather than merely discouraged.
5. **Scheme-invariant values get a definition block, not an exemption.** §3.1.3.
   Following `tokens.css.ts`'s `constant` group, whose whole argument is that a
   checker exemption for a legitimate literal also excuses the next real
   mistake.

## 6. What still wants a human

Collected, because three of the five surfaces this plan touches have no
automated coverage at all and `check:theme` is a lint, not a screenshot:

- Print preview of a document with an attachment, both schemes (§4.3).
- `/view` with JavaScript disabled — the only place the static `exportDOM`
  chrome is visible at all (§4.3).
- The attachment preview's syntax colors on their own surface, both schemes,
  against the 4.5:1 floor (§4.4).
- A focused checklist item and a sticky note (§4.2).

Nothing here is reachable from `vitest`: every current spec is
`environment: "node"`, and the failure mode is a color, not a value.

## 7. Execution log

### 7.1 Phase 1 (14 Aug 2026, `7c73fea9`)

Landed: the `color-literal-outside-token-block` rule and its scanner, the
`.LexicalTheme__code` palette split, **every straggler in `theme.css`**, all of
`globals.css`, `KanbanComponent.css`, and the contract import in `layout.tsx`.
`tsc`, `lint`, `check:theme`, `check:nodes`, `build` and 993 tests green.

`check:theme` now reports `clean … · 108 deferred (attachment-card → …)`.

### 7.2 What this plan got wrong

Worst first.

- **§2.1's straggler row is out by a factor of five, and §4.2 inherited the
  error.** It lists six sites. There are **nineteen** in `theme.css` alone, plus
  fifteen in `globals.css` and one in `KanbanComponent.css`. The cause is
  mechanical and worth naming: §2.1's table was built by grepping **hex**, while
  §2.5 counted `rgb()`/`rgba()` only in aggregate and never attributed them to
  blocks. Every missed site is an `rgba()` — the inline-code border, the
  hashtag pair, the table striping, eight highlight-mark values, the card's own
  drop shadow, and the sticky note's three fixed inks.

  Consequence: **phase 1 could not land green without doing most of phase 2**,
  because a rule that fires on 57 sites is not a rule you can ship. The
  stragglers are done. §4.2 now has only the two decisions left in it — deleting
  the nine `var(--x, fallback)` defaults, and whether `--doc-focus-ring` should
  follow `--ed-accent-soft` instead of keeping the `#a6cdfe` it has always had.
  Both are pixel decisions, which is why phase 1 tokenized them at their current
  values rather than resolving them.

- **§3's "scheme-defining selector" half is unnecessary, and dropping it made
  the rule better.** The plan defines a permitted block as one selectored
  `:root` / `html.dark` / a light island **and** declaring the literal as a
  custom property, then adds an exception for a component's own palette. The
  second condition subsumes the first: a block that declares *only* custom
  properties is a palette wherever it sits, and one that mixes them with
  styling is not, whatever its selector. What shipped is that single condition.
  It costs nothing in coverage and removes the light-island list the plan would
  otherwise have had to maintain — a list whose staleness would have been
  silent.

- **§2.4 was right, and is now measured rather than argued.** Method, since the
  plan only reasoned about it: build, then read `.next/app-build-manifest.json`
  for `/layout`'s CSS chunks and grep them for `--ed-text:`. Without the import
  the contract chunk is **absent** from the root layout and ships only on routes
  that load the editor; with it, present. So a `var(--ed-…)` written into
  `theme.css` today would have resolved on `/edit` and not on `/view`. Phase 3
  can now write them unconditionally.

- **§2.5 says `MathNode/index.css` has one `rgba` to fix. It has none.** That
  literal is inside `html.dark math-field { --contains-highlight-background-color: … }`
  — already a pure token block, and the rule passes it. The same recount applies
  to §4.1's step 3.

- **§4.1 specifies the deferral as a line range and calls a selector match a
  refinement. It is the only workable form.** Phase 1 deleted and added lines
  both above and inside the attachment region on its first commit; a range
  written in the plan would already be wrong. It is matched on the enclosing
  selector, and a **rot guard fails the run** if the entry ever suppresses
  nothing — the plan did not ask for that, and without it the entry outlives its
  work silently, which is the failure every other guard in this checker exists
  to prevent.

### 7.3 A regression caught during execution, not by a gate

Tokenizing `globals.css`'s caret first produced `--editor-caret: auto` in
`:root`, on the reading that light had no rule of its own. It does:
`.editor-input` declares `caret-color: var(--mui-palette-text-primary)` 180
lines above the `html.dark` override, and the new rule sat *below* it at equal
specificity — so light mode would have silently taken `auto`. Nothing in the
gate catches this: `check:theme` is satisfied by a token, `tsc` and `lint` see
no CSS, and the build succeeds.

The general shape, worth carrying into phases 3 and 4: **a value-preserving
token extraction is only value-preserving if you know every rule that already
sets the property.** The dark half is easy to find because it is keyed to
`html.dark`; the light half is the one with no marker on it.

### 7.4 Tokens introduced

All at their existing values — phase 1 changed no rendered color.

| File | Tokens |
| - | - |
| `theme.css` `:root` | `--doc-inline-code-border`, `--doc-hashtag-bg`, `--doc-hashtag-rule`, `--doc-table-stripe-bg`, `--doc-focus-ring`, `--doc-mark-rgb` |
| `theme.css` `.LexicalTheme__code` | `--code-shadow-tint` |
| `theme.css` `.sticky-note` | `--note-fg`, `--note-caret`, `--note-placeholder-fg` |
| `globals.css` `:root` / `html.dark` | `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `--editor-caret`, `--diff-ins-bg`, `--diff-del-bg` |
| `globals.css` `:root` | `--selection-bg`, `--print-bg`, `--print-fg` |
| `KanbanComponent.css` | `--kanban-column-shadow-tint` |

`--doc-mark-rgb` is the one that changes a shape rather than a name: eight
literals across four rules were the same yellow at five alphas, and are now one
channel triple read as `rgb(var(--doc-mark-rgb) / N%)`. Five `html.dark` rules
in `globals.css` were **deleted** rather than rewritten — the scrollbar trio,
and the diff pair — because the token flips underneath them. That is the same
deletion §4.3 predicts at a larger scale for the attachment card's ~95 dark
lines, and it is now demonstrated rather than assumed.

### 7.5 Phase 2 (28 Aug 2026)

Landed: the focus ring on `--ed-accent-soft`, eight of the ten `var(--x,
fallback)` defaults deleted, and the `[fill="#ffffff"]` comment. `check:theme`
unchanged at `clean — 41 style files … · 108 deferred (attachment-card)`;
`tsc`, `lint` and 1136 tests green. **The visual gate §4.2 asks for — a focused
checklist item and a sticky note in both schemes — was not discharged and is
still owed**, and the focus ring is the one place this phase changed a rendered
colour.

Two more of the plan's claims were wrong, both in §4.2's third bullet.

- **It is ten fallbacks, not nine.** The same hex-only grep behind §7.2's
  miscount: §4.2 wrote "`758–784`, `328–329`" and then said "nine", but that is
  eight `--tok-*` plus two `--code-glyph-*`.

- **"`--tok-*` and `--code-glyph-*` are unconditionally defined by the rules
  above them" is true of the first set and false of the second, so only eight
  fallbacks were deletable.** `--tok-*` is declared on `.LexicalTheme__code`
  (light, `theme.css:160`) and `html.dark .LexicalTheme__code` (dark, `1371`),
  and `theme.tsx:21–22` is what makes that unconditional: `codeHighlight`'s
  classes are emitted by `CodeHighlightNode`, which only exists inside a
  `CodeNode`, so a `.LexicalTheme__token*` span cannot render outside that
  ancestor. Those eight fallbacks were genuinely unreachable and are gone.

  `--code-glyph-fg` / `--code-glyph-bg` are declared by **no rule at all** —
  `codeLanguageGlyph()` sets them inline per language from
  `utils/codeLanguage.ts`'s `GLYPH_MAP`, at `nodes/CodeNode/card.ts:203` and
  `plugins/CodePlugin/CodeActionMenuPlugin.tsx:181`. The CSS fallback is
  therefore the real default for a chip built without them, not dead text, and
  deleting it would trade a legible dark chip for transparent-on-inherited ink.
  Kept, with the reason at the declaration, and the `#fff` normalized to
  `#ffffff` so it greps against `DEFAULT_GLYPH_FG`. The plan's stated benefit —
  removing a way for a typo'd variable to render plausibly — is real for the
  eight and inverted for the two.

  The general shape, alongside §7.3's: **a `var()` fallback is only dead if the
  variable is declared in CSS.** One supplied from JavaScript looks identical in
  the stylesheet and has the opposite answer.

`--doc-focus-ring` was **deleted rather than kept as an alias** — §4.2's
decision was the contract, and one indirection to reach it is one more than
zero. `.LexicalTheme__listItem*:focus:before` now reads `var(--ed-accent-soft)`
directly, which is also the shape §4.3 will use at scale. §7.4's table still
lists the token, correctly, as what phase 1 introduced.

§4.2's other two bullets no longer match the tree, both because phase 1 got
there first (§7.2): `716`'s literal had already become `--doc-focus-ring`, and
`921`'s `#999` had already become `--note-placeholder-fg`, declared at
`theme.css:916` in a pure-token block on `.sticky-note` with the note's other
two fixed inks. That is exactly the island value §4.2 asked for, so phase 2
changed nothing there.

### 7.6 Phase 3 (28 Aug 2026)

Landed: the attachment card's chrome on `--ed-*`. **95 of the region's 108
deferred literals are gone** — 80 replaced by contract variables, 15 moved into
two definition blocks — and `check:theme` drops from `108 deferred` to `13`,
which is exactly the two syntax palettes phase 4 owns. The measurable claim
held: **the `html.dark` chrome block was deleted, not rewritten — 98 lines
(41 literals across 17 rules, plus its 9-line comment header) replaced by a
6-line note.** `tsc`, `lint` and 1136 tests green.

The mapping, one row per role, chosen to agree with `nodes/AttachmentNode/
styles.css.ts` — the *live* surface of the same component, already on `vars.*`
— wherever the two disagreed:

| Role | Was (light / dark) | Now |
| - | - | - |
| Card + preview frame + button fill | `#ffffff→#f8f9fa` gradient / `#2d3748→#1a202c` | `--ed-bg-secondary` |
| Hairline | `#e1e4e8` / `#4a5568` | `--ed-border` |
| Hairline on hover | `#c8cdd2` / `#718096` | `--ed-text-tertiary` |
| Ink | `#24292e` / `#e2e8f0` | `--ed-text` |
| Muted ink | `#6a737d` / `#a0aec0` | `--ed-text-secondary` |
| Toggle rest / hover / active | `rgba(0,0,0,.02/.05/.08)` / white at `.03/.07/.1` | `--ed-fill-quaternary` / `-tertiary` / `-secondary` |
| Preview `<pre>`, header, loading | `#f6f8fa` / `#2d3748` | `--ed-fill-tertiary` |
| Download chip | `rgba(102,126,234,.1/.2)` on `#667eea` / a lifted `#9aa5f5` | `color-mix(… var(--ed-accent) 12%/20% …)` on `--ed-accent` |
| Card + preview shadow | four hand-tuned pairs | `--ed-shadow-menu` |
| Preview error band | `#fff3cd`/`#856404`/`#ffc107` | `--ed-warning-soft` / `--ed-warning` |

Two more of the plan's claims were wrong, and one of its instructions could not
be followed as written.

- **§4.3's "~66 literals" is out by half, in the same direction as §7.2's
  miscount and for the same reason.** The region held 95 outside the syntax
  themes: 52 in the light chrome (13 of them the icon gradients), 41 in the dark
  twin, 2 in print. §2.1's table said "~90" for the whole region and was closer
  than the phase that had to do the work.

- **§4.3's "the entire `html.dark` block at `1698–1792` disappears, ~95 lines"
  was right about the shape and short on the count.** It is 98 lines, because
  the block's own comment header — nine lines recording the
  `.attachment-link` → `.attachment-container` selector bug the dark rules were
  written against — goes with it. That history is not about dark mode, so it
  moved to the top of the section rather than being deleted with the rules.

- **§4.3 says to keep the print block's comment, which is not possible
  verbatim: it reads "same misdirected selector as the dark rules above", and
  this phase deletes the rules it points at.** Kept and re-pointed at the note
  that now carries the history. The instruction is right about what must
  survive — the recorded bug — and wrong that keeping the text achieves it.

Three judgement calls, all of which change a rendered pixel and none of which
`check:theme` has an opinion about:

- **The card's two gradients become one flat surface.** `--ed-bg-secondary` is
  the card, and there is no scheme-aware spelling of a sheen from white to
  near-white; the same applies to the preview header's `180deg` pair, which is
  now `--ed-fill-tertiary`.
- **Hover loses its heavier drop shadow.** `--ed-shadow-modal` is a 40px blur
  for something floating over the document, not for a 70px card, so hover is
  the hairline and the 1px lift. Light mode never changed the card's fill on
  hover either — only the dark twin did — so that half is now faithful in both.
- **The `<pre>` moves from a pinned `#f6f8fa`/`#2d3748` to
  `--ed-fill-tertiary`,** which lands within a point or two of both and is what
  the live `codePane` already uses. §4.4's contrast measurement was taken
  against those two hexes and still holds to that tolerance — and is moot if
  phase 4 does what it says and moves the `<pre>` to `--code-bg`.

The two definition blocks are `.attachment-icon`'s seven `--attachment-tile-*`
constants (six file-type gradients and the indigo glow under the default one)
and `@media print`'s two `--attachment-print-*`. Neither is a palette: nothing
reassigns them under `html.dark`, which is the whole statement they exist to
make (§5.5). §5.2 held — no `--att-*` surface, hairline or ink token was
created, and every one of those roles reads `--ed-*` directly.

**The visual gate §4.3 asks for — print preview and `/view` with JavaScript
disabled, both schemes — was not discharged and is still owed**, alongside
§4.2's. One thing for whoever discharges it, found while reading and *not*
introduced here: `globals.css`'s print block sets `color` on `body` only, so a
`.attachment-filename` printed from dark mode has always taken a near-white ink
onto the print card's `#f8f9fa`. The old `html.dark` rule had the identical
bug (`#e2e8f0`), so this phase preserves it exactly rather than fixing it.
