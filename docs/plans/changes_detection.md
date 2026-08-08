# Changes detection

When Claude Code creates or edits a post, the browser does not find out. You
refresh, and the sidebar catches up. This plan closes that gap with a change
feed: Postgres `NOTIFY` at the write, `LISTEN` in the Next process, SSE to the
browser, and a full-set reconcile on reconnect that makes the whole thing
survive a dropped connection.

## 1. The problem

### 1.1 Why nothing updates today

Two independent facts, either of which alone would be enough.

**The writer is out-of-band.** `mcp/content-server.ts` talks straight to
Postgres through Prisma — there is no `fetch` in the file. `create_post` lands a
document and its first revision in one transaction
(`mcp/content-server.ts:723-744`); `apply_ops` writes a pending proposal via
`proposeRevision` → `upsertProposal` (`mcp/content-server.ts:644`,
`src/repositories/revision.ts:435`). The MCP server runs as its own `node`
process over stdio, so no Next request scope exists at the moment of the write:
no route handler runs, no `revalidatePath` fires, no cache tag flips.

This is not a new discovery. `src/repositories/revision.ts:49-68` already
records that nothing can call `revalidateTag("revision")` for exactly this
reason, and that a cache _bypass_ was chosen instead. This plan is the same root
cause surfacing a second time, from the client end.

**The reader loads once.** `actions.load()` is dispatched behind an
`initialized` guard at `src/components/Layout/AppLayoutContent.tsx:77-79`, and
`load` itself (`src/store/app.ts:337-349`) runs `loadPosts` → `loadSeries` →
`loadProjects` exactly once per store lifetime. The sidebar renders purely from
that snapshot (`src/components/Layout/SideBar/index.tsx:87-90`). Nothing
re-reads it except explicit user mutations calling `router.refresh()`.

The one existing bridge is `src/hooks/useProposalPoll.ts` — mounted app-wide,
firing on `window.focus` and `visibilitychange`, throttled to 3s. It refreshes
_proposal counts only_. Its header comment explicitly rules SSE out of scope for
that phase (`useProposalPoll.ts:20-28`); this plan is where that decision gets
revisited, not contradicted — the hook stays, and becomes the fallback path.

### 1.2 What "fixed" means

- An agent `create_post` appears in the sidebar within a couple of seconds, with
  no interaction.
- An agent `apply_ops` surfaces its proposal marker on the affected row in the
  same window.
- A rename, move or delete from a second browser tab reaches the first.
- A dropped connection, a laptop sleep, or a Next restart loses **nothing** —
  the client re-converges on reconnect.
- An open editor with unsaved content is never disturbed.

## 2. The design

Four hops. Each is separately replaceable; hop 4 is the one that makes the
design correct rather than merely fast.

```
mcp/content-server.ts ──┐
src/app/api/**  (app) ──┼──▶ SELECT pg_notify('blog_changes', payload)
                        │        (inside the write transaction)
                        │
                        ▼
                  ┌───────────┐
                  │ Postgres  │  delivers on COMMIT
                  └─────┬─────┘
                        │  LISTEN blog_changes
                        ▼
      dedicated pg.Client (one per Next instance)
                        │
                        ▼
               in-memory emitter, per-user fan-out
                        │
                        ▼
               SSE  GET /api/events   (userRoute)
                        │
                        ▼
               EventSource in the browser
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
 reconcile store by id        on (re)connect: catch-up
                              GET /api/documents/changes
                              + dispatch(refreshProposals())
```

### 2.1 Hop 1 — `NOTIFY` at the write

`NOTIFY` is transactional: Postgres delivers it at `COMMIT` and discards it on
rollback. That is exactly the semantics we want, and it means the notify belongs
_inside_ the existing transaction, not after it.

Note the practical trap: the `NOTIFY` statement does not accept bind parameters.
Use the function form.

```ts
// mcp/content-server.ts — inside the create_post transaction
await prisma.$transaction([
  prisma.document.create({/* … as today … */}),
  prisma.revision.create({/* … as today … */}),
  prisma.$executeRaw`
    SELECT pg_notify('blog_changes', ${
    JSON.stringify({
      kind: "document.created",
      id,
      authorId,
      origin: AGENT_ORIGIN,
    })
  })
  `,
]);
```

Payload rules:

- **Ids, never content.** The payload cap is 8000 bytes; a document state would
  blow it and the client has to fetch anyway.
- **Carry `authorId`.** This is what lets the fan-out filter per subscriber
  without a database round-trip per event (§2.3).
- **Carry `origin`.** Lets the client distinguish an agent write from its own,
  which matters for the quiet-UI rule — an agent write should surface a marker,
  the user's own write should not re-announce itself.

Emit sites:

| Site                                                    | Event               |
| ------------------------------------------------------- | ------------------- |
| `mcp/content-server.ts` `create_post`                   | `document.created`  |
| `mcp/content-server.ts` `apply_ops` → `proposeRevision` | `proposal.upserted` |
| `src/repositories/revision.ts` approve / reject         | `proposal.resolved` |
| App document create / rename / delete / move routes     | `document.*`        |

**Open decision.** The app's own routes could get this automatically via a
Prisma client extension (`$extends` with a query hook on `document` /
`revision`) rather than hand-placed calls. One place instead of a dozen, and it
cannot be forgotten — but it fires inside every transaction including ones we
have not thought about, and it is harder to reason about than an explicit call.
Recommendation: hand-place first, extract to an extension only if the call sites
multiply.

### 2.2 Hop 2 — `LISTEN` in the Next process

Prisma has no `LISTEN`. This needs `pg` as a direct dependency (currently absent
— checked), used for one long-lived connection alongside Prisma.

Three constraints, all of which bite silently if ignored:

**It must be a `Client`, not a `Pool`.** `LISTEN` binds to a session. A pooled
connection gets returned to the pool and notifications stop arriving, with no
error.

**It must survive HMR.** `src/lib/prisma.ts` already does the `globalThis` dance
for exactly this reason. Without the same treatment, every dev-mode recompile
opens another listener connection that is never closed, and you exhaust
`max_connections` over an afternoon of editing.

**It must start lazily.** Module-load-time connection means `next build` tries
to reach Postgres. Start on the first SSE subscriber, stop when the last one
leaves (or keep it warm — see the open question in §9).

```ts
// src/lib/changes/listener.ts
import "server-only";
import { Client } from "pg";

declare global {
  var __changeListener: ChangeListener | undefined;
}

// On every (re)connect, emit a `resync` to all subscribers: notifications sent
// while we were disconnected are gone, and the only honest recovery is to make
// clients re-run the catch-up query (§3).
```

Reconnect with capped exponential backoff. Treat `error` and `end` identically —
both mean "we may have missed events."

### 2.3 Hop 3 — SSE fan-out

`GET /api/events`, wrapped in `userRoute` — this is the authorization boundary,
and it does not change the `publicRoute` grep-list invariant that CLAUDE.md
relies on.

```
Content-Type:      text/event-stream
Cache-Control:     no-cache, no-transform
Connection:        keep-alive
X-Accel-Buffering: no        # nginx and friends will buffer without this
```

Requirements:

- **Filter by `authorId` before writing to the stream.** The emitter is
  process-wide; a subscriber must only ever see events whose `authorId` matches
  its session user. This is the single most important line in the feature — get
  it wrong and the change feed becomes a cross-tenant id leak.
- **Heartbeat.** A `:ping\n\n` comment every ~25s, or idle proxies close the
  connection.
- **No `id:` fields.** An earlier draft carried a watermark here so that
  `Last-Event-ID` could seed the catch-up — but the browser replays that header
  to _this_ endpoint, not to the catch-up fetch, so the client would have had to
  track `event.lastEventId` by hand anyway. Moot now: the catch-up (§3) takes no
  cursor at all, so there is no starting point to seed.
- **Clean up on `request.signal`.** Abort fires when the tab closes; without
  unsubscribing there, the emitter accumulates dead subscribers.

_Verify:_ that `userRoute` returns a streaming `Response` through unmodified and
does not buffer it (`src/lib/api-utils.ts:271`). If it does buffer, the wrapper
needs a pass-through case rather than the route needing an exemption.

### 2.4 Hop 4 — the client

`EventSource` gives auto-reconnect natively; do not hand-roll it. (Its
`Last-Event-ID` replay goes unused — see §2.3.)

```ts
// src/hooks/useChangeFeed.ts
// - on "open"    → run catch-up (§3) AND dispatch(refreshProposals()) (§3.2),
//                  then trust the stream
// - on message   → dispatch(reconcile(...)) for the named ids
// - on "error"   → EventSource retries on its own; do nothing but note the gap
```

`EventSource` sends cookies on same-origin requests, so the NextAuth session
cookie authenticates the stream with no extra work. Guests get nothing — mirror
the `userId` guard already in `useProposalPoll.ts:37,42`.

## 3. The durability layer, and why it is not optional

**`NOTIFY` has no durability.** If nobody is `LISTEN`ing at that instant, the
message is dropped. No queue, no replay, no error. Every reconnect window — SSE
drop, Next restart, laptop sleep, deploy — silently loses whatever happened
inside it.

This is not an edge case to tolerate. It is the normal operating condition of a
dev loop where you restart the server constantly.

The fix is a catch-up query, run on every `(re)connect`:

```
GET /api/documents/changes
→ { ids: [{ id, updatedAt }] }     // every document the caller owns
```

No `since=` cursor, deliberately. The obvious shape — hand back a timestamp,
return rows newer than it — fails twice:

- **It cannot report a hard delete** (§3.1): the row is gone, and nothing is
  left to have a recent `updatedAt`.
- **It has the timestamp race.** `updatedAt` is stamped when the statement runs
  but becomes visible at commit. A slow transaction surfaces a row whose
  timestamp is _older_ than a watermark the client has already advanced past,
  and a cursor query then misses that row forever. The standard mitigation is an
  overlap window — a tunable in service of a mechanism we do not need.

The full id set has neither problem, and the client diff against the store
answers all three questions at once: an id the store does not hold is a create,
a newer `updatedAt` is an update, an id in the store but absent from the
response is a delete. Cheap by construction: two small fields per row off a
prefix scan on the author's existing indexes, no document bodies — hundreds of
rows for a personal blog. Revisit only if the document count makes the response
large enough to notice.

Worth stating plainly, because it is the thing that justifies the extra
endpoint: **Firestore ships resume tokens despite holding a persistent
connection.** A live stream does not remove the need for catch-up; it only makes
catch-up rare.

### 3.1 The hard-delete problem

`Document` has no `deletedAt` — deletes are hard deletes
(`src/repositories/document.ts:488` runs `tx.document.delete`; the model's
`status ACTIVE|DONE` is workflow state, not deletion, and the TrashBin name in
CLAUDE.md is UI vocabulary, not schema). So **no query over surviving rows can
report a deletion** — the row is gone, and there is nothing left to have a
recent `updatedAt`. This alone rules out the cursor shape, and it is why the
endpoint returns the full set for the client to diff.

Live `NOTIFY` handles deletes fine — you emit at delete time. It is only the
catch-up path that would have been blind.

The alternative was soft deletes: correct in the large, but a schema migration
plus an audit of every read path to filter the tombstones. Out of proportion to
this feature.

### 3.2 The proposal blind spot

The document catch-up cannot see proposals, for a reason worth spelling out:
`upsertProposal` (`src/repositories/revision.ts:435`) writes only `Revision`
rows — it never touches `Document.updatedAt`. An `apply_ops` that lands while
the client is disconnected moves nothing in the document table, so no
document-shaped query — cursor or full set — will ever surface it. Same shape as
the hard-delete problem: the signal is not in the table being asked.

The fix costs one dispatch, because the presentation layer already exists: the
(re)connect sequence runs `refreshProposals()` alongside the document catch-up
(§2.4). That is the same call the focus poll makes today, and §4's rule holds —
the feed triggers the refresh, it does not duplicate it. Without this line,
§1.2's second promise fails across every disconnect window while the rest of the
design works perfectly.

## 4. Reconciling into the store

`loadPosts.fulfilled` calls `postsAdapter.setAll` (`src/store/app.ts:769`) — a
wholesale replace. A background refresh must not use it, for two reasons: it
discards any entity the response happens not to include, and it churns every row
in a list the user may be looking at.

Add a dedicated reducer instead:

```ts
// upsert the named ids, remove the ones the catch-up proves are gone,
// and touch nothing else.
reconcilePosts(state, { changed, deletedIds });
```

**Ordering is manual, and the reducer must handle it.** `postsAdapter` is
created without a `sortComparer` (`src/store/app.ts:72`) — order is whatever
`ids[]` holds, maintained by hand: `loadPosts` pre-sorts by `updatedAt`
descending before `setAll`, and `prependPost` splices new ids to the front. A
naive `upsertMany` therefore leaves a touched post where it already was and
appends a new one at the _end_ of the sidebar. `reconcilePosts` must place ids
explicitly — re-sorting `ids[]` after the upsert is enough at this scale — and
the §8 spec asserts order, not just membership.

**On not clobbering the open editor.** The reconcile deliberately updates _list
metadata only_ — `name`, `seriesId`, `rank`, `updatedAt`, `agentCreatedAt`. It
never force-reloads the content of an open document. This sidesteps the problem
rather than solving it: Lexical holds editor state in the editor instance, not
Redux, so as long as the feed does not push content, there is nothing to
clobber. (It also matters because the dirty-tracking machinery — `dirtyDocIds`,
`useDirtyTracking`, `selectIsDirty` — was deleted outright in the quiet-autosave
work, so there is no longer a "this document is dirty" flag to consult even if
we wanted one.)

An agent proposal on the _currently open_ document surfaces as a marker via the
existing proposal path (`refreshProposals`), which already knows how to present
it. The change feed's job is to trigger that refresh, not to duplicate it.

## 5. Failure modes

| Failure                          | Behaviour                     | Recovery                                                                        |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| Postgres restarts                | Listener errors, backs off    | Reconnect → `resync` → clients catch up                                         |
| Next restarts                    | All SSE connections drop      | `EventSource` auto-retries → catch-up on open                                   |
| Laptop sleeps                    | Connection dies silently      | Retry on wake; `visibilitychange` poll as belt-and-braces                       |
| Events missed while disconnected | Invisible at hop 1–3          | **Caught by §3** (documents) and §3.2 (proposals) — the whole reason they exist |
| Proxy buffers the stream         | No events, no error           | `X-Accel-Buffering: no`; verify in the target deployment                        |
| Connection pooler in txn mode    | `LISTEN` silently never fires | §6 — must be checked, not assumed                                               |
| Subscriber leak                  | Memory growth                 | Unsubscribe on `request.signal` abort                                           |

The pattern worth noticing: every row's recovery is either "EventSource retries"
or "§3 catches up." That is the design working — hops 1–3 are an optimisation
over hop 4, and hop 4 is what makes it correct.

## 6. Deployment constraints

**`LISTEN` does not survive a transaction-mode connection pooler.** PgBouncer in
`transaction` mode, Supabase's `:6543` pooled port, Neon's pooled endpoint — all
of them break it, and they break it _silently_: the connection succeeds, the
`LISTEN` succeeds, and notifications simply never arrive.

Per `docs/plans/prod-storage-decision.md` the target is a container on Fly with
a direct Postgres connection, which is fine. But the listener must use the
**direct** `DATABASE_URL`, not a pooled one, and this needs confirming before
release rather than discovering it in production.

**Multiple instances are fine.** `NOTIFY` broadcasts to every listener, so each
Next instance holding its own `LISTEN` receives every event and serves its own
subscribers. This is a real advantage over an in-memory emitter fed by a
localhost webhook, which would only ever reach the one process that received the
POST.

## 7. Phasing

Each phase is independently useful and independently shippable.

**Phase 0 — reconcile + poll.** The catch-up endpoint (§3), the `reconcilePosts`
reducer (§4), and widening `useProposalPoll` into a general background refresh.
No new infrastructure, no `pg` dependency. Delivers the focus-refresh behaviour
that TanStack Query and SWR both ship on by default. **This is a prerequisite of
Phase 3's correctness, not an alternative to it** — build it first regardless.

**Phase 1 — `NOTIFY`.** Add the emit sites (§2.1). Inert on its own; verify with
`psql` doing `LISTEN blog_changes` while an agent writes.

**Phase 2 — `LISTEN`.** Add `pg`, the listener singleton, the emitter (§2.2).
Still no client-visible change; verify by logging received events.

**Phase 3 — SSE.** The route and the hook (§2.3, §2.4). The Phase 0 poll stays
as the fallback for when the stream is down, throttled harder now that it is no
longer the primary path.

## 8. Testing

Following the repo's standing convention: the logic goes in import-free modules
so vitest can exercise it without mounting anything.

Testable:

- The catch-up diff — given a store id-set and a full-set response, which ids
  upsert and which are deleted (§3, §3.1). This is where the hard-delete
  reasoning either holds or does not.
- Event coalescing — N notifications for the same id inside one window collapse
  to one refresh.
- The `reconcilePosts` reducer — that it upserts the named ids, removes the
  proven-gone, leaves every other entity byte-identical (§4), and lands `ids[]`
  in `updatedAt` order — the adapter has no `sortComparer` to do that for us.

Not testable here, and verified against the running app and the local Postgres,
consistent with how API authorization is already handled in this repo:

- `pg` `LISTEN` delivery and reconnect.
- The SSE stream itself, and the per-user filter in §2.3 — this one is
  security-relevant and must be exercised by hand with two accounts.
- `EventSource` reconnect, and that the on-open catch-up (documents _and_
  proposals, §3.2) actually fires after it.

> Before running anything against Postgres, check what is already serving 5432
> (`docker ps`, `pg_isready -h localhost -p 5432`). `docker compose up -d` will
> kill a container already holding the real dev data.

## 9. Open questions

1. **Does `userRoute` pass a streaming `Response` through unbuffered?** (§2.3)
   Decides whether the SSE route fits the existing wrapper scheme or needs a
   pass-through case added to it.
2. **Listener lifecycle: lazy-start/stop, or warm for the process lifetime?**
   Stopping on the last unsubscribe is tidier; keeping it warm avoids a
   reconnect storm when the last tab closes and reopens. Warm is probably right
   for a container, lazy for dev.
3. **Prisma extension or hand-placed `pg_notify`** for the app's own write
   routes (§2.1).
4. **Should the feed cover series and projects, or documents only?** Documents
   are the whole of the reported problem; series/project changes are rarer and
   already covered by the Phase 0 poll.

## 10. What this deliberately does not do

- **No WebSocket.** This is strictly server→client. SSE gives reconnect and
  event ids for free; a WebSocket would be a bidirectional channel with no
  second direction.
- **No logical replication / CDC.** WAL decoding is the durable, catches-every-
  writer answer — it is what Supabase Realtime is built on, and it is the honest
  Postgres analogue of Firestore's change feed. It is also a replication slot to
  manage, a decoder to deploy, and an unbounded-WAL-retention failure mode that
  can fill a disk if the consumer stalls. That is a bad trade for a feature
  whose job is to keep a sidebar current. Revisit if "any writer, never missed"
  becomes load-bearing — a second app instance, a migration script, manual
  `psql` surgery.
- **No sync engine.** ElectricSQL, PowerSync and Zero all solve a superset of
  this, and all of them want to own the data layer that Prisma and the
  `PostBackend` seam currently own.
- **No content in the payload.** Ids only; the client fetches. Keeps the 8000
  byte cap irrelevant and keeps authorization on the fetch path where it already
  works.
- **No toasts.** Per the quiet-UI rule, a change arriving is a row appearing and
  a marker showing — not an announcement.
