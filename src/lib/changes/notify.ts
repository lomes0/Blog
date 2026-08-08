import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CHANGE_CHANNEL,
  type ChangeEvent,
  encodeChangeEvent,
} from "./events";

/**
 * Hop 1 of the change feed: `NOTIFY` at the write —
 * docs/plans/changes_detection.md §2.1.
 *
 * ## Why these calls live in the repositories
 *
 * §9 question 3 asks Prisma client extension or hand-placed calls, and §2.1
 * recommends hand-placing "in the app's write routes". Hand-placed, yes — but
 * one layer lower than the plan frames it, in `src/repositories/*`, for a
 * reason the plan did not have in view:
 *
 * - Every app write already funnels through a repository function; no route
 *   handler under `src/app/api/**` touches Prisma directly.
 * - `mcp/content-server.ts` imports the *same* `@/lib/prisma` singleton and
 *   calls the same repository functions (`upsertProposal` via
 *   `proposeRevision`, `rankForAppend`).
 *
 * So a notify in the repository covers the app and the out-of-band MCP writer
 * at once — which is the whole point of the feature, since §1.1's problem is
 * precisely that the MCP server writes with no Next request scope in sight. It
 * also needs far fewer call sites than the "dozen" §2.1 worried about. A client
 * extension was rejected on §2.1's own grounds: it would fire inside every
 * transaction including ones nobody thought about, and it cannot see which of
 * the five event kinds a given statement means.
 *
 * The one write that does *not* go through a repository is MCP `create_post`,
 * which builds its own `prisma.$transaction([…])`. That one is hand-placed in
 * `mcp/content-server.ts`.
 *
 * ## `$executeRaw`, not `$queryRaw` — checked, not assumed
 *
 * `NOTIFY` proper takes no bind parameters, so the payload has to go through
 * the `pg_notify(text, text)` *function*, which does — hence a `SELECT`. The
 * obvious inference from that is `$queryRaw`, and it is wrong: `pg_notify`
 * returns `void`, and Prisma cannot deserialize a `void` column, so
 * `$queryRaw` fails with P2010 "Failed to deserialize column of type 'void'"
 * *after* the statement has already run. `$executeRaw` never looks at the
 * result set — it reports a row count (1) — so it is the method that works.
 * Both were run against the local Postgres to settle it. (`SELECT
 * pg_notify(…)::text` would make `$queryRaw` work too; there is no reason to
 * pay for a result set nobody reads.)
 *
 * ## Failure policy: a notification may be lost, a write may not
 *
 * §3 exists because missed events are survivable — the catch-up query repairs
 * them on the next reconnect — while a rolled-back save is not. So nothing here
 * throws:
 *
 * - The payload is built and size-checked **before** any statement is issued
 *   ({@link encodeChangeEvent}). If it cannot be built, no statement is issued
 *   at all. This is the part that actually protects the write, and it is why
 *   the encoder whitelists ids: the payload is bounded by construction, three
 *   orders of magnitude under the 8000-byte cap.
 * - Statement errors are caught and logged (`console.warn`, never `console.log`
 *   — see the repo's ESLint rules) so a feed problem is loud in the server log
 *   and invisible to the user.
 *
 * The honest caveat, stated because it is easy to believe otherwise: catching
 * *inside* a transaction does not rescue the write. Postgres marks the whole
 * transaction failed on any statement error, so the caller's next statement
 * fails whatever we do with the exception. The catch is there so the failure is
 * reported as a feed failure; the thing that makes an in-transaction notify
 * safe is that the payload cannot be malformed or oversized, not the catch.
 */

/**
 * Anything that can run the statement: the `prisma` singleton, or an
 * interactive-transaction client (`PrismaClient` is structurally assignable to
 * `TransactionClient`, so one signature serves both call shapes).
 */
type NotifyClient = Pick<Prisma.TransactionClient, "$executeRaw">;

/**
 * Emit one change event.
 *
 * Pass the transaction client when one is in scope — `NOTIFY` is transactional,
 * so Postgres delivers at `COMMIT` and discards on `ROLLBACK`, which is exactly
 * the semantics wanted: an approval that refuses, or a delete that fails, must
 * not announce. Pass the `prisma` singleton when the write has already
 * committed and the ids only became knowable from what it returned; the cost of
 * that is a process crash in the window between commit and notify losing one
 * event, which §3 repairs.
 *
 * Never throws.
 */
export async function notifyChange(
  db: NotifyClient,
  event: ChangeEvent,
): Promise<void> {
  const payload = buildPayload(event);
  if (payload === null) return;
  try {
    await db.$executeRaw`SELECT pg_notify(${CHANGE_CHANNEL}, ${payload})`;
  } catch (error) {
    warn(event, error);
  }
}

/**
 * The same statement as an unawaited `PrismaPromise`, for the array form of
 * `prisma.$transaction([…])`.
 *
 * The array form takes statements rather than awaited results, so
 * {@link notifyChange} cannot be used inside one. Returns `null` when the
 * payload could not be built, so the caller spreads nothing and its write goes
 * ahead unchanged.
 */
export function changeNotification(
  event: ChangeEvent,
): Prisma.PrismaPromise<unknown> | null {
  const payload = buildPayload(event);
  if (payload === null) return null;
  return prisma.$executeRaw`SELECT pg_notify(${CHANGE_CHANNEL}, ${payload})`;
}

const buildPayload = (event: ChangeEvent): string | null => {
  try {
    return encodeChangeEvent(event);
  } catch (error) {
    warn(event, error);
    return null;
  }
};

const warn = (event: ChangeEvent, error: unknown) => {
  console.warn(
    `[changes] dropped a ${event.kind} notification for ${event.id}:`,
    error,
  );
};
