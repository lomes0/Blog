import "server-only";
import { Client, type Notification } from "pg";
import { CHANGE_CHANNEL, decodeChangeEvent } from "./events";
import {
  createSubscriberRegistry,
  type FeedListener,
  reconnectDelayMs,
  type SubscriberRegistry,
  type Unsubscribe,
} from "./emitter";

/**
 * Hop 2 of the change feed: one `LISTEN` per Next process —
 * docs/plans/archive/changes-detection.md §2.2, §5, §6.
 *
 * Phase 3's SSE route is the only intended caller, and the only thing it may
 * do is {@link subscribeToChanges}. Everything that can be decided without a
 * database — the fan-out filter and the reconnect schedule — lives in
 * `emitter.ts` so vitest can exercise it; this module is the part that needs a
 * socket, and it is verified by hand against the local Postgres (§8).
 *
 * `import "server-only"` because a `pg` `Client` must never be reachable from
 * a browser bundle. Note that `events.ts` deliberately does *not* import it —
 * Phase 3's client decodes the same payloads.
 *
 * ## The three constraints §2.2 says bite silently
 *
 * **`Client`, not `Pool`.** `LISTEN` binds to a session. A pooled connection is
 * handed back to the pool after the statement and the notifications simply stop
 * arriving — no error, no event, nothing to notice.
 *
 * **It survives HMR.** Same reasoning as `src/lib/prisma.ts`, and the same
 * `global` stash: without it, every dev recompile opens a listener connection
 * that nothing ever closes, and an afternoon of editing exhausts
 * `max_connections`. One difference from `prisma.ts`, deliberate: the stash is
 * written in production too, rather than only outside it. Prisma can afford the
 * `NODE_ENV` guard because a second client is merely wasteful; a second
 * *listener* would double-deliver every event to whichever subscribers landed
 * on it, so "exactly one per process" is a correctness property here and worth
 * holding even in the bundling arrangements where a module can be instantiated
 * more than once.
 *
 * **It starts lazily.** Connecting at module load would make `next build` try
 * to reach Postgres — the build imports route modules to collect their
 * metadata. The connection opens on the first subscriber instead.
 *
 * ## Lifecycle: lazy start, then stay warm (§9 question 2)
 *
 * The plan left this open, weighing "stopping on the last unsubscribe is
 * tidier" against "keeping it warm avoids a reconnect storm when the last tab
 * closes and reopens", and guessed warm for a container, lazy for dev.
 *
 * Decided: **lazy start, no stop.** It satisfies both halves of what the plan
 * was actually weighing. The thing lazy-start buys is that no connection exists
 * at build time or in a process nobody is using — and a process that has never
 * had a subscriber never connects either way, so stopping on the last
 * unsubscribe adds nothing to that. What stopping *does* add is a
 * connect/`LISTEN`/`resync` cycle every time a user closes their last tab and
 * opens a new one, which in a dev loop is constant and in production is a
 * needless catch-up query per reconnect. One idle connection per instance is
 * cheap; a reconnect storm is not. The same choice in both environments also
 * means the dev loop exercises the production path.
 *
 * ## Which connection string (§6)
 *
 * `LISTEN` does not survive a transaction-mode connection pooler — PgBouncer in
 * `transaction` mode, Supabase's `:6543`, Neon's pooled endpoint. They break it
 * *silently*: the connection succeeds, the `LISTEN` succeeds, and no
 * notification ever arrives. There is no error to log and nothing in this file
 * can detect it.
 *
 * Because the failure is silent, the connection string is overridable:
 * `CHANGES_DATABASE_URL` wins over `DATABASE_URL`. Today they are the same
 * string and the fallback is what runs — the target deployment is a container
 * with a direct connection (docs/plans/production-deployment.md), so there is
 * nothing to configure yet. The override exists so that the day the app is put
 * behind a pooler, the fix is one env var and not a code change under
 * incident pressure. That is the whole of it; there is no pooler detection and
 * no health check, because §3's catch-up already makes a dead feed degrade to
 * the Phase 0 poll rather than to broken.
 */

interface ChangeListenerState {
  registry: SubscriberRegistry;
  client: Client | null;
  /**
   * Identifies the current connection attempt. Every handler captures the
   * generation it was registered under and ignores anything stale — a dropped
   * connection commonly emits both `error` and `end`, and without this each
   * would schedule its own reconnect and the backoff would halve on every
   * outage.
   */
  generation: number;
  /** Consecutive failed attempts, for {@link reconnectDelayMs}. */
  attempt: number;
  connecting: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

declare global {
  var __changeListener: ChangeListenerState | undefined;
}

const getState = (): ChangeListenerState => {
  const existing = global.__changeListener;
  if (existing) return existing;
  const state: ChangeListenerState = {
    registry: createSubscriberRegistry(),
    client: null,
    generation: 0,
    attempt: 0,
    connecting: false,
    timer: null,
  };
  global.__changeListener = state;
  return state;
};

/**
 * Subscribe to the change events of exactly one user, starting the process's
 * `LISTEN` connection if this is the first subscriber.
 *
 * There is no way to subscribe to *everything*: the id is a parameter of the
 * subscription rather than a filter applied afterwards, so §2.3's "single most
 * important line" cannot be forgotten by a caller — see `emitter.ts`.
 *
 * Call the returned function on `request.signal` abort (§5's subscriber-leak
 * row). Never throws, and never rejects: a listener that cannot connect leaves
 * the subscription registered and silent, which degrades to the Phase 0 poll
 * rather than to a failed request.
 */
export function subscribeToChanges(
  userId: string,
  listener: FeedListener,
): Unsubscribe {
  const state = getState();
  const unsubscribe = state.registry.subscribe(userId, listener);
  ensureConnected(state);
  return unsubscribe;
}

const ensureConnected = (state: ChangeListenerState) => {
  if (state.client || state.connecting || state.timer) return;
  void connect(state);
};

const connectionString = (): string | undefined =>
  process.env.CHANGES_DATABASE_URL || process.env.DATABASE_URL || undefined;

async function connect(state: ChangeListenerState): Promise<void> {
  const url = connectionString();
  if (!url) {
    // No retry loop for this one: a missing env var will not fix itself, and
    // an unconfigured process should not spend the rest of its life dialing.
    console.error(
      "[changes] no CHANGES_DATABASE_URL or DATABASE_URL; the change feed " +
        "will stay silent and clients fall back to the focus poll",
    );
    return;
  }

  const generation = state.generation;
  state.connecting = true;

  const client = new Client({
    connectionString: url,
    // Surfaces this connection as its own row in `pg_stat_activity`, which is
    // how you tell a leaked HMR listener from the app's Prisma pool.
    application_name: "blog-changes-listener",
    // A laptop sleep or a silently dropped NAT mapping leaves a socket that is
    // open as far as this process knows and dead as far as Postgres does.
    // Keepalives turn that into an `error` event, which is a reconnect.
    keepAlive: true,
  });

  const drop = (reason: string, error?: unknown) =>
    handleDrop(state, generation, client, reason, error);

  // §2.2 is explicit that `error` and `end` are the same event for our
  // purposes: either way we may have missed notifications, and the recovery is
  // identical — reconnect and resync.
  client.on("error", (error: Error) => drop("connection error", error));
  client.on("end", () => drop("connection closed"));
  client.on(
    "notification",
    (message: Notification) => handleNotification(state, message),
  );

  try {
    await client.connect();
    // The channel is a compile-time constant, not input — but `LISTEN` takes an
    // identifier, which cannot be a bind parameter, so assert the shape rather
    // than interpolate on trust.
    if (!/^[a-z_][a-z0-9_]*$/.test(CHANGE_CHANNEL)) {
      throw new Error(`Refusing to LISTEN on ${CHANGE_CHANNEL}`);
    }
    await client.query(`LISTEN "${CHANGE_CHANNEL}"`);
  } catch (error) {
    drop("failed to connect", error);
    return;
  }

  if (generation !== state.generation) {
    // The connection dropped while we were still setting it up. `drop` has
    // already scheduled the retry; this socket is nobody's.
    client.removeAllListeners();
    void client.end().catch(() => {});
    return;
  }

  state.client = client;
  state.connecting = false;
  state.attempt = 0;

  // §2.2, §3. Every (re)connect resyncs, the first one included — that is not
  // a wart. Notifications sent while nothing was listening are gone: `NOTIFY`
  // has no durability, no queue and no replay. A subscriber that has just
  // arrived is in exactly the same position as one that has just been
  // reconnected — neither can be told what it missed — so both get the same
  // answer: re-run the catch-up.
  const reached = state.registry.broadcastResync();
  console.warn(
    `[changes] listening on ${CHANGE_CHANNEL}; resynced ${reached} subscriber(s)`,
  );
}

function handleDrop(
  state: ChangeListenerState,
  generation: number,
  client: Client,
  reason: string,
  error?: unknown,
): void {
  if (generation !== state.generation) return;
  // Invalidates every remaining handler of this connection, so the `error`
  // that follows an `end` (or vice versa) is a no-op instead of a second
  // reconnect.
  state.generation += 1;
  state.client = null;
  state.connecting = false;

  console.warn(`[changes] listener ${reason}:`, error ?? "");

  client.removeAllListeners();
  // `end()` on an already-dead socket rejects; there is nothing to do about it
  // and an unhandled rejection would take the process down.
  void client.end().catch(() => {});

  scheduleReconnect(state);
}

function scheduleReconnect(state: ChangeListenerState): void {
  if (state.timer) return;
  const delay = reconnectDelayMs(state.attempt);
  state.attempt += 1;
  const timer = setTimeout(() => {
    state.timer = null;
    void connect(state);
  }, delay);
  // Node's timer handle, not the DOM's number. A retry loop against a Postgres
  // that is down must not be the reason a process refuses to exit.
  (timer as { unref?: () => void }).unref?.();
  state.timer = timer;
}

function handleNotification(
  state: ChangeListenerState,
  message: Notification,
): void {
  // This runs inside an `EventEmitter` dispatch: anything thrown here is an
  // uncaught exception, which in Node means the process. A payload arriving
  // from outside — an older deployment, a hand-run `psql`, a future event kind
  // — must cost that message and nothing else.
  try {
    if (message.channel !== CHANGE_CHANNEL) return;
    if (!message.payload) return;
    const event = decodeChangeEvent(message.payload);
    if (!event) {
      console.warn(
        `[changes] dropped an unreadable notification: ${
          message.payload.slice(0, 200)
        }`,
      );
      return;
    }
    state.registry.deliver(event);
  } catch (error) {
    console.warn("[changes] failed to handle a notification:", error);
  }
}
