"use client";
import { useEffect } from "react";
import { actions, type RootState, useDispatch, useSelector } from "@/store";
import { useCloseDeletedDocument } from "@/hooks/useCloseDeletedDocument";
import { createChangeBatcher } from "@/lib/changes/coalesce";
import { decodeChangeEvent } from "@/lib/changes/events";

/** The SSE endpoint. Same origin, so the session cookie rides along. */
const CHANGE_FEED_ROUTE = "/api/events";

/**
 * Hop 4 of the change feed: the browser end —
 * docs/plans/archive/changes-detection.md §2.4.
 *
 * An agent write in a terminal reaches the sidebar in the time it takes
 * Postgres to commit and one fetch to return, with no interaction and no
 * refresh. That is §1.2's whole promise, and this hook is where it lands.
 *
 * ## `EventSource`, and nothing around it
 *
 * Reconnect is not implemented here because `EventSource` already implements
 * it: on a dropped connection it waits and re-issues the same `GET`, forever,
 * with backoff the browser owns. So the `error` handler does nothing —
 * literally nothing, and there is not one. A hand-rolled retry on top would
 * race the built-in one and open two streams.
 *
 * Cookies go on same-origin requests automatically, so the NextAuth session
 * cookie authenticates the stream with no header to set and no token to
 * refresh — which is also why there is no `withCredentials` here.
 *
 * ## What (re)connecting means
 *
 * Every `open` and every `resync` runs the *same* pair of dispatches, because
 * they mean the same thing: the server cannot say what happened while nobody
 * was listening. `NOTIFY` has no durability — no queue, no replay, no error —
 * so a reconnect is not a resumption, it is a fresh start that has to ask.
 *
 * Both halves of the ask are load-bearing:
 *
 * - `catchUpPosts` (§3) diffs the full owned id-set against the store, which is
 *   the only shape that can report a *deletion*: `Document` has no `deletedAt`,
 *   so a hard-deleted row leaves nothing for a cursor query to find (§3.1).
 * - `refreshProposals()` (§3.2), and this one is easy to leave out and hard to
 *   notice missing. `upsertProposal` writes `Revision` rows only and never
 *   touches `Document.updatedAt`, so **no** document-shaped query — cursor or
 *   full set — can ever surface a proposal. Without this dispatch §1.2's second
 *   promise fails across every disconnect window while everything else works
 *   perfectly.
 *
 * `resync` arrives on the listener's every (re)connect including its first, so
 * a tab that was already streaming when Postgres bounced re-converges without
 * its own connection having dropped.
 *
 * ## What a message means
 *
 * Ids, never content (§10). A document event is a fetch of that row —
 * `fetchChangedPosts`, which strips `data` for §4's list-metadata-only rule, so
 * an event about the document you are editing cannot replace what is in the
 * editor. A proposal event is one `refreshProposals()`: the presentation
 * already exists and §4 is explicit that the feed triggers that path rather
 * than duplicating it.
 *
 * Nothing announces itself. A change arriving is a row appearing and a marker
 * showing (§10), and a stream that drops tells the user nothing at all — the
 * poll is still there, and the next reconnect catches up.
 *
 * ## The workspace half of a delete
 *
 * A `document.deleted` for a document a pane is holding has to close that pane,
 * for the reason `useCloseDeletedDocument` sets out in full: the store loses the
 * entity, so the title falls to "Untitled" while the body stays on screen, and
 * `useSave` — which derives its id from the Redux entity — drops every save in
 * silence. That hook names this caller. It is driven from the ids the feed
 * *proves* are gone, never from a watcher over panes whose document is missing
 * from the store: `WorkspacePanes` deliberately does not gate the workspace
 * restore on `ui.initialized`, so every restored pane predates `loadPosts` on a
 * cold load, and a deep-linked collab document has the same window. Such a
 * watcher would close healthy panes.
 *
 * ## Mounted once
 *
 * In the app shell, beside `useBackgroundRefresh`. A second mount would be a
 * second SSE connection per tab — and a second one of everything the first
 * one's `open` dispatches.
 *
 * That is worth more than tidiness under HTTP/1.1, where a browser allows six
 * connections per origin and this one never returns: two mounts across six tabs
 * would be the whole budget, and the seventh request — an image, a save —
 * simply waits. Production is HTTP/2 over a single multiplexed connection
 * (docs/plans/production-deployment.md), where the limit does not apply; `next
 * dev` is plain HTTP/1.1, so the cost is real exactly where a developer keeps
 * many tabs open.
 */
export function useChangeFeed(): void {
  const dispatch = useDispatch();
  // Guests get nothing: the stream is `userRoute` and would 401, and a guest's
  // documents live in IndexedDB where no server write can reach them. Keyed on
  // the id so signing in opens a stream and signing out closes it.
  const userId = useSelector((state: RootState) => state.user?.id);
  const closeDeleted = useCloseDeletedDocument();

  useEffect(() => {
    if (!userId) return;
    // Effects do not run on the server, but a test renderer or a browser old
    // enough to lack `EventSource` should degrade to the poll rather than throw
    // during mount.
    if (typeof EventSource === "undefined") return;

    /** The (re)connect sequence — see the doc comment on why it is two calls. */
    const catchUp = () => {
      void dispatch(actions.catchUpPosts()).unwrap().then(
        ({ deletedIds }) => {
          // After the reducer has dropped the entities, since the repair reads
          // which pane is showing a document the store no longer holds.
          for (const id of deletedIds) closeDeleted(id);
        },
        // A failed catch-up is not news (§10); the next reconnect or focus asks
        // again.
        () => {},
      );
      void dispatch(actions.refreshProposals());
    };

    // One window's worth of events, folded — an `apply_ops` run announces
    // several times in a few milliseconds, and without this each announcement
    // would be its own fetch of the same row.
    const batcher = createChangeBatcher({
      onFlush: ({ changedIds, deletedIds, proposals }) => {
        if (deletedIds.length) {
          dispatch(actions.reconcilePosts({ changed: [], deletedIds }));
          for (const id of deletedIds) closeDeleted(id);
        }
        // `fetchChangedPosts.fulfilled` folds the rows in; nothing to await and
        // nothing to report if it fails.
        if (changedIds.length) {
          void dispatch(actions.fetchChangedPosts(changedIds));
        }
        if (proposals) void dispatch(actions.refreshProposals());
      },
    });

    const source = new EventSource(CHANGE_FEED_ROUTE);

    // `open` fires on the first connection *and* on every one `EventSource`
    // makes on its own after a drop, which is exactly the set of moments the
    // catch-up is for.
    source.addEventListener("open", catchUp);
    source.addEventListener("resync", catchUp);
    source.addEventListener("change", (event) => {
      // Named events do not reach `onmessage`, so this listener is the only
      // reader of the payload; the cast is what `addEventListener`'s string
      // overload costs, since it cannot know a custom name carries a
      // `MessageEvent`.
      const { data } = event as MessageEvent<string>;
      // The same decoder the server-side listener uses — `events.ts` is
      // import-free precisely so both ends share it. `null` is a payload from
      // an older or newer deployment; §3's catch-up carries whatever it meant.
      const decoded = decodeChangeEvent(data);
      if (decoded) batcher.push(decoded);
    });

    return () => {
      // Before `close()`: a window still open would otherwise fire into an
      // unmounted tree.
      batcher.cancel();
      source.close();
    };
  }, [dispatch, userId, closeDeleted]);
}
