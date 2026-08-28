# The workspace URL: from projection to entry point

**Status: Phase A shipped 28 Aug 2026** (`c63de634`, `2cf113ae`); phases B–D
open. Written 1 Aug 2026, and §8.1 records what had drifted underneath it by the
time Phase A ran — chiefly that §4 undercounts the readers by half. Follows
[workspace-panes.md](./archive/workspace-panes.md), and refines its §0 rather
than reversing it.

---

## 0. The thesis

workspace-panes.md §0 established the right inversion: **workspace state is the
source of truth, and the URL is a projection of it.** That is still correct.
What this plan changes is _which coordinate_ gets projected.

Today the answer is **focus**, and focus is the wrong thing to put in an address
bar:

> The workspace is a 2-pane × N-tab structure with a focus pointer. The URL has
> one slot. Binding that slot to the highest-frequency, lowest-semantic-value
> coordinate in the structure is what forced every mechanism below into
> existence — and it still cannot express what the user is looking at.

The proposal: **the URL becomes an entry point that is consumed once, not a
projection that is maintained forever.** `/edit/<id>` keeps working as a door
in. The steady state is bare `/edit`. Panes, tabs, focus and ratio live in
`ui.workspace`, persisted, which is where they already live and where they are
already more complete than any URL could be.

This is the vscode.dev split — the URL names the container you entered through,
storage owns the layout — and it is what Notion and Linear do with side peeks,
which never touch the URL.

---

## 1. What the projection costs today

All of this exists to keep one id in sync with focus:

| Thing                                                                    | Size / shape                                                          |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `src/lib/workspaceUrl.ts`                                                | 97L, five refusal guards                                              |
| `src/lib/__tests__/workspaceUrl.test.ts`                                 | a whole spec for those guards                                         |
| The `project()` listener in `WorkspacePanes.tsx:250-275`                 | a `store.subscribe` running on **every dispatched action**            |
| `CommandRouter.rewrite` (`commands/types.ts:32-40`)                      | a third navigation primitive, whose only consumer is `pane.close`     |
| `pane.close`'s own rewrite (`commands/pane.ts:112-133`)                  | plus a dynamic import of `layoutSelectors` to read back what to write |
| `pane.split`'s push (`commands/pane.ts:82`)                              | with a 6-line comment on why a resolved id and not `id`               |
| `document.open` dispatching _and_ pushing (`commands/document.ts:53-54`) | order matters                                                         |
| `force-dynamic` + `generateMetadata` on `edit/[[...id]]/page.tsx`        | a DB query per open, for a page that renders `null`                   |

The `rewrite` primitive deserves its own line: it exists **only** because `push`
is a server round trip on a `force-dynamic` route, and that route is
`force-dynamic` **only** because of a `generateMetadata` that produces an OG
card for a private route and a `<title>` the focused `EditorTabPanel` already
sets client-side (`EditorTabPanel.tsx:193`). One unused OG image is holding up a
subsystem that reasons about Next 15's `restoreReducer` internals.

### 1.1 It is also already lying, in two places

**Back does not go back.** The deep-link seam's effect depends on `rootId`
(`WorkspacePanes.tsx:275`). Pressing Back changes the pathname, which changes
`rootId`, which re-fires `openPane({ rootId })` — case (3) in the reducer,
_retarget the focused pane_. It does not restore the previous layout. If you
split or closed a pane since, Back hands you a state that never existed.

**The URL overrides a strictly better source.** The stored record carries
`panes[]`, `focusedPaneId` and `splitRatio` (`workspacePersistence.ts:143-151`).
The URL carries one id. On cold load the restore lands and _then_ the URL
replays over it — the ordering comment at `WorkspacePanes.tsx:238-244` says so
outright ("a stored layout can name a different focused pane than the URL does,
and the URL wins"). A stale bookmark can retarget a correctly restored pane.

`pane.split`'s push is the clearest symptom. Its comment explains that without
the push, "a reload would restore both panes correctly and then focus the wrong
one." But `focusedPaneId` **is** in the stored record. The push exists to repair
damage the URL replay itself causes.

---

## 2. What the URL actually buys, audited

Four claims are usually made for a document id in the workspace URL. Only one
survives.

| Claim                                      | Verdict                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Sharing**                                | Does not apply. Sharing is `/view/[id]`, the public page. An `/edit` link is only useful to its author.            |
| **Browser Back**                           | Already broken — see §1.1. Removing it makes Back honest (it leaves the workspace) rather than removing a feature. |
| **Reload restores what I had**             | IndexedDB already does this, more completely. The URL degrades it.                                                 |
| **Deep links / bookmarks / inbound links** | **Real, and the only one.** 14 href sites point at `/edit/<id>`, plus external bookmarks and MCP.                  |

The target model keeps the surviving one and drops the other three.

---

## 3. The target model

Three rules.

1. **`/edit/<id>` is accepted and consumed.** On arrival the seam resolves the
   ref, dispatches `openPane({ rootId })`, then `history.replaceState`s to
   `/edit`. The URL has done its job.
2. **`/edit` is the steady state.** Focus changes, tab switches, splits, closes
   and mode flips touch nothing but the store. No projection, no listener, no
   `rewrite`.
3. **Leaving `/edit` still unmounts and still calls `closeAllPanes`.** That is
   unchanged, and the persistence middleware's refusal to write an empty
   workspace (`workspacePersistence.ts:202-208`) is what keeps it safe. The
   comment there stays accurate.

### 3.1 Why "consume", not "remove"

Removing `[[...id]]` outright would break every inbound link, which is the one
thing the URL is genuinely good for. Consuming it keeps all 14 internal href
sites, `ViewDocument`'s "Open in workspace" button, external bookmarks and the
MCP server working **unchanged** — they are entries, and entries still work.
What changes is only that you do not _remain_ at that address.

### 3.2 What `document.open` becomes

```
run: dispatch openPane if the ref resolves
     ├─ resolved + already on /edit  → nothing else
     ├─ resolved + elsewhere         → router.push("/edit")
     └─ unresolved (cold handle)     → router.push(`/edit/${id}`), seam fetches
```

The third branch is why the route keeps its optional catch-all: a handle for a
post not yet in the store still needs the id to travel through the URL to reach
the seam's fetch. That is the entry path doing exactly what §3.1 describes.

---

## 4. What breaks — the complete list

Grepped, not guessed. Three real items; everything else is a link that keeps
working.

### 4.1 `AttachmentDialog` parses the pathname for a uuid — **must fix**

`src/editor/plugins/ToolbarPlugin/Dialogs/AttachmentDialog.tsx:32-57` walks
`window.location.pathname`, looks for a segment after `edit`/`new`/`view`/
`documents`, and sniffs for "36 chars with a dash". It then falls back to "is
the last segment 36 chars".

This breaks on bare `/edit`. It is also the last surviving instance of the
data-flow the parent plan set out to kill (§0: "that code exists _only_ because
workspace state is not represented anywhere"), and it was missed because it
lives under `src/editor` rather than `src/components`.

**It is already broken today, on a handle URL.** The parser only accepts a
36-char segment containing a dash, so `/edit/my-post` matches neither the
`routeWithId` loop nor the last-segment fallback, and it returns `null` — which
`handleSubmit` turns into a thrown `"Document ID not found"` and an "Upload
Failed" toast. That path is reachable from the app's own links:
`ViewDocument.tsx:176` ("Open in workspace") uses `handle || id`, and
`BacklinksSection.tsx:75` uses `handle ?? id`. Per the parent plan a handle URL
survives "until focus actually moves" — so an author following their own
published post into the workspace cannot attach a file until they click into
another pane.

More generally it is correct only _because_ the projection keeps the URL on the
focused pane's active tab, and only once that projection has landed. It is
reading a derived, eventually-consistent copy of a value the store holds
directly.

**Fix:** the dialog is inside a `ConnectedEditor`, which belongs to a pane.
Thread the pane's `docId` down, or read `selectFocusedDocId`. Delete the parser.
This is worth doing **whether or not the rest of this plan lands.**

### 4.2 Two `pathname === "/edit/<id>"` active checks — **must fix**

- `SideBar/PostItem.tsx:130` — already has the store answer (`isOpenRoot` via
  `selectPaneRootedAt`); the pathname check is documented as a fallback "for the
  beat between a navigation landing and the deep-link seam dispatching
  `openPane`". Under the new model there is no such beat on an in-app open — the
  dispatch happens first and the URL never names the document. **Delete the
  fallback.**
- `SideBar/SidebarSearchView.tsx:115` — has **no** store fallback; it is
  pathname-only. **Give it `selectPaneShowingDoc`.** It is arguably wrong today
  too: with two panes it can only highlight one of them.

### 4.3 Bare `/edit` is currently a dead end — **must build**

`EditDocumentContent.tsx:62-64` returns
`<SplashScreen title="Document Not
Found" />` when there is no segment. Under
the new model bare `/edit` is the _normal_ address, so it needs a real answer:

- Stored layout present → restore it and render. (Already the code path; it just
  is not reachable without a segment today.)
- No stored layout → the empty-workspace state. This is a **product decision**,
  see §6.

### 4.4 Everything else is a link, and links keep working

`PostsView.tsx:382`, `DocumentBrowser/index.tsx:49`, `DocItem.tsx:30`,
`BacklinksSection.tsx:75`, `CollapsedRail.tsx:134`, `SubTabList.tsx:166`,
`EditorTopBar.tsx:288`, `ViewDocument.tsx:176`, `PostItem.tsx:265`,
`SidebarSearchView.tsx:120`, `DocumentURLContext`'s two providers. None of these
read the URL; they write one, as an entry. **No change.**

---

## 5. What deletes

- `src/lib/workspaceUrl.ts` (97L) and its spec.
- The `project()` closure and `store.subscribe` in `WorkspacePanes.tsx:254-274`.
  The effect keeps only `dispatch(openPane({ rootId }))` plus the one-shot
  consume.
- `CommandRouter.rewrite` (`commands/types.ts:32-40`) and its implementation
  (`CommandProvider.tsx:73-78`). Its only caller goes with it.
- `pane.close`'s URL repair (`commands/pane.ts:112-132`), including the dynamic
  `layoutSelectors` import. Closing a pane stops being a URL event.
- `pane.split`'s push (`commands/pane.ts:74-82`) — `focusedPaneId` is persisted,
  which is what that push was compensating for.
- Probably `generateMetadata` + `force-dynamic` on `edit/[[...id]]/page.tsx`
  (§6, needs a call). If they go, the page file goes entirely and
  `edit/
  layout.tsx` can hold a plain `page.tsx` returning `null` — or the
  catch-all collapses to a `/edit/[[...id]]` that is purely an entry.

Net: roughly −250L of mechanism, −1 navigation primitive, −1 per-action store
subscription.

---

## 6. Open questions — need a human

### 6.1 Does `/edit`'s `generateMetadata` earn its cost?

It runs a `findDocument` on every open to build an `/api/og` card for a route
only the author can use, and a `<title>` the client overwrites. Keeping it means
keeping `force-dynamic`, which means `push` stays expensive — though after this
plan far fewer pushes happen, so the pressure is lower either way.

**Recommendation: delete both.** If an `/edit` link is ever unfurled in Slack,
the useful preview is the _public_ one, and `/view/[id]` already has it.

### 6.2 What does an empty workspace show?

Bare `/edit` with no stored layout. Options: the AI home pane (memory records
that a composer-only home pane was built and then deliberately pared back), a
recent-documents list, or a redirect to `/posts`.

**Recommendation: redirect to `/posts`.** It is the existing "what do I have"
surface, it needs no new UI, and it means this plan ships without a product
argument attached. The home pane can replace it later without changing anything
here.

### 6.3 Multi-browser-tab is made slightly worse — accept?

Two browser tabs in the same workspace already clobber each other: both write
the same user-keyed record and last-writer-wins
(`workspacePersistence.ts:168-208`). This plan does not change that.

It does change recovery. **Today** each tab's URL still names its own document,
so a reload in tab A recovers what tab A was on. **After**, both reload into the
shared record.

**Recommendation: accept and record it.** A real fix is per-browser-tab layout
keying (`sessionStorage` scope id), which is a larger change that should be
argued on its own merits, not smuggled in here.

---

## 7. Phases

Deliberately ordered so that §7.1 is worth doing even if the rest is abandoned.

### Phase A — Sever the two remaining URL readers

**DONE 28 Aug 2026** — `c63de634` and `2cf113ae`. It was six readers, not
three; see §8.1.

`AttachmentDialog` (§4.1), `PostItem` and `SidebarSearchView` (§4.2). All three
move to `ui.workspace` selectors.

_Acceptance:_
`grep -rn "location.pathname\|pathname ===" src/components src/editor` returns
nothing that is deciding which document is open. Attaching a file works in both
panes of a split, and attaches to the right one. `npx tsc --noEmit`,
`npm run lint`, `npm test` clean.

**This phase stands alone.** It fixes a live two-pane bug and removes the last
of §0's inverted data flow.

### Phase B — Empty-workspace answer

Whatever §6.2 decides, behind the `!segment` branch at
`EditDocumentContent.tsx:62`. Nothing else changes yet; bare `/edit` is not
reachable in normal use until Phase C.

### Phase C — Consume the URL

The one-shot: after `openPane` lands, `history.replaceState` to `/edit`. Then
delete §5's list. `document.open` takes the three-branch shape of §3.2.

_Acceptance:_ opening from the sidebar, `/posts`, the palette, the Copilot and a
cold deep link all land on `/edit` with the right document focused. Splitting
and clicking between panes produce **zero** history entries and zero URL
changes. Reload restores the two-pane layout with the correct pane focused. Back
from `/edit` leaves the workspace.

### Phase D — Drop `force-dynamic` (if §6.1 says so)

Separate commit, because it is the one with a measurable perf claim and should
be reverted independently if the OG card turns out to matter.

---

## 8. What this does _not_ change

- **The AI surface.** Nothing in `src/commands` changes shape except deleting
  `rewrite` from `CommandRouter`. `workspace.describe` is still the addressing
  mechanism, there is still no `navigate(url)` tool (parent plan §3.2), and
  `CommandContext.focusedDocumentId` still comes from `selectFocusedDocId`. The
  AI cannot tell this happened — which is the parent plan's decoupling working,
  and also why this refactor is cheap.
- **`/view/[id]`.** Untouched. Public, store-free, shareable, and still the
  thing you send someone.
- **`/new`, `/posts`, `/series`.** Untouched.
- **The `edit/layout.tsx` hoist.** Still required and still load-bearing: even
  with a consumed URL, `/edit/<id>` → `/edit` is a segment change, and the
  layout is what keeps the pane tree mounted across it.
- **`closeAllPanes` on unmount**, and the never-write-empty guard that makes it
  safe.

---

### 8.1 What had drifted by the time Phase A ran (28 Aug 2026)

Three corrections, written after building rather than as part of the design.
Read them before acting on §4 or attempting Phase B.

1. **§4 undercounts the readers by half.** It names three and calls itself
   "grepped, not guessed"; there were six. The three it missed:
   `packages/editor/src/utils/documentContext.ts` (a second parser),
   `uploadBlob.ts`'s use of it on the blob-upload path, and
   `CollapsedRail.tsx`'s standalone-post branch — the last being the same
   pathname-only defect as `SidebarSearchView`, wrong in a split for the same
   reason.

2. **The handle bug in §4.1 was already half fixed, on the wrong copy.**
   §4.1 presents the 36-char UUID parser as live. In fact `documentContext.ts`
   had been *extracted from* `AttachmentDialog` precisely to fix it, and its
   docblock argues the id-or-handle case correctly — but the dialog was never
   migrated onto it and kept its broken private copy. So the repo held two
   parsers and the surface users actually hit ran the bad one. A plan cannot
   see this kind of drift; only a grep can.

3. **§4's paths are pre-extraction.** They say `src/editor`, which has been
   `packages/editor/src` since the haklex extraction
   (`archive/haklex-adoption.md` §4). Line numbers have moved too.

One design note, since §4.1 offers a choice that does not survive contact:
**"or read `selectFocusedDocId`" is wrong.** That selector is *global* focus, so
an editor in the unfocused pane would resolve to the focused pane's document —
an attachment added on the left would land on the right. That fails this phase's
own acceptance test. The fix is per-editor context
(`packages/editor/src/context/DocumentContext.tsx`), provided by
`ConnectedEditor`, which already receives the `Post` and is mounted once per
open document.

---

## 9. Risk

The one that matters: **the consume step and the restore must not race.** The
`replaceState` fires after `openPane`, and `openPane` is already gated on
`workspaceHydrated` — so the ordering is the same one the current code
establishes at `WorkspacePanes.tsx:250-252`, minus the projection half. But this
is exactly where the 1 Aug data-loss bug lived (a stale `hydrated` flag on
remount letting the seam mint a pane over a stored layout), so it wants the same
CDP verification: stored two-pane record, cold load a deep link naming one of
them, confirm the record is unchanged afterward.
