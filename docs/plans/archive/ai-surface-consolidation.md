# AI surface consolidation

**Status: COMPLETE — all six phases shipped 8–9 Aug 2026**, `fb12b4e5`…`f58d50df`
(`fb12b4e5` one block schema, `801962ec` `list_series`, `aa1eaccf` one
vocabulary, `b3c2cbd7` one accept/reject mechanism, `21614a2f` one AI action
registry, `80722068`/`f58d50df` the loose ends). The headline consequence is
§4.4: the in-app Copilot's content edits **propose** now — they no longer apply
straight to the open document. **Related:**
[claude-code-lexical.md](./claude-code-lexical.md) (the block transport all of
this rides on), [agent-gating.md](./agent-gating.md) (the proposal table),
[workspace-panes.md](./workspace-panes.md) §3.1 (the command registry the
Copilot's non-content tools are generated from).

## 1. What exists

Four AI surfaces, not three:

| Surface           | Component            | Transport         | Tools                        | Threads   |
| ----------------- | -------------------- | ----------------- | ---------------------------- | --------- |
| Copilot panel     | `CopilotPanel`       | `/api/copilot`    | content + `command_*`        | persisted |
| Copilot inline    | `InlineCopilotBar`   | `/api/copilot`    | same                         | ephemeral |
| Editor toolbar AI | `AITools` (678L)     | `/api/completion` | **none** — text in, text out | none      |
| Claude Code       | `mcp/content-server` | stdio             | content only, other names    | n/a       |

Two of these are already one thing. `CopilotPanel` and `InlineCopilotBar` both
render `CopilotChat`, differing by `variant` / `persist` / `showTranscript`
props and their surrounding chrome. There is nothing to consolidate between them
and this plan does not touch them.

`src/lib/content-bridge/` is the seam that worked: blocks, addressing, ops and
`stateHash` are imported by both `editor/utils/copilotAgentExecutors.ts` (the
browser) and `mcp/content-server.ts` (Node). Keep going in that direction.

One divergence is inherent and stays: MCP sees cloud Postgres only, the in-app
agent sees Redux + IndexedDB + the live unsaved editor state. No amount of
sharing changes that, and the tool descriptions already say so.

## 2. Where they have actually separated

### 2.1 The zod schemas are copy-pasted, and drifting

`blockSchema`, `opSchema`, `placement`, `listItemSchema`, `kanbanTaskSchema` and
the `BLOCK_DOC` prose exist twice — `src/app/api/copilot/route.ts:82-195` and
`mcp/content-server.ts:251-380`. Diffing them today:

- MCP's `details` block accepts an `expanded` field; the route's does not.
- MCP's `BLOCK_DOC` documents `mimetype?` / `size?` on attachments and `tags?`
  on kanban tasks; the route's omits all three.
- The `placement` fields carry `.describe()` text on the MCP side and none on
  the route side, so the two agents are told different things about `after` /
  `before` / `appendTo`.

None of this was a decision. It is two copies aging apart, and every new block
type graduated under [claude-code-lexical.md](./claude-code-lexical.md) §4.6.1
has to be written twice or it works on one agent and not the other.

### 2.2 The same eight operations have two names

| Operation             | Copilot            | MCP           |
| --------------------- | ------------------ | ------------- |
| enumerate posts       | `list_documents`   | `list_posts`  |
| full-text search      | `search_documents` | `search`      |
| block skeleton        | `outline_document` | `outline`     |
| named blocks          | `read_blocks`      | `read_blocks` |
| whole post            | `read_document`    | `read_post`   |
| edit by block         | `apply_ops`        | `apply_ops`   |
| new post              | `create_document`  | `create_post` |
| enumerate series      | —                  | `list_series` |
| user's text selection | `get_selection`    | —             |

Only two agree. The cost is not cosmetic: prompts, docs, the `CopilotMessage`
label map and `commands/series.ts`'s own description all name tools in prose, so
a reader (human or model) moving between the two has to re-learn a vocabulary
that describes identical behaviour.

### 2.3 Capability gaps run both ways

- **MCP has `list_series`; the Copilot has no way to enumerate series.** It can
  only learn a series id from a post that happens to belong to one, which makes
  `series.open` — whose description points at `list_documents` for exactly this
  — reachable by luck. This is a real hole.
- **The Copilot has `get_selection` and every `command_*` tool**; MCP has
  neither. This one is deliberate (§4.3).

### 2.4 "The AI edited my post" means two different things

This is the largest divergence of the four, and the one with consequences beyond
maintenance.

MCP writes land in the proposal table via `upsertProposal` and wait for the
author to approve them in-app — that is the whole of
[agent-gating.md](./agent-gating.md). In-app Copilot writes are proposals _in
the chat UI_, and on accept they dispatch `updatePost` or set the live editor
state directly; they never touch that table.

The in-app path therefore has none of what that plan built:

- **No compare-and-set.** An accepted Copilot edit overwrites whatever the
  document now holds. `applyOps`' `stateHash` guard covers the window between
  the agent's read and its proposal, but nothing covers the window between the
  proposal and the click.
- **No staleness.** `planStaleMarking` never runs against a Copilot edit, so
  there is no state in which the app can say "you saved underneath this".
- **No provenance.** `Revision.origin` is unset, so "which agent wrote this" is
  answerable for Claude Code and not for the Copilot.
- **No review surface.** `AgentChangeBar`, `ProposalsSection`, `AgentMarker` and
  the `Diff` view exist and none of them ever see a Copilot edit.
- **No squash.** Three edits in one turn are three independent writes.

So it is not that the two mechanisms differ in ceremony. One of them has the
safety properties and the other does not.

### 2.5 "AI action" is defined three times

The idea of a canned instruction — summarize, fix grammar, improve — is spelled
out independently in:

- `src/lib/ai/types.ts` `AIOptionType` + `src/lib/ai/prompts.ts`
  `SYSTEM_PROMPTS` — the toolbar's seven, selection-scoped, streamed in place.
- `src/components/CopilotPanel/slashCommands.ts` `SLASH_COMMANDS` — five,
  document-scoped, sent as chat prompts.
- `src/components/CopilotPanel/QuickActions.tsx` `QUICK_ACTIONS` — three,
  document-scoped, also chat prompts.

Summarize appears in all three with three different wordings. Improve and fix
grammar appear in two.

### 2.6 Loose ends found on the way

- `COPILOT_SYSTEM_PROMPT` (`src/lib/ai/prompts.ts:32`) is exported and imported
  nowhere. It is the pre-agent prompt and still instructs the model to call
  `insert_heading` / `insert_paragraph` with `afterNodeKey` — tools that were
  deleted.
- `src/app/api/completion/route.ts:19` does `await req.json()` and casts the
  result. That is the pattern `no-restricted-syntax` bans under
  `src/app/api/**`; the rule appears to match on the `request.json()` spelling,
  so binding the parameter as `req` slips past it. `provider`, `model`,
  `option`, `tone` and `command` all reach the model unvalidated.

## 3. Decisions taken

Answered before this plan was written:

1. **Goal is all three** — stop the drift, close the capability gaps, and make
   the surfaces read as one assistant.
2. **MCP stays content-only.** No command tools over stdio (§4.3).
3. **The `post` vocabulary wins.** MCP's names are the target; the Copilot
   renames to match.
4. **The toolbar AI keeps its interaction** — select text, apply an action,
   watch it stream in place — but its _definition_ unifies with the Copilot's
   canned prompts.
5. **The Copilot's content writes move onto the proposal infrastructure**, and
   they share a _write function_ with MCP rather than only a set of tables
   (§4.4). The agent proposes on the tool call, with no chat-side hold; the one
   decision the author makes is in `AgentChangeBar` or the rail, exactly as it
   is for Claude Code today.

## 4. Plan

Six phases, ordered so each is independently shippable and the risky ones come
after the mechanical ones.

### 4.1 Phase 1 — one schema

Extract `src/lib/content-bridge/schema.ts` holding the zod mirror of the block
model: `listItemSchema`, `kanbanTaskSchema`, `blockSchema`, `placement`,
`opSchema`, and the `BLOCK_DOC` prose. `api/copilot/route.ts` and
`mcp/content-server.ts` both import it and declare no schemas of their own.

It belongs next to the codecs rather than in `src/lib/ai/` because the codecs in
`blocks.ts` are what actually accept or reject a block; the zod schema is a
description of them and should sit where it can be kept honest.

Reconcile the three drifted fields against what `blocks.ts` really round-trips —
that is the arbiter, not either copy. Preserve the `.describe()` text; the route
side is the one that lost it.

**Test:** extend `content-bridge/__tests__/codecs.test.ts` so the existing
per-type round-trip also asserts the zod schema accepts the fully-populated node
it feeds the codec. That makes graduating a block type fail loudly if only one
of the two is updated, which is the failure §2.1 describes.

Risk: low. No behaviour change on either agent beyond the three fields being
accepted in both places instead of one.

### 4.2 Phase 2 — one vocabulary

Rename the Copilot's content tools to the MCP names:

```
list_documents   → list_posts       read_document   → read_post
search_documents → search           create_document → create_post
outline_document → outline
```

`read_blocks`, `apply_ops` and `get_selection` are unchanged. `command_*` keeps
its prefix, so there is no collision with `search` or `outline`.

Blast radius, all of which must move together:

- `src/app/api/copilot/route.ts` — the `readTools` / `libraryWriteTools` keys.
- `src/lib/ai/copilotAgentTools.ts` — `READ_TOOLS` / `WRITE_TOOLS`.
- `src/editor/utils/copilotAgentExecutors.ts` — the `runReadTool` switch and the
  `applyWrite` branch.
- `src/lib/ai/prompts.ts` — the `CONTENT TOOLS` section of
  `COPILOT_AGENT_SYSTEM_PROMPT`, which lists every tool by name.
- `src/components/CopilotPanel/CopilotMessage.tsx` — per-tool display labels.
- `src/commands/document.ts` — `document.create`'s description names
  `create_document` in prose. (`series.open`'s named `list_documents` when this
  was written; Phase 3 pointed it at the new `list_series` instead.)
- `src/lib/ai/commandTools.ts` and
  `src/components/CopilotPanel/ActionPreview.tsx` — both name content tools, the
  first in prose and the second in a `switch`.
- Tool descriptions that name _other_ tools: `read_blocks` says "by address from
  `outline_document`", `read_document` says "use `outline_document` then
  `read_blocks`". Left behind, these actively mislead the model.
- `src/commands/__tests__/toolParity.test.ts` — imports the two name arrays. Its
  "names every content tool in the system prompt" check is a substring match,
  and after the rename two tool names are ordinary English words, so `search`
  and `outline` pass against the surrounding prose. Match the listing entries
  (`- name:`) instead, and assert the other direction too — a listing line for a
  tool that is no longer declared is the half-done rename.
- `docs/architecture/claude-code-integration.md` and the plans under
  `docs/plans/` that quote tool names.

Risk: low mechanically, but a persisted Copilot thread contains tool calls under
the old names. `CopilotMessage` should fall back to rendering an unknown tool
name rather than blanking — check it does before shipping.

### 4.3 Phase 3 — close the parity gaps

**Copilot gains `list_series`**, matching MCP's. It is the missing half of
`series.open`, and it is a read tool so it auto-runs and costs the agent nothing
to try.

**MCP gains nothing.** Recorded here as a decision rather than an omission:
almost every command in the registry acts on the _browser's_ workspace — open a
pane, focus a tab, set a theme — and a stdio server has no session to perform
them against. Exposing them would ship tools that fail. `get_selection` is the
same argument in miniature: there is no cursor in a terminal. If Claude Code
ever needs to drive the app, that is a feature (a channel from the server to a
live session), not a refactor, and it gets its own plan.

The asymmetry should be stated in `mcp/README.md` so it reads as a boundary
rather than an oversight.

### 4.4 Phase 4 — one accept/reject mechanism

The Copilot's content writes stop being a chat-local mechanism and become
proposals, reviewed through the surfaces [agent-gating.md](./agent-gating.md)
already built. This is the largest phase and should be treated as its own piece
of work.

**Nothing on the review side is rebuilt.** `upsertProposal`, `foldProposal`, the
squash and its CAS, `planStaleMarking`, the approve and reject routes,
`useProposalActions`, `AgentChangeBar`, `ProposalsSection`, `AgentMarker`, the
`Diff` view and the SSE change feed all take a second writer without
modification — every one of them reads `origin` generically. `proposalLabels.ts`
even anticipates it in as many words: "`claude-code` today, whatever proposes
next tomorrow". Adding `"copilot": "Copilot"` to `KNOWN_ORIGINS` is the whole of
the UI change.

One thing that looks like a blocker and is not: the Copilot never touches
IndexedDB documents. `/api/copilot` is a `userRoute`, and `backendFor(user)`
returns `cloudBackend` whenever there is a user, so every document the in-app
agent can reach already has a `Revision` table behind it.

#### 4.4.1 One write function, not one write table

Extract `src/lib/agentWrites.ts`:

```ts
proposeOps({ documentId, authorId, ops, stateHash, origin, summary });
proposeNewPost({ authorId, title, blocks, origin });
```

`proposeOps` is `content-server.ts:610-780` lifted out, unchanged in substance:

1. `selectAgentRead` over `{ head, pending, committed }` — the pending proposal
   wins unless stale, so a second batch sees the first batch's work.
2. Check `stateHash` against the state that read chose.
3. `applyOps(state, stateHash, ops)` — **server-side**.
4. `foldProposal` → `upsertProposal`, which does the create / replace / squash
   and the version compare-and-set.
5. `changeNotification` so the feed announces it.

`mcp/content-server.ts`'s `apply_ops` handler collapses to a call. So does the
new browser route. This is the point of the phase: there is one execution of
`applyOps` against one authoritative base, rather than two implementations that
happen to write the same columns. It also stops the client computing a document
state the server would then have to trust.

It belongs in `src/lib/` rather than `src/repositories/` because it composes
content-bridge with two repositories; the repositories stay row-level.

#### 4.4.2 The route the browser needs

`POST /api/documents/[id]/proposals`, `userRoute<{ id: string }>`, body
validated with the shared `opSchema` from Phase 1.

Authorize with `requireDocument(id, user, "write")` — deliberately _not_ the
`own` that the approve route uses. A collab editor may propose; only the owner
may commit. That is the same line `lib/access.ts` already draws, and the approve
route's comment explains why the stricter mode is right there.

Returns the proposal id and whether it created or squashed, so the chat can say
which.

#### 4.4.3 Flush before the turn, not before the write

The sequencing detail most likely to bite. Today `apply_ops` reads the live
Lexical state and writes back to it, so unsaved edits are simply part of what
the agent sees. Once the proposal is built server-side from `head`, a document
with unsaved edits produces a proposal whose diff is against content the server
never had.

Flush the open document through `useSave` when the **turn starts**, not when the
write lands. Flushing at write time is too late: with the write happening on the
tool call rather than on an accept, the agent's read and its write are seconds
apart, and a save landing between them moves `head` and makes the server refuse
its own agent's write as stale on every turn.

After the flush, the live editor state and `head` agree, so the existing
read-tool behaviour stays correct without change.

> **Correction, found while implementing.** The paragraph above is true and
> insufficient, and shipping on it alone would have produced a feature that
> broke on the second turn of every conversation.
>
> The flush reconciles the editor with `head`. But `proposeOps` reads through
> `selectAgentRead`, which deliberately prefers the **pending proposal** over
> head — that is the rule that lets a second batch see the first batch's work.
> So once turn 1 leaves a proposal, turn 2's client-side read (live editor, i.e.
> head) computes a `stateHash` the server's base does not share, and every write
> in that turn is refused as stale. Permanently, until the author approves or
> rejects: the agent cannot re-read its way out, because re-reading returns the
> same head.
>
> The fix is that `load()` in `copilotAgentExecutors.ts` must mirror
> `selectAgentRead` client-side — a non-stale pending proposal wins over the
> editor, a stale one loses to the document — and judge staleness against the
> store's _current_ head rather than the proposal's snapshot, which closes the
> race where the turn-start flush moves head just before the read.
>
> The general lesson: the client's notion of "the document" now has three
> candidates, not two, and every one of them has to agree with what the server
> will build the proposal on.

#### 4.4.4 Creates land the way MCP's do

`create_post` stops dispatching `createPost` directly. It sets `agentCreatedAt`
and `agentOrigin`, so the post arrives as an unpublished draft with Keep and
Discard — which is what `findAgentCreatedDocuments` and the bar's second branch
already render. A create has no head to withhold, which is why it lands rather
than proposes; that reasoning is unchanged and applies to both agents equally.

#### 4.4.5 What the chat does instead

The write tools no longer produce a held tool call. On `apply_ops` the message
renders `Proposed 3 edits to "…"` with a **Review** action wired to
`useProposalActions.review`, which already opens the document, sets the diff
revisions and opens the diff in one call.

Consequences to carry through, none of them optional:

- `ActionPreview`'s per-op rendering is superseded by the diff for content ops.
  Keep it for command proposals, which still need it.
- `pendingCount` and the **Accept all** buttons in `CopilotPanel` and
  `InlineCopilotBar` now mean _command_ proposals only. Relabel or they read as
  covering the edits.
- A refused write — the author typed mid-turn — must say so readably in chat.
  This state did not previously exist in-app; `selectAgentRead`'s
  `staleProposal` flag is what reports it.

#### 4.4.6 The boundary: command proposals stay in the chat

`pane.split`, `document.rename`, `ui.setTheme` and the rest have no document
content and cannot be `Revision` rows. They keep the chat-side hold and the
Accept button.

So this phase unifies **content** writes, not all proposals. That is a real
boundary rather than an unfinished edge: a proposal table is a place to keep a
document state nobody has committed, and a pane split is not one.

#### 4.4.7 Risks

- **The watched-agent feel changes.** An edit you asked for a second ago now
  needs a trip to the bar. The Review link opening the diff directly is what
  keeps that to one click.
- **Squash becomes visible in-app.** Three edits in one turn become one pending
  row. "Accept all" used to mean three applications; now the turn produces one
  decision. Better, but different, and worth saying in the release note.
- **Two writers on one pending row.** A Copilot edit and a Claude Code edit on
  the same document now fold into the same proposal, and `origin` records only
  the latest. `foldProposal` already handles the concurrency correctly; what is
  undecided is whether a mixed-origin proposal should say so. Small, but decide
  it rather than discover it.

### 4.5 Phase 5 — one AI action registry

The toolbar interaction survives intact — select, pick an action, watch the
rewrite stream into place. `/api/completion` stays; turning `improve` into an
`apply_ops` proposal would add a review step nobody wants for "make this
shorter" and lose the streaming.

What unifies is the _definition_. `src/lib/ai/actions.ts`, in the spirit of
`commandRegistry`:

```ts
interface AIAction {
  id: string; // "improve", "summarize", "fixGrammar"
  label: string; // "Improve writing"
  scope: "selection" | "document"; // what it needs to run
  instruction: string; // the one wording, used by both paths
  icon?: ReactNode;
}
```

- The toolbar renders `scope === "selection"` and posts the action's
  `instruction` as the system prompt to `/api/completion` — replacing the
  `SYSTEM_PROMPTS` lookup and the `AIOptionType` union.
- The composer's `/` menu and the empty state's chips render from the same list,
  sending `instruction` as a chat prompt — replacing `SLASH_COMMANDS` and
  `QUICK_ACTIONS`.
- `tone` stays parameterized rather than becoming one action per tone.

Net effect: summarize is worded once, and adding an action puts it in the
toolbar and the Copilot at the same time.

Deletes `SYSTEM_PROMPTS`, `SLASH_COMMANDS`, `QUICK_ACTIONS` and the
`AIOptionType` union. `AITools.tsx` (678L) should lose most of its per-action
handler duplication in the process — seven near-identical `complete()` calls
collapse to one taking an action.

Risk: medium. It is the phase that touches the most UI, and the toolbar's
per-action behaviour (what it does with the streamed text, per option) needs
reading carefully before the handlers collapse.

### 4.6 Phase 6 — the loose ends

- Delete `COPILOT_SYSTEM_PROMPT` (§2.6). Confirm with `npm run check:unused`.
- Give `/api/completion` a zod schema and `parseBody`, like every other route.
- Widen the `no-restricted-syntax` rule in `eslint.config.mjs` so it catches
  `.json()` on any request-shaped binding, not just one spelled `request`. A
  rule the codebase can walk around by renaming a parameter is not the total
  guarantee the route conventions claim.

## 5. What this does not do

- Does not merge the panel and the inline bar. They are already one component.
- Does not give MCP the ability to drive the app (§4.3).
- Does not unify the two content scopes — cloud-only vs cloud+local+live editor
  is a property of where each agent runs.
- Does not put command proposals in the proposal table (§4.4.6).
- Does not fold the toolbar AI into the block/proposal world. The streaming
  in-place transform is a different and better interaction for what it does, and
  it rewrites a selection the user is looking at rather than proposing a change
  to a document they are not.

## 6. Suggested order

1. **Phase 1** (one schema) — mechanical, and Phase 4 wants the shared
   `opSchema` for its route body anyway.
2. **Phase 6** (loose ends) — independent, and `/api/completion`'s missing
   validation should not wait behind anything.
3. **Phase 3** (`list_series`) — small and independently useful.
4. **Phase 2** (rename) — wide but shallow; one commit, and best done before
   Phase 4 writes new call sites under the old names.
5. **Phase 4** (one accept/reject mechanism) — the largest, and the one with
   behaviour changes worth releasing on its own.
6. **Phase 5** (AI action registry) — the most UI churn, and it depends on
   nothing above.

Phases 1–3 are safe to land in any order. 4 and 5 each deserve their own branch
and their own verification pass against the local Postgres, since neither is
covered by an automated check on the API-authorization side.
