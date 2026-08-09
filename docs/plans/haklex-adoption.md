# Haklex adoption

Status: **phases 0, 1, 2 and part of 5 shipped (8–9 Aug 2026); 3 and 4 not
started.** Written 8 Aug 2026 from a read of `tmp/haklex` at `59850ebd`
(v0.34.0, 5 Aug 2026, MIT). Reviewed the same day: measurements re-verified
against both trees; the Lexical target (0.47 → 0.49), the `@lexical/html`
patch-package obstacle (§3), and the src/-rooted checker globs (§4.3) were
corrected as a result. See §10 for what execution actually found — §10.6 is the
phase 2 log, and it is where the list of things still wanting a human at a
browser lives.

Haklex is an AI-agent-native Lexical ecosystem — 40 packages, ~55k LOC,
published to npm and consumed by three downstreams. This plan takes four things
from it and deliberately leaves the rest. It is written to be executed in a
fresh session; §2 exists so that session does not have to re-derive the
measurements.

## 1. Scope

Four workstreams, in dependency order:

| # | Workstream | Depends on |
| - | ---------- | ---------- |
| 0 | Lexical 0.28 → 0.49 | — |
| 1 | Extract `src/editor` into a workspace package | 0 |
| 2 | Vanilla-extract + Base UI inside that package | 1 |
| 3 | Component upgrades — code block, image, nested doc, code snippet | 2 |
| 4 | Inline agent diff review | 0, 1 |
| 5 | Agent context + codec coverage | — (independent) |

**Non-goals**, decided and not to be revisited without a reason:

- **Not** splitting into many packages. Haklex has 40 because it publishes to
  three separate downstreams. We have one app; every package boundary costs a
  build step and buys nothing.
- **Not** adopting LiteXML in place of `src/lib/content-bridge`. Ours is
  zod-gated, MCP-wired and carries 411 tests. See §6.3 for the one thing their
  format does better, which we take without taking the format.
- **Not** adopting their in-browser agent loop or `sse-claude` / `sse-openai`
  providers. Those put API keys in the reader's browser. We keep `/api/copilot`,
  `/api/mcp`, `tokenRoute` and agent tokens.
- **Not** taking the block drag handle (`rich-plugin-block-handle`, 2131 LOC).
  Explicitly discarded.
- **Not** taking their static/edit node split. `generateServerHtml.ts` already
  gives us a runtime-free read path for `/view`, more cheaply.

## 2. Measurements

Taken 8 Aug 2026. These are the facts the plan rests on; re-check them if the
tree has moved much.

### 2.1 Our editor's coupling is small

`src/editor` is 134 `.ts`/`.tsx` files, 26,806 LOC — ~20k excluding 6,830 lines
of Excalidraw sketch-library JSON under `plugins/ToolbarPlugin/Dialogs/Sketch/libs/`.

It reaches outside itself roughly **60 times**:

```
22  @/theme/icons                   trivial — ICON_SIZE map
 8  @/components/NotesCanvas/*      CanvasNode. the one real tangle
 7  @/types
 4  @/hooks/useMenuState
 4  @/store + @/store/app
 3  @/lib/ai, @/lib/ai/commandTools, @/lib/ai/actionIcons
 2  @/lib/content-bridge            2  @/utils/languageDetection
 2  @/types/notes                   1  @/lib/proposals
 1  @/indexeddb                     1  @/hooks/useOnlineStatus
 …  five more single-use hooks and utils
```

### 2.2 MUI is concentrated in the chrome, not the nodes

MUI appears in **32 of 134 files**, and **23 of those are under
`plugins/ToolbarPlugin/`**:

```
9  plugins/ToolbarPlugin/Tools        3  nodes/AttachmentNode
9  plugins/ToolbarPlugin/Dialogs      2  nodes/ImageNode
3  plugins/ToolbarPlugin/Menus        1  nodes/StickyNode
1  plugins/ToolbarPlugin              1  nodes/CanvasNode
1  plugins/FloatingToolbar
1  plugins/ComponentPickerPlugin
```

Import specifiers: 32 × `@mui/material`, 12 × `@mui/material/styles`,
2 × `@mui/material/utils`.

**The node layer is already 95% MUI-free.** That is what makes phases 1 and 2
tractable, and it is why the chrome is scheduled as its own tranche.

### 2.3 Our block ids are already haklex's block ids

`src/lib/content-bridge/blockId.ts` does:

```ts
export const blockIdState = createState("blockId", { … });
```

— Lexical `NodeState`, serialized under the reserved `$` key. Haklex's
`captureSelection.ts` does `$getState(node, blockIdState)`, and every LiteXML
writer reads `node.$?.blockId`. **Same mechanism, same wire position.**

Consequence: `rich-agent-core`'s `review-engine.ts` (417 LOC) and the
`DiffReviewOverlayPlugin` (460 LOC) operate on `SerializedEditorState` +
block-id-keyed ops — which is exactly what our `applyOps` already produces.
Phase 4 is a UI port, not an addressing change. This is the single biggest
de-risking fact in the plan.

### 2.4 Dark mode rides on `html.dark`, and a checker enforces it

`src/editor/theme.css` has **55 `html.dark` rules**. The class is written by
`InitColorSchemeScript attribute="class"` (`src/app/layout.tsx:78`) and
`colorSchemeSelector: "class"` (`ThemeProvider.tsx:192`).

`scripts/check-theme.mjs` exists *because* the editor once rendered light in
both schemes for two years — dark rules were keyed to a `[theme="dark"]`
attribute nothing set. See DESIGN.md §19 and the header comment in that script.

This is a hard constraint on phase 2, spelled out in §4.2.

### 2.5 Haklex is 21 minors ahead on Lexical

They are on **0.49** — `^0.49.0` on every one of the 55+ `lexical` entries
across their package.json files; re-check their floor when phase 0 actually
starts. We are on **0.28**. They import `@lexical/code-core` and
`@lexical/extension`, neither of which exists in our version. We import
`@lexical/code` (15 sites) and `@lexical/utils` (46 sites).

Nothing from haklex ports without this. It is phase 0 for that reason.

## 3. Phase 0 — Lexical 0.28 → 0.49

**Do this first and alone.** It touches every node class and is the phase most
likely to surface surprises; bundling it with anything else makes the diff
unreviewable.

Known signals, not a complete list — start with a spike, not an upgrade:

- `@lexical/code` appears to have split; haklex imports `$createCodeNode` from
  `@lexical/code-core`. Our `config.tsx` has a delicate `{ replace: CodeNode,
  with: … }` entry whose comment explains why that exact shape is the only one
  giving both `klass` and a replace fn. **Re-verify that comment's claim against
  0.49's registry semantics before touching it.**
- `@lexical/extension` is new and is where haklex gets `HorizontalRuleNode`.
- `patches/@lexical+html+0.28.0.patch` is pinned to the outgoing version —
  patch-package will refuse it the moment `@lexical/html` moves. Re-read what it
  patches and either re-roll it against 0.49 or confirm upstream fixed it and
  retire it. Either way, also delete the stale `@lexical+html+0.21.0.patch`
  sitting next to it, which should have gone with the last upgrade.
- `createState` / `$getState` / `$setState` already exist in 0.28 (we use them),
  so §2.3 survives the upgrade — but confirm the `$` serialization key is
  unchanged, because `blockId.ts`, `check:nodes` and the whole content-bridge
  depend on it.

**Gate:** `npm test` (411 tests, 21 specs) green, `npm run check:nodes` green,
`npx tsc --noEmit` clean, and a manual load of a stored revision containing
every custom node type. `serialization.test.ts` is the spec that catches a class
which stopped delegating to `updateFromJSON`; it found five such classes once
already.

## 4. Phase 1 — extract the editor package

### 4.1 Shape

One workspace package, three entrypoints. Not published to npm.

```
packages/editor/
  src/core/      nodes, plugins, config, commands, theme.css
  src/chrome/    ToolbarPlugin, Dialogs, FloatingToolbar, ComponentPicker
  src/agent/     content-bridge + the phase-4 review layer
```

The app keeps `@/editor` resolving via a tsconfig path so import sites do not
churn in the same commit as the move.

### 4.2 The three things that block a clean cut

**`CanvasNode` → `components/NotesCanvas` (8 imports).** One node reaching into
app components. Invert it: the node takes its canvas surface as a prop/slot —
haklex's `slot.ts` in `rich-ext-nested-doc` is exactly this pattern. If that
proves expensive, the fallback is to leave `CanvasNode` registered by the app
rather than the package. Decide by reading the imports; do not guess.

**`SavePlugin` → `@/store`.** Becomes an `onSave` callback. Partly already true
— `Editor.tsx` takes `onSave`.

**`generateServerHtml.ts` (156 LOC) must keep working.** `/view/[id]` renders
stored HTML produced by a headless Lexical editor over our node registry, on the
server. So the package **must have a node-importable entrypoint that pulls in no
CSS and no React DOM**. This is a real build constraint, and it is also the
reason we do not need haklex's static/edit split.

### 4.3 Gate

Pure code motion — except that three checks are hard-rooted at `src/` and must
be repointed in the same commit, or they go green by checking nothing:

- `scripts/check-theme.mjs` has `PATTERNS = ["src/**/*.css"]`. Once `theme.css`
  moves, it goes blind **in this phase** — §5.2's `.css.ts` blindness is a
  second, separate problem that arrives in phase 2.
- `scripts/check-node-serialization.mjs` has `NODES_DIR = src/editor/nodes`.
- `vitest.config.mts` has `include: ["src/**/__tests__/**/*.test.{ts,tsx}"]` —
  any spec that moves with the package silently drops out of `npm test` while
  the run stays green.

Gate: `npx tsc --noEmit`, `npm run lint`, `npm run check:nodes`,
`npm run check:theme` all green; `npm test` green **at the same test count as
before the move — assert the number (411 at time of writing), not the color**;
and **no visual diff** — if anything moves on screen, phase 1 did too much.

## 5. Phase 2 — vanilla-extract + Base UI in the editor

**Decision (8 Aug 2026, user):** the editor package adopts haklex's styling
stack so their component code ports directly. The app shell stays on MUI +
DESIGN.md.

**The accepted cost, recorded so nobody rediscovers it as a bug:** the app will
run two design systems, with two token sets and two hover scales. DESIGN.md will
no longer describe the editor's interior.

### 5.1 Build wiring

`next.config.ts` explicitly uses webpack (`webpackBuildWorker: true`, a custom
`webpack:` fn, `modularizeImports` for MUI). `@vanilla-extract/next-plugin`
composes with webpack, but it must be layered correctly against the existing
`withBundleAnalyzer(withPWA(nextConfig))` chain. Verify a production
`npm run build` and a `next start`, not just `next dev` — the PWA wrapper is
`disable: !IS_PRODUCTION`, so dev proves nothing about it.

### 5.2 The dark-mode constraint — non-negotiable

Per §2.4: the vanilla-extract theme **must** key its dark contract to
`html.dark`.

- **Not** `prefers-color-scheme` — that reads the OS and ignores our in-app
  toggle, so the editor would disagree with the app the moment a reader
  overrides.
- **Not** a `data-theme` attribute — haklex's `ColorSchemeContext` /
  `portal-theme.tsx` do it their way; ours must be adapted, not copied.

`scripts/check-theme.mjs` (repointed at the package during phase 1, §4.3)
parses only `.css` files and will go **blind** to `.css.ts`. Phase 2 is not
done until it can see them — either teach it the vanilla-extract output or add
a sibling check. Shipping phase 2 with the checker blind reintroduces exactly
the failure it was written for.

### 5.3 Token layer

Port `rich-style-token`'s **4-step interactive fill scale** (`fill` →
`fillQuaternary`: selected/hover · control hover · large-area hover · subtlest)
and its 4-step text scale. This is the thing that makes their components look
like one system, and it is the gap `src/theme/treeRow.ts` closed for tree rows
only. Map to our palette — do **not** import their neutral/blue values.

Skip their three typographic variants (`article`/`note`/`comment`) unless a
product need appears; that is a CJK-publishing feature.

## 6. Phase 3 — component upgrades

In value order. Each is independently shippable once phase 2 lands.

### 6.1 Code block — take Shiki

Ours is prismjs with two hand-imported grammars (`prism-csharp`, `prism-bash`).
Theirs is **Shiki** (VS Code grammars and themes) inside a `CodeBlockCard`:
language icon + color map, filename, copy button, and **collapse-at-50vh with
overflow detection**.

Shiki is worth taking on its own merits regardless of the rest of this plan.
Note our `CodeNode` subclass carries `width`/`wrap` state and the
`config.tsx` replacement entry — preserve both.

### 6.2 Image — the largest single gap

Ours: `ImageNode` 1,341 LOC + a dialog.
Theirs: `rich-renderer-image` 2,381 + `rich-plugin-image-editor` 1,333 = 3,714 —
resize handles, float/align layout with text wrap, alt/caption meta popover,
replace-by-URL with preview, duplicate/download/open.

Their toolbar uses **jotai** atoms for its state. Do not bring jotai into the
app for this; that state is local to one node and should be local state or
context.

### 6.3 Nested doc and code snippet — new nodes

`rich-ext-nested-doc` (974 LOC): a nested composer in a dialog, with a `slot.ts`
host-injection seam that phase 1 §4.2 also wants for `CanvasNode`. Build these
two in the same pass so the seam gets designed once.

`rich-ext-code-snippet` (1,537 LOC): distinct from the code block — a CodeMirror
`CodeEditorModal` for editable snippets.

**Every new node ships a content-bridge codec in the same commit.** See §7.3.

## 7. Phase 4 — inline agent diff review

The one place their AI is decisively better, and per §2.3 it drops onto our
existing addressing.

### 7.1 What it is

`AgentDiffNode` (112 LOC) + `AgentDiffEditNode` (43) +
`DiffReviewOverlayPlugin` (460) + `diff-node-controller` (25) +
`sanitize-operation-node` (33, with a test) + `review-engine` (417).

Proposed ops become decorator nodes **inside the document**, each rendering
original against proposed, with per-hunk accept/reject and an accept-all bar.
`review-engine.ts` computes anchors (`anchorBeforeId` / `anchorAfterId`) so an
insert knows where it lands, and `applyOpsToSnapshot` folds a batch onto a base
snapshot — which is what our `applyOps` already does server-side.

### 7.2 What replaces what

- **Replaces:** `src/components/Diff/index.tsx` (whole-document HTML diff via
  `generateHtml` + `htmr`) as the *agent proposal* review surface. Keep it for
  revision-to-revision comparison, which is a different job.
- **Keeps, unchanged:** proposals as Postgres rows, the `version` compare-and-set,
  stale marking, head-never-moves. Their review state is ephemeral client state;
  ours is not, and ours is the better half.
- This is the deferred phases 6–7 of `docs/plans/agent-gating.md`. Read §3.2 and
  §3.6 of that plan before starting — the silent-clobber trap around
  `baseRevisionId` vs `version` is live here.

### 7.3 Also take (cheap, independent)

- **Selection context.** `captureSelection.ts` (31 LOC) marks selected blocks
  `selected="true"` in the serialization the model sees; for a text range it
  injects the exact text, anchor/focus `blockId`+offset, and the containing
  blocks. Our Copilot sends none of this today.
- **Failure-recovery contract in the prompt.** `document-tool-system-role.md`
  tells the model `block_not_found` → re-search and retry, `block_modified` →
  assume stale and re-locate. Ours errors and stops. Adapt into
  `src/lib/ai/prompts.ts`.
- **`describeCall`.** Each tool renders its own label ("replacing block *intro*")
  instead of the UI guessing from the first arg. Small change to our tool
  definitions in `src/lib/ai/copilotAgentTools.ts` and `src/lib/mcp/server.ts`.
- **The coverage rule.** Their checklist makes an XML reader + writer mandatory
  for every new node. Our codecs cover only *graduated* types; everything else
  degrades to an opaque descriptor, so the agent cannot see parts of documents
  it is asked to edit. Make this a `scripts/check-codecs.mjs` in the shape of
  `check-node-serialization.mjs`, wired the same way. **Cheapest item in this
  plan and the one that fixes a real hole.**

## 8. Verification

No automated check covers API authorization (CLAUDE.md), and phase 4 touches the
proposal path. Exercise the routes against local Postgres by hand — and read the
docker warning in CLAUDE.md before starting anything on `5432`.

Per phase: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:nodes`
(phases 0, 1, 3), `npm run check:theme` (phases 1, 2 — and see §4.3 and §5.2:
each of those phases blinds it in a different way), `npm run build` +
`next start` (phase 2).

## 9. Open questions

Three of the four are now answered; the answers are left in place rather than
deleted, because each records a decision someone will otherwise re-open.

1. ~~**`CanvasNode`** — slot inversion, or leave it app-registered?~~
   **Answered in §10.4: not a real choice.** Its imports do not reach app
   internals, so it stays in the package untouched.
2. ~~**Does phase 2 restyle the chrome, or only the nodes?**~~ **Decided by the
   user before phase 2 began: restyle the chrome too.** That is why phase 2 is
   seven commits (§10.6.1); leaving ToolbarPlugin on MUI would have meant the
   toolbar and the content it edits drawn by two systems.
3. ~~**`ComponentPickerPlugin` (703 LOC) vs their slash menu (588).**~~
   **Decided in `239ce363`: restyle ours, do not port theirs.** Sectioning and
   keyword scoring are a product change, not a styling one — see §10.6.3.
4. Their `messages-engine` (pluggable system/first-user/every-user/last-user
   context providers) is a prompt-assembly framework we may not need. Deferred,
   not rejected.

## 10. Execution log (8 Aug 2026)

### 10.1 What shipped

| Phase | Commit | Note |
| - | ------ | ---- |
| 0 — Lexical 0.28 → 0.49 | `9c5d1b31` | plus `d5fd6577`, which repairs it |
| 1a — checker groundwork | `58ddac8c` | no file moves; every glob probed |
| 1b — the move | `f306652c` | 173 files, all R100 |
| 2 — vanilla-extract + Base UI | `73a1e1c9`…`266e6974` + this one | seven commits; see §10.6 |
| 5A — `check:codecs` | `aa779241` | lands green via a justified allowlist |
| 5C — recovery contract | `077f37fe` | `block_not_found` is now retryable |

Phase 5 deliverables **B** (`captureSelection`) and **D** (`describeCall`) are
planned but not built. Phase 2's §9.2 was decided by the user: **restyle the
chrome too**, not only the nodes.

### 10.2 FIXED — the ``` markdown shortcut (`3760c2a7`)

Typing ``` stopped opening a code block at 0.49; the paragraph kept the literal
backticks and the editor threw `$getTextNodeOffset: invalid offset 3 for size
0`. Only the code block was affected — `#`, `##`, `>`, `*`, `1.` and `---` all
still converted, and the `/code` picker path was healthy throughout.

**The hypothesis recorded here first — a transformer list assembled for 0.28
omitting `MULTILINE_ELEMENT_TRANSFORMERS` — was wrong.** The list is correct and
`CODE` is in it. The culprit was `MarkdownShortcutEnhancementPlugin`, which is
*ours*, not vendored: it fires on the space/enter key **before** the character
is inserted, which is why it coexists with `@lexical/markdown`'s multiline
transformer rather than being replaced by it. It emptied the trigger text node
and then passed the still-stale selection — anchored at offset 3 — to
`$setBlocksType`. 0.49 validates an offset past the end of a node where 0.28
tolerated it, so reading it threw and aborted the update. The `---` branch
survived only because it removes the parent and dispatches a command instead of
reusing the selection.

The logic now lives in `blockShortcuts.ts` and runs against a headless editor.
That move is the actual lesson: it was unreachable inside a `useEffect`, which
is why a broken shortcut shipped green — the same shape of failure as the table
bug in §10.3, and the second one this upgrade produced.

### 10.3 The lesson the table bug taught

`9c5d1b31` introduced `LegacyTableNode`/`LegacyTableCellNode` to keep
pre-rename JSON loading. It broke table insertion **completely**, and the suite
stayed green — the tests called `importJSON` directly and never constructed
through a live editor, so `errorOnTypeKlassMismatch` never ran. Only a browser
found it.

The rule that fell out, worth applying to every future node change: **a node
test that never builds an editor is not testing registration.** The replacement
specs build a headless editor over the real registry and insert through
`$createTableNode()`.

Second lesson, recorded in `legacy-idb-retirement.md` §10.6: those two classes
had **already been deleted** hours earlier on documented evidence that the data
they defended no longer exists. The upgrade reintroduced them unaware. A
migration is only finished when the reason for the workaround is written where
the workaround used to be.

### 10.4 Corrections to this plan's own numbers

- The test baseline was **465/27** when execution began, not the "411 tests, 21
  specs" §3 and CLAUDE.md claim. It is **485/28** at the end of phase 2, and
  CLAUDE.md now says so.
- §2.1's "~60 outward imports" measured **77**.
- §4.3 lists three src/-rooted checkers that go blind. There are **more**:
  `scripts/check-tdz.mjs`, and `next lint`'s default directory list, which
  would have dropped `packages/` from linting entirely.
- §9.1 (CanvasNode) was not a real choice. Its imports do not reach app
  internals — `components/NotesCanvas` is editor-only UI with no non-editor
  consumer and no store access. It stays in the package untouched.
- §4.2's node-importable, no-CSS entrypoint **was not built** and is not needed
  while the package stays TS-source-only compiled by Next. Producing it means
  decoupling eager decorator imports and six node-level CSS imports.
- §7.3's codec gap is **14 types**, not 11.
- `describeCall` cannot be shared with MCP — the SDK carries no label channel,
  so it is a Copilot-UI feature only.

### 10.5 Not verified

`npm run build` was red while `tmp/haklex` is present: `tsconfig.json` includes
`**/*.ts`, so `next build` type-checked the gitignored reference checkout and
died on a missing devDep. Pre-existing, confirmed against `58ddac8c`, and
**fixed** in `95a482d5` — the checkout is excluded now, and every phase 2 commit
built green.

Still wants a human: a stored revision containing every custom node type,
`/view/[id]` server HTML, the Diff view, and paste of `<pre>`/`<code>`/a GitHub
code table (which now routes through `$config()` conversions rather than our
deleted `importDOM` override).

### 10.6 Phase 2 execution log (8–9 Aug 2026)

**Done. `packages/editor` has zero `@mui/*` imports** — the 32 files §2.2
counted are all converted, and the only remaining matches in the package are
four prose comments in the utils that replaced them. §9.2 was decided by the
user before work began (**restyle the chrome too**), which is what made this
seven commits rather than three.

#### 10.6.1 The seven commits

| # | Commit | What it did |
| - | ------ | ----------- |
| 1 | `73a1e1c9` | Build wiring + the `--ed-*` token contract. Zero pixels: the point was to retire the whole toolchain risk — vanilla-extract's webpack plugin under the PWA and bundle-analyzer wrappers, production output, `webpackBuildWorker` — before a component moved. Taught `check:theme` to read `.css.ts`, which §5.2 makes a precondition for the phase. |
| 2 | `0b7caf6d` | `ui/` — the ported haklex primitives kit — and `FloatingToolbar`. First pixels, first Base UI. |
| 3 | `051db1f3` | The node layer: `nodes/` goes 8 MUI files → 0. This is the commit phase 3 structurally needs, since the Shiki code block and the image upgrade land there. |
| 4 | `b4fa76b2` | All ten toolbar dialogs. Added `text-field`, `switch`, `radio-group` to the kit and `Dialogs/parts.tsx` for the header/body/footer arrangement the ten had each rebuilt. |
| 5 | `239ce363` | The menus, the two selects and the slash picker — the tranche the plan called highest-risk for the smallest diff. |
| 6 | `266e6974` | `ToolbarPlugin/index` and the eight `Tools/`. Deleted `toolbar.css`, every rule of which addressed MUI class names. |
| 7 | this one | No pixels. The rot guard, the knip triage, and the stale prose in CLAUDE.md / DESIGN.md / `next.config.ts`. |

The gate held at **485 tests / 28 files, `tsc` 0** at every one of the seven —
which is also the honest reading of it: nothing in the suite touches the chrome,
so a green suite was never evidence about this phase. `check:theme` grew from 22
to 29 `.css.ts` files across the seven, and that checker _is_ evidence, because
it fails on a scheme-invariant color in a `.css.ts`.

#### 10.6.2 The rot guard (commit 7)

`eslint.config.mjs` now bans `@mui/*` under `packages/**` via
`no-restricted-imports`, scoped to `packages/**` rather than to the editor by
name so a second package inherits the rule instead of rediscovering it. Probed
in both directions per the standard phase 1a set: a `@mui/material` barrel
import, an `@mui/material/Box` deep path, a type-only `@mui/material/styles`
import and an `@mui/system` import each fail lint under `packages/editor/src`,
and the same imports under `src/lib` stay green — the app shell keeps MUI, and
`modularizeImports` in `next.config.ts` still earns its keep for the 131 files
there that import from the barrel.

#### 10.6.3 What this plan got wrong

Collected from the seven commit messages, worst first:

- **The kit's `select` and `dropdown-menu` encode "this is a form field", and
  that is wrong for a toolbar control.** `alignItemWithTrigger` overlays the
  popup on its trigger and the `--anchor-width` clamp sizes the popup to the
  trigger — right for a dialog's field, and it would have cut "Numbered List" in
  half against a 60px toolbar trigger. Both are inherited *haklex* choices, not
  Base UI defaults, so porting the kit faithfully imported a decision nobody
  made for this call site.
- **`finalFocus={false}` is load-bearing, and its absence would have been
  green.** MUI restored focus to the trigger synchronously, so the editor's own
  `setTimeout(0) → editor.focus()` always ran last. Base UI returns focus *after
  a 100ms exit animation* — i.e. after our timeout — and would have quietly
  stolen the caret back to the trigger on every font/size change, with `tsc`,
  lint and 485 tests all passing. Turning it off makes the editor's `restoreFocus`
  the only thing deciding where the caret lands.
- **A `.css.ts` may not share its stem with a `.css` in the same directory.**
  TypeScript resolves `./toolbar.css` to the `.ts`; webpack resolves it to the
  literal `.css`. The exported class is `undefined` at runtime with every
  checker green. `check:unused` caught it, not a gate. Six plain stylesheets
  remain in the package, each one paste away from the same thing — commit 6
  retired the trap for `ToolbarPlugin/` by deleting `toolbar.css` outright.
- **A Base UI `Popover` opened from inside a `Menu.Popup` is not in that menu's
  floating tree.** The first click in the popover reads as an outside press and
  closes the menu underneath it. This is *structural*, not cosmetic: it is why
  Table and Note carry their colour triggers in the toolbar row beside the menu
  button instead of as a row inside it (colour is one click away now, not two),
  and why AI's Change Tone and model lists became real submenus.
- **`Menu.Popup` has `finalFocus` but no `initialFocus`.** One capability is
  lost with no replacement: AITools' `onFocusVisible` forwarding is gone, so its
  prompt field is reached by Tab rather than by arrow key.
- **Base UI 1.7 disagrees with what haklex compiles against (`>=1.5.0`) in four
  places**, all found on first compile: `className` is
  `string | ((state) => string)` on every part, and haklex interpolates it into
  a template — which stringifies a *function* into the class attribute (~11 type
  errors; a `mergeClass` helper handles it); tooltip delay lives on `Provider`,
  not `Root`; and `Select.Root` / `Combobox.Root` are generic *functions*, so
  taking `ComponentProps` of them (as haklex does) collapses to
  `<unknown, false>` and silently loses both the value type and the `multiple`
  overload.
- **§5.3's token list was incomplete.** The contract also needs semantic status
  colors (danger/warning/success/info plus soft companions, `accentSoft`,
  `accentContrast`) — `alert`, `badge` and `action-button` cannot be ported
  without them, and haklex ships them as literals. It also gained a `constant`
  group for values that deliberately do *not* respond to the scheme (the colour
  picker's hue track, the alpha checkerboard), so that intent is something
  `assignVars` type-checks rather than a per-line checker exemption.
- **Radio was the wrong target for the image resize handles**, contrary to the
  plan: they render checked unconditionally, are never grouped, and Base UI's
  `Radio` would need a `RadioGroup` and carry radio semantics into something
  that has none. A plain button matches the existing `HTMLButtonElement`
  typing.
- **§9.3 is decided: the slash menu is a restyle, not a port.** haklex's
  sectioned, keyword-scored menu was deliberately not adopted — that is a
  product decision, not a styling one. `ComponentPicker`'s
  `LexicalTypeaheadMenuPlugin` wiring, "/" trigger match, option table, filter
  and `onSelectOption` are all outside the phase 2 diff.
- Two outward imports went that the plan did not count on: `useMenuState` (all
  five menus own their open state now) and `useFixedBodyScroll` (Base UI's
  `Dialog` locks scroll itself). Both stay in `src/hooks` — three app files
  still use `useMenuState`.

#### 10.6.4 What phase 2 deliberately did not do

- **`knip` is not silenced.** 256 of its 532 findings sit under
  `packages/editor/src/ui` — 124 distinct symbols, two thirds of them `XProps`
  aliases. The triage for that directory is *keep, with a reason*, and the
  reason is in the barrel's header comment: it is a ported vendor surface kept
  complete so phase 3 and phase 4 compile against it unmodified. Trimming it to
  what phase 2 happens to call would mean re-deriving the Base UI 1.7
  adaptations above a second time. Three groups are wholly unconsumed today and
  are the clearest case: `combobox`, the low-level `Popover*`/`Tooltip*` parts
  under the convenience wrappers, and `Sheet` / `ScrollArea` / `ActionBar`.
  Outside `ui/` the ordinary rule applies — `utils/useColorScheme.ts`'s
  `readColorScheme` was unexported rather than kept.
- **`Skeleton` and `Collapse` stayed local to `AttachmentNode`** rather than
  entering `ui/`. That directory means "haklex's set"; two components invented
  for one call site each would make it stop meaning that.
- **The §4.2 node-importable, no-CSS entrypoint still does not exist**, and is
  still not needed while the package is TS-source-only compiled by Next.

#### 10.6.5 Still wants a human at a browser

Every item here is a claim no gate in this repo can make. The suite is
`environment: "node"` and does not mount the editor.

1. **The three focus contracts.** That the caret returns to the document after a
   font or size change, after Escape, and after an outside press — the
   `finalFocus={false}` decision above is precisely the kind that passes every
   check and fails on screen. Likewise that `Menu` closes restore focus through
   `onOpenChange` rather than through the three call sites that used to remember
   to.
2. **The colour pickers.** Four call sites were adapted rather than preserved
   (the kit's picker is full HSV + hex + eyedropper and could not keep the old
   `toggle="menuitem"` signature), and two of them moved out of their menus for
   the floating-tree reason in §10.6.3.
3. **Dark mode over the whole restyled surface.** `check:theme` proves no
   *literal* is scheme-invariant; it cannot prove the result is legible. Two
   known live issues sit here: `CanvasComponent`'s tool strip is drawn from two
   token sets, because `AddNoteButton` and `ZoomControls` live in
   `src/components/NotesCanvas` on the app side (declared, not a bug — the
   contract aliases the MUI palette rather than redefining it), and
   `.sticky-tools` inherits `text-primary` inside the light-yellow sticky
   island, so the grip glyph goes near-white in dark. The latter is a §19.3
   island violation, pre-existing (the MUI `IconButton` inherited the same
   value) but now sitting in a file phase 2 touched.
4. **The in-popup size stepper.** It is a header `div`, not a `Select.Item`,
   because Base UI moves focus between registered items and a number input
   inside one is an input you cannot type into. Its wrapper swallows every key
   but Escape and Tab, since typeahead and list navigation are registered on the
   *popup* — a digit would both type and jump the highlight. Worth confirming by
   hand that nothing else was swallowed with them.
5. **The live font preview.** MUI's per-item `onFocusVisible` is what made
   arrow-keying apply fonts as you go. Base UI has no highlight event, so this
   is now `onFocus` plus a `:focus-visible` test — and that guard is
   load-bearing, not decorative: `highlightItemOnHover` defaults true, so
   without it merely sweeping the pointer down the list rewrites the document.
6. **Print.** `FloatingToolbar`'s below-600px hide and print hide were `sx`
   shorthands carrying real behaviour and are now spelled out in CSS.
7. The §10.5 list is unchanged and still open.
