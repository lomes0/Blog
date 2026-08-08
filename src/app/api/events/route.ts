import { userRoute } from "@/lib/api-utils";
import { subscribeToChanges } from "@/lib/changes/listener";
import type { FeedSignal, Unsubscribe } from "@/lib/changes/emitter";
import { encodeChangeEvent } from "@/lib/changes/events";

/**
 * Hop 3 of the change feed: the SSE stream —
 * docs/plans/changes_detection.md §2.3, §5.
 *
 * One long-lived `GET` per browser tab. The server writes ids, never content
 * (§10); the client turns them into fetches through the ordinary authorized
 * routes, and re-runs §3's catch-up whenever it (re)connects.
 *
 * **`userRoute`, and that is the authorization boundary.** The session user's
 * id is what the subscription is *for* — not a filter applied to a stream of
 * everything — so there is nothing here that could be forgotten. `emitter.ts`
 * keys its registry by author and exposes no unfiltered stream, which is what
 * makes §2.3's "single most important line" unwritable-wrong rather than
 * merely written correctly. Using the wrapper is also what keeps `grep -rn
 * "publicRoute" src/app/api` the complete list of unauthenticated surfaces
 * (CLAUDE.md).
 *
 * ## The wrapper and the stream (§9 question 1)
 *
 * The plan left open whether `userRoute` buffers a streaming `Response`. It
 * does not: `route()` in `lib/api-utils.ts` ends in `return await
 * handler(request, context)` — no re-wrapping, no `.text()`, no
 * `NextResponse.json` on the way out — so the `Response` this returns is the
 * one Next serves. No pass-through case is needed.
 *
 * One consequence to be aware of, because it is easy to assume otherwise: that
 * wrapper's `try/catch` covers the *invocation* of this handler, and the
 * handler returns as soon as the `Response` object exists. Anything thrown
 * afterwards — from a `notify`, a heartbeat tick, an `enqueue` into a
 * controller whose socket has gone — happens long after `logAndWrap` is out of
 * scope and would be an unhandled rejection rather than a 500. So the stream
 * handles its own errors: every write is guarded, and every failure path ends
 * in the same teardown.
 *
 * ## Why the headers are all four
 *
 * `text/event-stream` is what makes `EventSource` accept it. `no-cache,
 * no-transform` keeps a cache from serving a stale prefix and a "helpful"
 * proxy from re-encoding it. `keep-alive` is the connection this depends on
 * existing. `X-Accel-Buffering: no` is the one that is invisible until it
 * bites: nginx (and Fly's proxy, and every ingress modelled on it) buffers a
 * response body by default, so without it the stream is §5's "proxy buffers
 * the stream: no events, no error" row — the connection opens, the browser
 * fires `open`, and nothing ever arrives.
 *
 * ## No `id:` fields
 *
 * §2.3: the browser replays `Last-Event-ID` to *this* endpoint on reconnect,
 * not to the catch-up fetch, and the catch-up takes no cursor anyway (§3 hands
 * back the full set precisely so it needs no watermark). There is no starting
 * point to seed, so a watermark here would be a field nobody reads.
 *
 * ## Documents only (§9 question 4)
 *
 * Decided: documents and their proposals, not series or projects. Documents
 * are the whole of the reported problem (§1.1 — an agent `create_post` or
 * `apply_ops` that the sidebar never notices); series and project changes are
 * rare, human-initiated and already covered by the focus poll. Nothing in this
 * route enumerates kinds, so extending the feed later is a Phase 1 emit site
 * and a client branch, not a change here.
 */

export const dynamic = "force-dynamic";
/**
 * Never edge. `listener.ts` imports `pg` (a TCP socket and Node streams) and
 * `server-only`, neither of which exists in the edge runtime — and the whole
 * design rests on one long-lived `LISTEN` connection per *process*, which a
 * per-request isolate could not hold. Stated rather than left to the default
 * for the same reason `api/health` states it.
 */
export const runtime = "nodejs";

/**
 * Heartbeat period, in ms.
 *
 * A `:ping` comment is ignored by `EventSource` (comments are not events) and
 * exists purely as bytes on the wire: idle proxies and load balancers close a
 * connection that has been silent for a minute, and the feed can legitimately
 * be silent for hours. 25s sits under the common 30–60s idle timeouts with
 * room for a slow hop.
 */
const HEARTBEAT_MS = 25_000;

const encoder = new TextEncoder();

/**
 * One SSE frame.
 *
 * `data` is a single line by construction — `encodeChangeEvent` produces JSON,
 * which escapes newlines inside strings — so no multi-line `data:` handling is
 * needed. The trailing blank line is what ends the frame.
 */
const frame = (event: string, data: string) =>
  `event: ${event}\ndata: ${data}\n\n`;

export const GET = userRoute(
  async (request, { user }) => {
    let unsubscribe: Unsubscribe | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let onAbort: (() => void) | null = null;
    let teardown: () => void = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        teardown = () => {
          if (closed) return;
          closed = true;
          // Order matters only in that all three must happen even if one of
          // them throws; each is idempotent on its own.
          unsubscribe?.();
          unsubscribe = null;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          if (onAbort) request.signal.removeEventListener("abort", onAbort);
          onAbort = null;
          try {
            controller.close();
          } catch {
            // Already closed or errored by the platform — nothing to do, and
            // certainly nothing to report to a client that has gone.
          }
        };

        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // The socket went away between the last check and this write. Not
            // an error condition: a closed tab is the ordinary end of a feed.
            teardown();
          }
        };

        // A comment, immediately. It costs nothing, and it pushes the response
        // head plus a first byte through any intermediary that only flushes on
        // body data.
        write(": connected\n\n");

        // The per-user filter is *structural*: `subscribeToChanges` takes the
        // id the subscription is for, `emitter.ts` stores events bucketed by
        // `authorId`, and there is no API that yields an unfiltered stream. So
        // there is no second check here, deliberately — one would imply the
        // emitter cannot be trusted, and would be a place for the two rules to
        // drift apart.
        unsubscribe = subscribeToChanges(user.id, (signal: FeedSignal) => {
          if (signal.type === "resync") {
            // Named its own event so the client can tell "something changed"
            // from "I can no longer promise nothing did". The payload is empty
            // because it carries no information: the answer is always to re-run
            // the catch-up (§3).
            write(frame("resync", "{}"));
            return;
          }
          try {
            // Re-encoded through the same whitelist the channel uses rather
            // than `JSON.stringify(event)`, so "ids, never content" (§10) holds
            // on this hop for the same reason it holds on the last one.
            write(frame("change", encodeChangeEvent(signal.event)));
          } catch (error) {
            // A payload that cannot be re-encoded is one event lost, and §3
            // repairs it on the next reconnect. It must not take the stream
            // down with it.
            console.warn("[changes] dropped an outbound event:", error);
          }
        });

        heartbeat = setInterval(() => write(":ping\n\n"), HEARTBEAT_MS);
        // A request that never ends must not be the reason the process refuses
        // to exit; the same treatment `listener.ts` gives its reconnect timer.
        (heartbeat as { unref?: () => void }).unref?.();

        // Fires when the tab closes, the client aborts, or Next tears the
        // request down. Without unsubscribing here the emitter accumulates
        // dead subscribers and the interval keeps writing into a closed
        // controller forever — both halves of §5's "subscriber leak" row.
        onAbort = () => teardown();
        if (request.signal.aborted) teardown();
        else request.signal.addEventListener("abort", onAbort);
      },

      // The other end of the same story: the consumer stopped reading.
      cancel() {
        teardown();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  },
  { errorLabel: "Error opening the change stream" },
);
