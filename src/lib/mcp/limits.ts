/**
 * What one agent token may spend at `/api/mcp` (docs/plans/archive/mcp-support.md
 * phase 4, and §8.3 which asked for these numbers).
 *
 * ## Where the numbers come from
 *
 * Measured shape, not measured load — there is no production traffic to sample
 * yet, so these are first estimates chosen to be invisible to real use and
 * obvious to a runaway loop. The two sessions there are to look at:
 *
 *   - `npm run mcp:smoke` is ~12 calls end to end (initialize, tools/list, a
 *     listing, an outline, a targeted read, a search, a create and three edits).
 *   - Editing one document is ~5 calls: `outline`, one or two `read_blocks`,
 *     one or two `apply_ops`.
 *
 * So an agent working hard through ten documents is on the order of 50 calls
 * spread over minutes. The read budget is more than twice that per minute and
 * the write budget an order of magnitude above what an interactive session
 * produces, while a `while (true)` around `apply_ops` hits the wall in a second.
 *
 * **Revise these from a real transcript**, not from taste, once there is one.
 * If a legitimate session ever trips a limit, that is the bug — not the session.
 */
import { createTokenBucketLimiter } from "@/lib/rateLimit";

/**
 * Reads: listing, outline, read_blocks, read_post, search.
 *
 * Capacity well above the rate so an agent's opening volley — an outline and
 * half a dozen block reads, fired at once — is never the thing that trips it.
 */
export const readLimiter = createTokenBucketLimiter({
  capacity: 60,
  refillPerMinute: 120,
});

/**
 * Writes: apply_ops and create_post.
 *
 * Tighter, because these are the calls that cost storage and put rows in front
 * of a human to review. A stuck agent proposing in a loop fills the review rail
 * with work someone has to reject by hand, which is a worse failure than a
 * slow read.
 */
export const writeLimiter = createTokenBucketLimiter({
  capacity: 10,
  refillPerMinute: 20,
});

/**
 * Every HTTP request, including the ones that never reach a tool.
 *
 * The tool limiters cannot see an `initialize` flood or a stream of malformed
 * JSON-RPC, because those are refused before any tool runs. Set above the sum
 * of the other two so it bounds abuse without ever being the limit a working
 * agent meets first.
 */
export const requestLimiter = createTokenBucketLimiter({
  capacity: 90,
  refillPerMinute: 180,
});

/**
 * Largest request body accepted, in bytes.
 *
 * `create_post` takes an entire document as blocks and had no ceiling at all.
 * `next.config.ts` caps server *actions* at 2 MB, which does not cover route
 * handlers — this is the route's own. A long article in blocks is on the order
 * of 100 KB, so 1 MiB is generous by an order of magnitude while still refusing
 * something sent to exhaust memory.
 */
export const MAX_BODY_BYTES = 1024 * 1024;
