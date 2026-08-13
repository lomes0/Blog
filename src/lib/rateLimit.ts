/**
 * Rate limiting — the first in this codebase. See docs/plans/archive/mcp-support.md
 * phase 4.
 *
 * Written for `/api/mcp`, which is the app's first surface where a static
 * credential can drive writes: unlike a session, a token does not expire when a
 * browser closes, and unlike the stdio server, the caller is not already inside
 * the machine. It is deliberately generic, because the July production audit
 * lists "no rate limiting anywhere" as the biggest concrete money risk and
 * `/api/completion` and `/api/copilot` are the next users.
 *
 * ## What this implementation is not
 *
 * **The state is in this process.** Two containers serving the same token get a
 * budget each, so the effective limit is per-instance times instances. That is
 * honest for a single-container deployment (which is what
 * docs/plans/production-deployment.md chose) and wrong the moment the app is
 * scaled out. `RateLimiter` is an interface for exactly that reason: a
 * Postgres- or Redis-backed implementation drops in behind it without any
 * caller changing. Do not scale the app out and assume this still holds.
 *
 * **It is not a security boundary.** It bounds cost and accidental loops. An
 * attacker with a valid token and patience is bounded by it; an attacker
 * without one never reaches it, because authentication runs first.
 */

export interface RateDecision {
  allowed: boolean;
  /** Whole seconds a refused caller should wait — the `Retry-After` value. */
  retryAfterSeconds: number;
  /** Budget left after this call, floored. For `X-RateLimit-Remaining`. */
  remaining: number;
}

export interface RateLimiter {
  /** Spend one unit of `key`'s budget, and say whether it was there to spend. */
  take(key: string, now?: number): RateDecision;
}

export interface TokenBucketOptions {
  /**
   * Burst: how many calls can land at once after an idle period. A limiter
   * whose capacity equals its per-minute rate refuses an agent that fires a
   * legitimate opening volley — an outline plus six reads — so capacity is
   * meant to exceed the working set of one interaction.
   */
  capacity: number;
  /** Sustained rate. The bucket refills continuously, not on a boundary. */
  refillPerMinute: number;
  /**
   * Drop a key's bucket once it has been full and untouched this long. Without
   * it the map grows by one entry per token seen and never shrinks — slow, but
   * a leak in a process meant to run for months.
   */
  idleEvictionMs?: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * A token bucket, not a fixed window.
 *
 * A fixed window lets a caller spend a full budget at 0:59 and another at 1:00,
 * so the real burst is twice the configured limit at every boundary. Continuous
 * refill has no boundary to exploit, and it costs one subtraction.
 */
export function createTokenBucketLimiter(
  { capacity, refillPerMinute, idleEvictionMs = 10 * 60_000 }: TokenBucketOptions,
): RateLimiter {
  if (capacity <= 0 || refillPerMinute <= 0) {
    throw new Error("A rate limiter needs a positive capacity and refill rate.");
  }
  const refillPerMs = refillPerMinute / 60_000;
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;

  /** Drop full, untouched buckets. Amortised: at most once per eviction window. */
  const sweep = (now: number) => {
    if (now - lastSweep < idleEvictionMs) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      if (bucket.tokens >= capacity && now - bucket.updatedAt >= idleEvictionMs) {
        buckets.delete(key);
      }
    }
  };

  return {
    take(key, now = Date.now()) {
      sweep(now);

      const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
      // Refill for the elapsed time, capped. `max(0, …)` guards a clock that
      // went backwards: it costs the caller nothing and prevents a negative
      // refill silently draining the bucket.
      const elapsed = Math.max(0, now - bucket.updatedAt);
      const tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);

      if (tokens < 1) {
        // Report the wait for one whole token, rounded up: rounding down would
        // invite a client to retry a moment early and be refused again.
        const waitMs = (1 - tokens) / refillPerMs;
        buckets.set(key, { tokens, updatedAt: now });
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
          remaining: 0,
        };
      }

      buckets.set(key, { tokens: tokens - 1, updatedAt: now });
      return {
        allowed: true,
        retryAfterSeconds: 0,
        remaining: Math.floor(tokens - 1),
      };
    },
  };
}
