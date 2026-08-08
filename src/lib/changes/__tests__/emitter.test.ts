import {
  createSubscriberRegistry,
  type FeedSignal,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  reconnectDelayMs,
} from "@/lib/changes/emitter";
import type { ChangeEvent } from "@/lib/changes/events";

/**
 * The fan-out filter and the reconnect schedule —
 * docs/plans/changes_detection.md §2.2, §2.3, §5, §8.
 *
 * `pg` delivery and reconnect are not testable here and are verified by hand
 * against the local Postgres. What *is* testable is the half that decides who
 * sees an event, and §2.3 calls that "the single most important line in the
 * feature — get it wrong and the change feed becomes a cross-tenant id leak".
 * So the leak is asserted from both ends: that the right subscriber is reached,
 * and that no other subscriber is.
 */

const change = (id: string, authorId: string): ChangeEvent => ({
  kind: "document.updated",
  id,
  authorId,
  origin: "claude-code",
});

/** A listener plus the signals it has seen, since that is the whole assertion. */
const recorder = () => {
  const seen: FeedSignal[] = [];
  return { seen, listener: (signal: FeedSignal) => void seen.push(signal) };
};

describe("createSubscriberRegistry", () => {
  it("delivers an event to the author's own subscriber", () => {
    const registry = createSubscriberRegistry();
    const alice = recorder();
    registry.subscribe("alice", alice.listener);

    expect(registry.deliver(change("doc-1", "alice"))).toBe(1);
    expect(alice.seen).toEqual([
      { type: "change", event: change("doc-1", "alice") },
    ]);
  });

  it("never delivers another user's event — the cross-tenant leak (§2.3)", () => {
    const registry = createSubscriberRegistry();
    const alice = recorder();
    const bob = recorder();
    registry.subscribe("alice", alice.listener);
    registry.subscribe("bob", bob.listener);

    registry.deliver(change("bobs-doc", "bob"));

    expect(alice.seen).toEqual([]);
    expect(bob.seen).toHaveLength(1);
  });

  it("reaches every subscriber of the same user, and only them", () => {
    const registry = createSubscriberRegistry();
    const tabOne = recorder();
    const tabTwo = recorder();
    const other = recorder();
    registry.subscribe("alice", tabOne.listener);
    registry.subscribe("alice", tabTwo.listener);
    registry.subscribe("bob", other.listener);

    expect(registry.deliver(change("doc-1", "alice"))).toBe(2);
    expect(tabOne.seen).toHaveLength(1);
    expect(tabTwo.seen).toHaveLength(1);
    expect(other.seen).toEqual([]);
  });

  it("drops an event nobody is subscribed for", () => {
    const registry = createSubscriberRegistry();
    registry.subscribe("alice", recorder().listener);
    expect(registry.deliver(change("doc-1", "nobody"))).toBe(0);
  });

  it("resyncs every subscriber regardless of user", () => {
    const registry = createSubscriberRegistry();
    const alice = recorder();
    const bob = recorder();
    registry.subscribe("alice", alice.listener);
    registry.subscribe("bob", bob.listener);

    expect(registry.broadcastResync()).toBe(2);
    expect(alice.seen).toEqual([{ type: "resync" }]);
    expect(bob.seen).toEqual([{ type: "resync" }]);
  });

  it("stops delivering once unsubscribed, and forgets the user (§5)", () => {
    const registry = createSubscriberRegistry();
    const alice = recorder();
    const unsubscribe = registry.subscribe("alice", alice.listener);

    unsubscribe();

    expect(registry.size).toBe(0);
    expect(registry.deliver(change("doc-1", "alice"))).toBe(0);
    expect(registry.broadcastResync()).toBe(0);
    expect(alice.seen).toEqual([]);
  });

  it("unsubscribes idempotently, without disturbing the user's other tabs", () => {
    const registry = createSubscriberRegistry();
    const tabOne = recorder();
    const tabTwo = recorder();
    const unsubscribe = registry.subscribe("alice", tabOne.listener);
    registry.subscribe("alice", tabTwo.listener);

    unsubscribe();
    unsubscribe();
    unsubscribe();

    expect(registry.size).toBe(1);
    expect(registry.deliver(change("doc-1", "alice"))).toBe(1);
    expect(tabTwo.seen).toHaveLength(1);
  });

  it("keeps the same function subscribable twice, as two subscriptions", () => {
    // A `Set<FeedListener>` would collapse these into one, and the first
    // teardown would then silence a stream that is still open.
    const registry = createSubscriberRegistry();
    const shared = recorder();
    const first = registry.subscribe("alice", shared.listener);
    registry.subscribe("alice", shared.listener);

    expect(registry.size).toBe(2);
    first();
    expect(registry.deliver(change("doc-1", "alice"))).toBe(1);
    expect(shared.seen).toHaveLength(1);
  });

  it("carries on when one subscriber throws", () => {
    const registry = createSubscriberRegistry();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const healthy = recorder();
    registry.subscribe("alice", () => {
      throw new Error("stream already closed");
    });
    registry.subscribe("alice", healthy.listener);

    expect(() => registry.deliver(change("doc-1", "alice"))).not.toThrow();
    expect(healthy.seen).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("lets a subscriber unsubscribe from inside its own callback", () => {
    // The SSE route's abort handler can fire while a delivery is in flight.
    const registry = createSubscriberRegistry();
    const seen: FeedSignal[] = [];
    let unsubscribe: (() => void) | undefined;
    unsubscribe = registry.subscribe("alice", (signal) => {
      seen.push(signal);
      unsubscribe?.();
    });

    registry.deliver(change("doc-1", "alice"));
    registry.deliver(change("doc-2", "alice"));

    expect(seen).toHaveLength(1);
    expect(registry.size).toBe(0);
  });
});

describe("reconnectDelayMs", () => {
  const noJitter = () => 1; // the ceiling
  const fullJitter = () => 0; // half the ceiling

  it("starts at the base delay and doubles", () => {
    expect(reconnectDelayMs(0, noJitter)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelayMs(1, noJitter)).toBe(RECONNECT_BASE_MS * 2);
    expect(reconnectDelayMs(2, noJitter)).toBe(RECONNECT_BASE_MS * 4);
    expect(reconnectDelayMs(3, noJitter)).toBe(RECONNECT_BASE_MS * 8);
  });

  it("caps, so a long outage is not an ever-growing wait", () => {
    expect(reconnectDelayMs(20, noJitter)).toBe(RECONNECT_MAX_MS);
    expect(reconnectDelayMs(1000, noJitter)).toBe(RECONNECT_MAX_MS);
  });

  it("jitters between half the ceiling and the ceiling (§6, many instances)", () => {
    expect(reconnectDelayMs(2, fullJitter)).toBe((RECONNECT_BASE_MS * 4) / 2);
    expect(reconnectDelayMs(2, () => 0.5)).toBe(RECONNECT_BASE_MS * 3);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delay = reconnectDelayMs(attempt);
      expect(delay).toBeGreaterThanOrEqual(RECONNECT_BASE_MS / 2);
      expect(delay).toBeLessThanOrEqual(RECONNECT_MAX_MS);
    }
  });

  it("never returns something that is not a delay", () => {
    expect(reconnectDelayMs(-5, noJitter)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelayMs(Number.NaN, noJitter)).toBe(RECONNECT_BASE_MS);
    expect(reconnectDelayMs(1.7, noJitter)).toBe(RECONNECT_BASE_MS * 2);
    expect(reconnectDelayMs(0, () => Number.NaN)).toBe(RECONNECT_BASE_MS / 2);
  });
});
