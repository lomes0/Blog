# Indicating agent changes in the UI

**Status: guidelines, decided 7 Aug 2026 — not started.** Follow-on to
[agent-gating.md](./agent-gating.md), whose phase 4 shipped the first cut of
surfacing (§3.5). The gating mechanism is right; what it says on screen is
thinner than intended. This document fixes the vocabulary, not the mechanism —
nothing in `src/lib/proposals.ts`, the routes or the schema changes.

## 1. What shipped, and where it is thin

Four surfaces exist: a glyph on the sidebar post row
(`SideBar/PostItem.tsx:406`), the rail's "Agent changes" section
(`RightRail/ProposalsSection.tsx`), the review bar over the diff
(`Diff/ProposalReviewBar.tsx`), and the focus poll that feeds them
(`useProposalPoll.ts`). Seven gaps, in the order they bite:

1. **An agent-created post (§3.7) has no tree presence at all.** `hasProposal`
   reads `ui.proposals.byDocId`, which holds pending proposals only. A post
   Claude wrote sits in the sidebar looking like any other draft.
2. **The marker dies at a fold.** It is gated on `sidebarOpen`, and no group row
   aggregates it, so a proposal inside a collapsed series is invisible.
3. **No count outside the full rail.** `ui.proposals.count.total` has exactly
   one reader (`RightRail/index.tsx:63`); collapse the rail and the number is
   gone.
4. **Opening the document says nothing.** `ProposalReviewBar` renders only
   inside the `showDiff` branch (`EditorTabPanel.tsx:290`), so you can open a
   document with a pending proposal, type, and silently mark it stale — a dead
   end whose only exits are reject or a re-run (§3.6).
5. **Provenance ends at approval.** `Revision.origin` is stored;
   `RevisionsSection` renders the account avatar, so an approved agent change is
   indistinguishable from your own save.
6. **The squash summary is last-batch-wins** (`proposals.ts:427`), so a
   three-batch proposal advertises one line and diffs three.
7. **One glyph carries every state** — fresh and stale look the same in the
   tree.

## 2. The state vocabulary

One set of glyphs, used identically everywhere a document is named — sidebar
rows, group rows, the collapsed sidebar, `/posts`. A glyph per state rather than
a colour per state, because DESIGN.md §10 forbids carrying state in colour alone
and this marker has to survive a monochrome scan of a dense tree.

| State                  | Glyph (lucide)   | Colour         | Tooltip / `aria-label`                         |
| ---------------------- | ---------------- | -------------- | ---------------------------------------------- |
| Pending proposal       | `GitPullRequest` | `primary.main` | Agent change waiting for review                |
| Stale proposal         | `AlertTriangle`  | `warning.main` | Agent change is out of date — reject or re-run |
| Agent-created post     | `FilePlus2`      | `primary.main` | Created by an agent, not yet accepted          |
| Roll-up (has children) | as above         | as above       | _n_ agent changes inside                       |

`ICON_SIZE.micro` (12px) on tree rows, matching the existing badge slot.
`FilePlus2` is already the rail's glyph for a created post, and `GitPullRequest`
already the rail's for a proposal — this is the same vocabulary, moved outward,
not a new one.

Precedence when a row could show more than one: **stale > pending > created.**
Stale is the only state that needs an action other than "look at it", so it
wins.

## 3. Where the vocabulary applies

### 3.1 Sidebar rows (`PostItem.tsx`)

Scope widens from "pending proposal on this post" to "pending proposal **or**
unaccepted agent-created post". Same slot, same layout, same
`ml: hasMarker ? 0
: "auto"` interaction with the edit button.

Stale is available client-side already —
`isProposalStale(proposal,
proposal.head)`, the same call the rail and the
review bar make — so per-state glyphs need no new field and no new request.

### 3.2 Group rows and the collapsed sidebar

`SeriesGroup` and `ProjectGroup` show the marker when any descendant carries
one, with the count in the tooltip. When the group is expanded the descendant
rows carry their own markers and the group's is redundant but harmless; do not
try to suppress it on expand, because that makes the marker flicker on a fold.

The collapsed (icon-only) sidebar keeps the marker as a dot on the document icon
— there is no room for a glyph beside a label that is not rendered. This is the
one place colour carries the state alone; the `aria-label` carries it for
everything else, and the collapsed rail is not a state anyone reviews from.

### 3.3 The rail toggle

A dot on the toggle when `count.total > 0` and the rail is not `full`. Not a
number: the rail is one click away and the count is the first thing it says.
This closes gap #3 without a second counting surface to keep honest.

### 3.4 The open document (`EditorTabPanel.tsx`)

A slim persistent bar above the editor whenever this document has a pending
proposal — **not** only in diff mode. Review / Approve / Reject, and the stale
line when stale, which is the same content `ProposalReviewBar` already renders.

Build it by lifting the condition, not by adding a component:
`ProposalReviewBar` renders today when `diff.new === proposal.id`; it should
render when a proposal exists, and drop only its dependence on the diff being
open. One bar, two contexts, so the two cannot drift.

This is the gap worth the most. Everything else here makes agent work easier to
find; this one stops the user destroying it by accident.

## 4. What the store has to grow

`ui.proposals.agentPosts` is an array. A per-row membership test against an
array runs for every row in the tree on every store change, which is the reason
`hasProposal` was written as a boolean selector in the first place
(`PostItem.tsx:110-117`). Two additions, both in `store/app.ts`:

- `agentPostIds: Record<string, true>` beside `byDocId`, written by the same
  reducer that fills `agentPosts` — the array stays, because the rail renders it
  in order.
- One memoized `selectMarkerByDocId` returning `Record<string, AgentMarker>` —
  every marked document and the state it is in. A group row answers "does any
  descendant have one" by walking its own children against that map rather than
  by scanning proposals per row.

A map and not a set of ids, because a group row asks two questions and a set
answers only the first. It needs membership _and_ the state, since the roll-up
applies the same stale > pending > created precedence a row does. With a set, a
row that found a member still had to go back to the store for its state — and
the only way to reach the store from inside a `useMemo` is to subscribe to it
whole, which puts every group row's cost back on the store's change frequency,
keystrokes included. That is the thing this section exists to prevent. One
subscription to one memoized object, whose identity moves only when a poll or a
review decision moves it, answers both questions and re-renders nothing on an
unrelated dispatch.

The roll-up itself is an exported pure helper beside the selector —
`rollUpMarkers(docIds, markerByDocId)`, returning `{ marker, count }` — not a
selector factory. The ids are not in the store: they come from the rendered
tree, grouped in `utils/posts/seriesGrouping.ts`. A selector parameterized by a
fresh id list per row would memoize on an argument that loses identity whenever
the tree re-derives, i.e. never usefully. The caller pairs the helper with its
own `useMemo` over ids it already holds. `selectAgentMarker` stays as it is, for
the per-row case where the return is a primitive and no roll-up is involved.

Nothing else. No new endpoint, no new poll, no field on `Post`.

## 5. Deliberately not doing

- **Provenance after approval (gap #5).** The chosen scope is "waiting on you",
  and a marker that outlives the decision stops meaning act-on-this. If the
  question comes back, the cheap answer is one line in `RevisionsSection`:
  render `origin` beside the author for rows that have one — the column is
  already selected and already reaches the client.
- **A count badge per document.** A document has at most one pending proposal
  (the partial unique index guarantees it), so the number is always 1. Counts
  belong on roll-up rows only.
- **Toasts, modals, SSE.** Unchanged from §3.5 — the poll on focus is the
  signal, and a marker that appears is the whole announcement. Quiet-UI rule.
- **Fixing the squash summary (gap #6).** Real, but it is a bug in
  `foldProposal`, not a question about indication; file it against
  agent-gating.md §3.2 rather than folding it in here.

## 6. Checks

Follow DESIGN.md conventions. `npx tsc --noEmit`, `npm run lint`,
`npm run check:theme` (§19 — the warning/primary pair must survive the
light/dark toggle). No spec will cover any of this; verify in a real browser per
`verify-ui-in-browser`, with a proposal made from the terminal and a second one
marked stale by saving under it.
