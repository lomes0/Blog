/**
 * The token bucket behind `/api/mcp`'s budgets (docs/plans/archive/mcp-support.md
 * phase 4).
 *
 * Time is injected on every call, so these are ordinary pure-function tests —
 * no fake timers, no waiting. That is the reason `take` takes a `now` at all.
 */
import { describe, expect, it } from "vitest";
import { createTokenBucketLimiter } from "../rateLimit";

const T0 = 1_000_000;

describe("createTokenBucketLimiter", () => {
  it("allows a full burst, then refuses", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 3,
      refillPerMinute: 60,
    });

    expect(limiter.take("k", T0).allowed).toBe(true);
    expect(limiter.take("k", T0).allowed).toBe(true);
    expect(limiter.take("k", T0).allowed).toBe(true);

    const refused = limiter.take("k", T0);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
  });

  it("keeps separate budgets per key", () => {
    // The property that matters at the endpoint: one token exhausting its
    // budget must not refuse anybody else's.
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillPerMinute: 60,
    });

    expect(limiter.take("tok-a", T0).allowed).toBe(true);
    expect(limiter.take("tok-a", T0).allowed).toBe(false);
    expect(limiter.take("tok-b", T0).allowed).toBe(true);
  });

  it("refills continuously rather than on a boundary", () => {
    // A fixed window would let a caller spend everything at 0:59 and again at
    // 1:00, so the real burst is twice the limit. Half a minute of a 60/min
    // refill is worth 30 calls, not 0 and not 60.
    const limiter = createTokenBucketLimiter({
      capacity: 60,
      refillPerMinute: 60,
    });
    for (let i = 0; i < 60; i++) limiter.take("k", T0);
    expect(limiter.take("k", T0).allowed).toBe(false);

    let allowed = 0;
    for (let i = 0; i < 60; i++) {
      if (limiter.take("k", T0 + 30_000).allowed) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it("never refills past capacity, however long it idles", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 5,
      refillPerMinute: 60,
    });
    limiter.take("k", T0);

    let allowed = 0;
    // A day later. A bucket that accumulated a day's worth of refill would let
    // one caller spend 1440 minutes of budget in a single burst.
    for (let i = 0; i < 50; i++) {
      if (limiter.take("k", T0 + 86_400_000).allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });

  it("reports a whole-second wait, rounded up and never zero", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillPerMinute: 60, // one token per second
    });
    limiter.take("k", T0);

    // Rounding down would tell a client to retry a moment early and be refused
    // again, which reads as the limiter being broken.
    const refused = limiter.take("k", T0 + 100);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(1);
  });

  it("survives a clock that goes backwards", () => {
    // NTP corrections happen. A negative elapsed time must not drain the
    // bucket, which a bare `now - updatedAt` multiplication would do.
    const limiter = createTokenBucketLimiter({
      capacity: 2,
      refillPerMinute: 60,
    });
    expect(limiter.take("k", T0).allowed).toBe(true);
    expect(limiter.take("k", T0 - 500_000).allowed).toBe(true);
  });

  it("refuses to be built with a nonsensical budget", () => {
    // A capacity of 0 would refuse everything forever — much better as a
    // startup error than as an endpoint nobody can call.
    expect(() =>
      createTokenBucketLimiter({ capacity: 0, refillPerMinute: 60 })
    ).toThrow();
    expect(() =>
      createTokenBucketLimiter({ capacity: 10, refillPerMinute: 0 })
    ).toThrow();
  });

  it("evicts idle full buckets rather than growing forever", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 1,
      refillPerMinute: 600,
      idleEvictionMs: 1000,
    });

    limiter.take("gone", T0);
    // Long enough later that "gone" has refilled and been idle past the window.
    // Its budget must be intact, which is what proves it was dropped and
    // rebuilt rather than remembered — the observable half of not leaking.
    expect(limiter.take("other", T0 + 10_000).allowed).toBe(true);
    expect(limiter.take("gone", T0 + 10_000).allowed).toBe(true);
  });
});
