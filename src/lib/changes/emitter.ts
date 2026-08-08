/**
 * The process-wide fan-out, and the reconnect schedule that feeds it —
 * docs/plans/changes_detection.md §2.2, §2.3, §5.
 *
 * Import-free apart from its own types, like `diff.ts` and `dragGeometry.ts`.
 * `listener.ts` is the half that cannot be tested without a database: a socket,
 * a `LISTEN`, and a Postgres that has to actually go away for the reconnect
 * path to run. Everything that can be decided without one lives here, and the
 * reason that split matters is not tidiness — it is that **the per-user filter
 * is the security boundary** (§2.3: "the single most important line in the
 * feature — get it wrong and the change feed becomes a cross-tenant id leak"),
 * and a boundary nobody can run a test against is a boundary nobody has
 * checked.
 *
 * ## Why the registry is keyed, not filtered
 *
 * `NOTIFY` is a broadcast: one connection per Next instance receives every
 * event for every user, so something has to narrow it. The obvious shape is a
 * stream of everything plus a `.filter()` at the SSE route, and it is the wrong
 * one — it makes the leak a line someone can forget, in a file whose subject is
 * HTTP headers rather than authorization.
 *
 * So a subscription is *for* a user id by construction: {@link subscribe} takes
 * the id, events are stored bucketed by `authorId`, and {@link deliver} only
 * ever walks the one bucket. There is no method that hands out an unfiltered
 * stream, so Phase 3's route cannot forget the filter — it cannot express it.
 * The `authorId` on the event comes from the writer's own authorized row
 * (Phase 1), and the subscriber's id comes from `userRoute`'s session, so the
 * comparison is between two things the caller never chose.
 */

import type { ChangeEvent } from "./events";

/**
 * What a subscriber receives.
 *
 * Two shapes rather than one, because a resync is not an event about a
 * document: nothing in particular changed, we simply stopped being able to
 * promise that nothing did. See {@link SubscriberRegistry.broadcastResync}.
 */
export type FeedSignal =
  | { type: "change"; event: ChangeEvent }
  | { type: "resync" };

export type FeedListener = (signal: FeedSignal) => void;

/** Unregisters one subscription. Idempotent; safe to call after teardown. */
export type Unsubscribe = () => void;

export interface SubscriberRegistry {
  /**
   * Register `listener` for the events of exactly one user.
   *
   * The returned function is the only way to undo it, and §5's "subscriber
   * leak" row is why it is a return value rather than a `remove(listener)`
   * lookup: the caller cannot get the key wrong.
   */
  subscribe(userId: string, listener: FeedListener): Unsubscribe;
  /**
   * Hand `event` to the subscribers of `event.authorId`, and to nobody else.
   * Returns how many listeners it reached — the assertion the fan-out spec
   * makes, and a cheap thing for the listener to log.
   */
  deliver(event: ChangeEvent): number;
  /**
   * Tell every subscriber to re-run the catch-up (§3).
   *
   * Emitted on every (re)connect, *including the first*. That is correct
   * rather than a wart: notifications sent while we were not listening are
   * gone — `NOTIFY` has no queue, no replay and no error — so the only honest
   * statement the server can make after connecting is "I cannot tell you what
   * you missed, go and look".
   */
  broadcastResync(): number;
  /** Live subscriber count, across all users. For teardown assertions. */
  readonly size: number;
}

/**
 * One record per subscription, so identity is per *call* and not per function.
 *
 * A bare `Set<FeedListener>` would silently collapse two subscriptions that
 * happened to pass the same function reference, and then the first
 * unsubscribe would cut off the second stream. Distinct closures make that
 * unlikely rather than impossible, and "unlikely" is not a property worth
 * relying on for a teardown path.
 */
interface Subscription {
  listener: FeedListener;
}

export function createSubscriberRegistry(): SubscriberRegistry {
  const byUser = new Map<string, Set<Subscription>>();
  let size = 0;

  const notify = (subscription: Subscription, signal: FeedSignal) => {
    try {
      subscription.listener(signal);
    } catch (error) {
      // One subscriber's broken stream must not cost every other subscriber
      // the rest of the fan-out. Same failure policy as the emit side
      // (`notify.ts`): loud in the server log, invisible to the user.
      console.warn("[changes] a change-feed subscriber threw:", error);
    }
  };

  return {
    subscribe(userId, listener) {
      const subscription: Subscription = { listener };
      let bucket = byUser.get(userId);
      if (!bucket) {
        bucket = new Set<Subscription>();
        byUser.set(userId, bucket);
      }
      bucket.add(subscription);
      size += 1;

      let done = false;
      return () => {
        if (done) return;
        done = true;
        const current = byUser.get(userId);
        if (!current) return;
        if (current.delete(subscription)) size -= 1;
        // Drop the empty bucket too, or a process that has served a lot of
        // users keeps one `Set` per user forever.
        if (current.size === 0) byUser.delete(userId);
      };
    },

    deliver(event) {
      const bucket = byUser.get(event.authorId);
      if (!bucket) return 0;
      // Snapshot: a listener may unsubscribe (or subscribe) from inside its
      // own callback, and iterating the live Set would make what happens next
      // depend on insertion order.
      const targets = Array.from(bucket);
      for (const subscription of targets) {
        notify(subscription, { type: "change", event });
      }
      return targets.length;
    },

    broadcastResync() {
      let reached = 0;
      for (const bucket of Array.from(byUser.values())) {
        for (const subscription of Array.from(bucket)) {
          notify(subscription, { type: "resync" });
          reached += 1;
        }
      }
      return reached;
    },

    get size() {
      return size;
    },
  };
}

/** First retry, in ms. Short enough that an HMR restart is invisible. */
export const RECONNECT_BASE_MS = 500;

/**
 * The ceiling, in ms. A Postgres that is down for an hour must not become an
 * hour of reconnect attempts, and a listener that has been asleep for a long
 * outage should still come back inside half a minute of Postgres returning.
 */
export const RECONNECT_MAX_MS = 30_000;

/**
 * How long to wait before reconnect attempt number `attempt` (0-based).
 *
 * Capped exponential, then *equal jitter* — the delay lands somewhere in
 * `[ceiling/2, ceiling]`. The jitter is not decoration: §6 notes that several
 * Next instances may each hold their own `LISTEN`, and a Postgres restart drops
 * all of them at the same instant. Without jitter they would retry in lockstep
 * forever, hammering a database that is still coming up.
 *
 * `random` is injectable only so the schedule is assertable — production always
 * passes `Math.random`.
 */
export function reconnectDelayMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const n = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  // Clamped before the shift, or `2 ** 1024` is `Infinity` and the arithmetic
  // below stops being arithmetic. Anything past the cap is the cap anyway.
  const ceiling = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * 2 ** Math.min(n, 20),
  );
  const fraction = clampUnit(random());
  return Math.round(ceiling / 2 + (ceiling / 2) * fraction);
}

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};
