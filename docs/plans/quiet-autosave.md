# Quiet autosave: silent success, loud failure

**Status:** proposed, 2 Aug 2026.

---

## 0. The thesis

Autosave already works. The UI does not trust it.

Today one keystroke pause repaints **eight** surfaces amber, then clears them
~1.7s later when the save lands. The user is being asked, several times a
minute, to attend to a process that has never needed their attention — and is
told nothing at all in the one case that does need it.

The proposal is not to delete the feedback. It is to **invert its default**:

> Say nothing while saving works. Speak only when the user's mental model would
> otherwise be wrong — a save that is retrying, failed, or was restored from a
> previous session.

The state machine does not change. Only which branch of it gets painted.

---

## 1. What the app does today

`useDirtyTracking` (300ms trailing debounce) maintains `ui.dirtyDocIds`. That
one array drives every surface below:

| Surface                                                 | Where                             |
| ------------------------------------------------------- | --------------------------------- |
| Toolbar **Save** — `disabled` + `CircularProgress` swap | `ToolbarPlugin/index.tsx:356-359` |
| Toolbar **Reset** — `disabled`                          | `ToolbarPlugin/index.tsx:377`     |
| Tab dirty dot (5px, `warning.main`)                     | `DocumentTabs.tsx:318`            |
| Tab overflow-menu dot                                   | `DocumentTabs.tsx:679`            |
| Sidebar sub-tab dots                                    | `SubTabList.tsx:213`              |
| Sidebar post name → `warning.main`                      | `PostItem.tsx:174`                |
| Sidebar dirty dot                                       | `PostItem.tsx:427`                |
| Sidebar **"Save now"** button appears                   | `PostItem.tsx:441-471`            |
| Rail `Save: Unsaved / Saved` + status dot               | `PropertiesSection.tsx:250-266`   |

### 1.1 The timing is the whole complaint

Both `useDirtyTracking` (300ms) and `useSave`'s `scheduleSave` (2000ms,
`useSave.ts:19`) are **trailing** debounces. Neither fires while keys are
actually going down. So the flicker does not happen while typing — it happens
**when the user pauses**:

```
t=0      last keystroke
t=300ms  dirty paints  → 8 surfaces go amber
t=2.0s   autosave fires
t=2.2s   ack → dirty clears → 8 surfaces go back
```

The indicator is at its loudest at the exact moment the user has stopped to
think. That is not a tuning problem; it is the design pointing the wrong way.

`PostItem.tsx:441-471` is the worst offender: the "Save now" button _appears_,
and the sibling Edit button's margin flips between `0.5` and `auto` (`:449`,
`:469`), so the sidebar row **shifts** on every pause.

### 1.2 `ui.saveStatus` is written six times and read zero times

```
setSaveStatus dispatched:  useSave.ts:100,125,149,159,162 · usePostLoader.ts:105
setSaveStatus read:        (nothing)
```

`"saving"`, `"retrying"` and `"error"` are dead state. The reducer
(`app.ts:271-278`) is correct and complete; nothing renders it.

The consequence is the inverse of the intent: a cloud save stuck in exponential
backoff — up to **30s** per attempt (`MAX_BACKOFF_MS`, `useSave.ts:20`) — is
**completely invisible**, while a save that succeeded in 200ms gets eight
indicators. The app is noisy about the case that always works and silent about
the case that does not.

### 1.3 `selectIsDirty` is global

```ts
// store/index.ts:109
export const selectIsDirty = (state: RootState) =>
  state.ui.dirtyDocIds.length > 0;
```

Not scoped to a document or a pane. The Save button in _this_ editor enables
because _some other_ open tab is dirty — and `triggerSave` then saves every open
tab (`saveRegistry.ts`). The button in a pane does not mean what its position
claims.

---

## 2. Why the dots are safe to delete

The dirty indicator looks like a safety mechanism. It is not one — **nothing in
the persistence path depends on the user reacting to it.**

- There is no `beforeunload` guard anywhere in `src/`. Closing a tab with
  unsaved content has never been blocked.
- `pendingSaves` writes the content to IndexedDB **before** every attempt and
  clears it only on acknowledgement (`useSave.ts:124,146`). An edit is never
  held only in component memory.
- Unmount (`useSave.ts:222-227`) and `visibilitychange` (`:209-219`) both flush.
- `usePostLoader.ts:99-106` restores unconfirmed content on the next load.

Durability is structural. The amber dots ask the user to worry about something
the system already guarantees — so removing them removes no safety net, only the
anxiety.

`dirtyDocIds` itself **stays**. It is read by `Reset`, and by the pane/tab
bookkeeping in `app.ts:540,557-562`. This plan changes what is _painted_, not
what is _tracked_.

---

## 3. The change

### 3.1 Stop painting the happy path

Delete the nine renderings in §1's table. Specifically:

- `DocumentTabs.tsx:318`, `:679` — remove both dot blocks and the now-unused
  `isDirty` prop / `dirtyTabIds` plumbing (`:101`, `:116`, `:168`, `:400`,
  `:586`, `:602`) and its source at `TabbedDocumentEditor.tsx:57,353`.
- `PostItem.tsx` — `nameColor` collapses to `text.secondary` (`:174`); delete
  the dot (`:427`) and the "Save now" button (`:441-471`); the Edit button's
  margin becomes an unconditional `auto`, which also removes the layout shift.
  `isDirty` / `anyTabDirty` / `openDirtyIds` and the `selectPaneRootedAt`
  selector at `:115` all become dead and go with them.
- `SubTabList.tsx:213` — remove the dot; `SubTabEntry.dirty` (`:22`) drops out
  of the type, and with it the `tabEntries` dirty computation in `PostItem.tsx`.
- `ToolbarPlugin/index.tsx:377` — `Reset` loses `disabled`. Resetting to an
  identical baseline is a no-op, so gating it buys nothing and costs a flicker.

### 3.2 The rail row becomes exception-only

`PropertiesSection.tsx:250-266` currently renders a permanent
`Save:
Unsaved/Saved` KV row. Replace `isTabDirty` with a read of
`ui.saveStatus` for the active doc, and render **nothing** on the happy path:

| `saveStatus`  | Rail row                        |
| ------------- | ------------------------------- |
| absent (idle) | _row not rendered_              |
| `saving`      | _row not rendered_ — see below  |
| `retrying`    | `⟳ Reconnecting… saved locally` |
| `error`       | `⚠ Couldn't save` + Retry       |

`"saving"` is deliberately not painted. It is a ~200ms round trip on the happy
path; painting it recreates the exact flicker this plan removes, just with a
different glyph. The status only becomes visible once a save has _failed_ to
land — which is the first moment the user's assumption ("it saved") is wrong.

This needs a new selector; add it next to `selectIsDirty`:

```ts
// store/index.ts
export const selectSaveStatus = (id: string | null) => (state: RootState) =>
  id ? state.ui.saveStatus[id] : undefined;
```

The `error` branch needs a retry entry point. `useSave`'s `save` is not exported
past the hook, but `saveRegistry`'s `triggerSave` already reaches every open tab
— reuse it rather than threading a second path.

### 3.3 Cover the collapsed rail

The chosen home has one real gap: with the rail collapsed, a stuck save is
invisible — which is precisely when it would go unnoticed for longest.

The rail's **54px icon strip is always mounted**, at both rail modes
(`RightRail/index.tsx:145-152`; the `railMode === "full"` test only gates the
panel beside it). So: when `saveStatus` is `retrying` or `error` for any open
doc, badge the rail toggle button in that strip (`index.tsx:155-170`) — a small
`warning.main` / `error.main` dot, with the reason in its existing `Tooltip`.

Zero new chrome, always on screen, and silent on the happy path like everything
else here.

### 3.4 `Save` → `Checkpoint` — _superseded, see 3.4a_

The button has a second, real job that survives this plan: `closeRevision()`
(`useSave.ts:78`, wired at `:201`) seals the revision autosaves are folding
into, so the user can mark a version worth keeping in history. Autosaves
otherwise fold into one row until the 10-minute ceiling (`REVISION_SESSION_MS`),
a tab hide, or unmount.

So the button stays — but stops claiming to be responsible for persistence:

- Label `Checkpoint`, tooltip _"Mark this version in history (⌘S)"_.
- **Always enabled.** Remove `disabled={isSaving || !isDirty}`
  (`ToolbarPlugin/index.tsx:356`).
- **No spinner.** Remove the `isSaving` state (`:111`), the `handleSave`
  wrapper's `setIsSaving` (`:123-131`) and the `CircularProgress` swap
  (`:357-359`); the icon becomes a static `Save` glyph.

The same `triggerSave()` → `closeRevision()` path runs underneath, unchanged.

### 3.4a The button went away entirely (`6b7252f3`, 3 Aug 2026)

§3.4 shipped and was then reversed: the renamed button was dropped from the
toolbar altogether, taking `ToolbarPlugin`'s `onSave` prop with it.

The reasoning is a step past this plan's, and better. §3.4 kept the button
because checkpointing is a real capability that would otherwise be lost — but
that was never true: **⌘S already seals a revision through `SavePlugin`**, which
`Editor` still wires by passing `onSave` to `EditorPlugins`. So the button was a
third way to ask for something the keystroke and the autosave loop both already
covered, and the honest version of "silent success" has no resting chrome for it
at all.

That also answers §6's open question in the other direction from what it
assumed: ⌘S stays bound _and_ stays a checkpoint, and nothing in the toolbar has
to explain itself.

### 3.5 Delete `selectIsDirty`

_Revised during implementation._ The plan was to add a scoped `selectIsDocDirty`
sibling and keep the global form for callers that genuinely mean "anything,
anywhere". Once §3.1 landed there were **no such callers** — the toolbar was the
only consumer, and both `Save` and `Reset` are now ungated. Adding a second
selector nothing calls would have been new dead code in a repo that runs `knip`
to prevent exactly that.

So both go, and `store/index.ts` keeps a comment recording the trap and the
one-line scoped form to write if a close guard ever needs it.

---

## 4. What this does not change

- `useSave`'s retry/backoff machinery, `pendingSaves`, the revision-folding
  scheme, and every flush point. Untouched.
- `ui.dirtyDocIds` and its reducers. Still tracked, just not painted.
  `store/__tests__/workspace.test.ts:432-485` keeps passing unmodified.
- Guest (IndexedDB) behaviour. Local saves never fail on network, so
  `saveStatus` never leaves `idle` and the rail row is permanently absent —
  correct, and free.

---

## 4a. Fixed during implementation: the row was in the wrong section

The first cut put the save row where the old `Save: Unsaved/Saved` row lived —
inside `PropertiesSection`'s **"This tab"** block, which is gated on
`isEditMode && hasMultipleTabs`. A single-tab document is the ordinary case, and
there the row could never render: the collapsed-rail badge would light up with
nothing anywhere to explain it.

Caught by the browser check below, not by `tsc` — the condition was upstream of
anything a type could see. The row now lives in the always-rendered post-level
grid, and reads `selectSaveTrouble(activeDocId ?? rootId)` so it still answers
during the beat before `setPaneTabs` lands.

---

## 5. Verification

No automated test covers any of this; it is all rendering. Per CLAUDE.md:

- `npx tsc --noEmit`, `npm run lint`, `npm run check:theme`, `npm test`. The
  deletions should surface unused-symbol errors in exactly the files listed in
  §3.1 — that list is the checklist.
- `npm run check:unused` (knip) after the deletions, to catch the cascade
  (`SubTabEntry.dirty`, `selectPaneRootedAt` if it loses its last caller).
- **In a real browser** (`verify-ui-in-browser`), the acceptance test is
  behavioural, not visual: type into a document, stop, and watch for ~5s.
  Nothing anywhere may change appearance.

### 5.1 What was actually run (3 Aug 2026)

`tsc --noEmit`, `npm run lint`, `npm test`, `check:theme`, `check:unused` — all
clean. Then a headless Chrome pass against `next dev` on `:3100`, driving a
guest document seeded straight into IndexedDB (`New post` is a no-op without a
session, so there is no UI path to a document as a guest).

**Happy path** — a `MutationObserver` over the sidebar, tab strip, toolbar and
rail, armed after load, cleared at the last keystroke, read 6s later:

| Region    | Mutations after the last keystroke |
| --------- | ---------------------------------- |
| sidebar   | **0**                              |
| tab strip | **0**                              |
| toolbar   | **0**                              |
| rail      | 4, all identified — see below      |

The rail's four are not save chrome: the **Revisions** section gaining its row
(`+4768ms`) and the **Outline** section gaining `0% read · ~1 min left`
(`+5263ms`) once the document had words. Both are content, and the revision row
appears once per writing session rather than per pause, because autosaves fold
into one revision until `REVISION_SESSION_MS`. Also asserted directly: zero
elements with a `warning.main` fill, and the strings "Saved"/"Unsaved" absent
from the page.

**Failure path** — driven through `setSaveStatus` with a temporary
`window.__store` handle (removed afterwards; guest saves go to IndexedDB and
never fail, so the real path cannot be provoked in a signed-out session):

| status                     | rail row                      | rail-toggle badge           |
| -------------------------- | ----------------------------- | --------------------------- |
| idle                       | absent                        | none                        |
| `saving`                   | **absent**                    | **none**                    |
| `retrying`                 | "Reconnecting… saved locally" | `rgb(249,115,22)`           |
| `retrying`, rail collapsed | (rail gone)                   | **still `rgb(249,115,22)`** |
| `error`                    | "Couldn't save" + Retry       | `rgb(211,47,47)`            |
| back to idle               | absent                        | none                        |

**Not covered:** a real cloud save failing. That needs a signed-in session
against Postgres, and `retrying` for a _guest_ is cleared within a frame because
the restored save re-lands on IndexedDB immediately.

---

## 6. Open questions

**~~`ui.dirtyDocIds` is now written but never read.~~ Resolved — deleted in
`96b02804`.** §2 asserted that `Reset` reads it; that was wrong — `Reset` read
`selectIsDirty`, which §3.1 ungated and §3.5 deleted. So the slice was left in
exactly the shape that made `ui.saveStatus` a bug in §1.2: six dispatch sites,
zero readers, and a full `JSON.stringify` of the document every 300ms on the
typing path to maintain it.

Option 2 of the three listed here was taken: the slice, its two reducers, the
`removeTab` cleanup, the `UIState` field and the six reducer tests are all gone,
along with `useDirtyTracking` itself. The equality it computed still happens
where it has a consequence — `useSave` compares `savedBaseline` before deciding
a save is a no-op — and a future close guard should ask `pendingSaves`, which is
the durable record rather than a Redux mirror of one.

**Should ⌘S still be bound at all?** §3.4 keeps it as "checkpoint", which is
honest but is not what ⌘S means to anyone's fingers. The alternative is to leave
⌘S as a plain flush (harmless — it is already what happens every 2s) and put
checkpointing behind an explicit menu item, where a name can explain itself.
Worth deciding with the app on screen.
