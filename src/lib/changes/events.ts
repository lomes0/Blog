/**
 * The change feed's shared vocabulary — docs/plans/changes_detection.md §2.1.
 *
 * Import-free apart from its own types, and deliberately so: this module is the
 * one thing all four hops agree on. Phase 1's emitters (`notify.ts`, running in
 * the Next server *and* in the `mcp/` stdio process), Phase 2's `LISTEN`er and
 * Phase 3's browser client all import it, so it must not reach for `pg`,
 * Prisma or `server-only` — any of those would make it unusable at one end or
 * the other.
 *
 * ## Payload rules (§2.1, §10)
 *
 * - **Ids, never content.** The `NOTIFY` payload cap is 8000 bytes; a document
 *   state would blow it, and the client has to fetch through the authorized
 *   route anyway. {@link encodeChangeEvent} enforces this by *whitelisting*
 *   fields rather than serializing whatever it was handed, so "no content in
 *   the payload" is a property of the code and not a rule someone has to
 *   remember at each call site.
 * - **Every payload carries `authorId`.** Phase 2's fan-out filters on it, per
 *   subscriber, with no database round trip per event. It is the single line
 *   that keeps the feed from being a cross-tenant id leak, which is why it is
 *   required on every variant rather than optional on some.
 * - **Every payload carries `origin`.** The client has to tell an agent write
 *   (surface a marker) from its own (do not re-announce itself) — see
 *   {@link APP_ORIGIN}.
 *
 * ## What `id` means
 *
 * `id` is always **the document the subscriber acts on**, on every variant.
 * That is what the store is keyed by and what the sidebar renders, so a client
 * never has to branch on `kind` just to find out which row moved. A proposal
 * event carries its revision id alongside, in `revisionId`, for the surfaces
 * that address the proposal itself.
 */

/** The Postgres `NOTIFY` channel. One channel for the whole feed. */
export const CHANGE_CHANNEL = "blog_changes";

/**
 * Postgres' payload limit for a notification, in bytes.
 *
 * Exceeding it is an error raised by `pg_notify` at execution time — which,
 * inside a transaction, would abort the caller's write. `encodeChangeEvent`
 * therefore checks *before* the statement is built (see `notify.ts`); with
 * ids-only payloads there is roughly two orders of magnitude of headroom, so
 * the check exists to make the guarantee explicit rather than to be hit.
 */
export const CHANGE_PAYLOAD_LIMIT = 8000;

/**
 * Origin of a write made by the app itself — a browser talking to `/api/*`.
 *
 * Out-of-band writers name themselves: `mcp/content-server.ts` uses
 * `AGENT_ORIGIN` (`"claude-code"`), the same string it already stores in
 * `Document.agentOrigin` and `Revision.origin`, so the feed's vocabulary and
 * the columns' agree. `origin` is left as a plain string rather than a union
 * for that reason — a second agent should be able to name itself without this
 * module being edited — and {@link isAgentOrigin} is the predicate the client
 * needs.
 */
export const APP_ORIGIN = "app";

/**
 * Was this write made by something other than the user's own app session?
 *
 * The quiet-UI distinction §2.1 asks for: an agent write surfaces a marker, the
 * user's own write does not re-announce itself. Written as "not the app" rather
 * than "equals claude-code" so a writer this module has never heard of is
 * treated as an agent — the conservative answer, since the alternative is
 * silently swallowing a change the user did not make.
 */
export const isAgentOrigin = (origin: string): boolean => origin !== APP_ORIGIN;

export type ChangeEventKind =
  | "document.created"
  | "document.updated"
  | "document.deleted"
  | "proposal.upserted"
  | "proposal.resolved";

interface ChangeEventBase {
  /** The document. Never a revision id — see the module doc comment. */
  id: string;
  /** The document's owner. What the fan-out filters on (§2.3). */
  authorId: string;
  /** Who wrote it: {@link APP_ORIGIN}, or an agent's own name. */
  origin: string;
}

/**
 * A document row appeared, changed or went away.
 *
 * `document.updated` covers content saves, renames, publish toggles, container
 * moves and accepting an agent-created post — everything the client answers by
 * re-fetching the row. Splitting it finer would make the client branch on
 * distinctions it does not act on differently.
 */
export interface DocumentChangeEvent extends ChangeEventBase {
  kind: "document.created" | "document.updated" | "document.deleted";
}

/**
 * A pending agent proposal was written or folded onto (§3.2).
 *
 * This is the event no document-shaped query can produce: `upsertProposal`
 * writes `Revision` rows only, so `Document.updatedAt` does not move and the
 * catch-up cannot see it. Live, it is the only cheap signal there is.
 */
export interface ProposalUpsertedEvent extends ChangeEventBase {
  kind: "proposal.upserted";
  /** The proposal row. One per document, rewritten in place on each batch. */
  revisionId: string;
}

/** A pending proposal stopped being pending: the author approved or refused it. */
export interface ProposalResolvedEvent extends ChangeEventBase {
  kind: "proposal.resolved";
  revisionId: string;
  /**
   * Approval also moves `Document.head`, so it is a document change too; the
   * emitter sends both rather than making the client infer one from the other.
   */
  resolution: "approved" | "rejected";
}

export type ChangeEvent =
  | DocumentChangeEvent
  | ProposalUpsertedEvent
  | ProposalResolvedEvent;

const DOCUMENT_KINDS = new Set<string>([
  "document.created",
  "document.updated",
  "document.deleted",
]);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * The JSON that crosses the channel.
 *
 * Field-by-field rather than `JSON.stringify(event)`: the input is a typed
 * object today, but nothing stops a caller from spreading a Prisma row into it,
 * and one such call site would put document content on a channel that promises
 * ids only. Whitelisting makes that impossible instead of unlikely.
 *
 * Throws when a required id is missing or the result exceeds
 * {@link CHANGE_PAYLOAD_LIMIT}. Callers in `notify.ts` treat a throw as "skip
 * this notification" — never as "fail the write".
 */
export function encodeChangeEvent(event: ChangeEvent): string {
  if (
    !isNonEmptyString(event.id) ||
    !isNonEmptyString(event.authorId) ||
    !isNonEmptyString(event.origin)
  ) {
    throw new TypeError(
      `Change event ${event.kind} is missing id, authorId or origin`,
    );
  }

  const payload: Record<string, string> = {
    kind: event.kind,
    id: event.id,
    authorId: event.authorId,
    origin: event.origin,
  };

  if (event.kind === "proposal.upserted" || event.kind === "proposal.resolved") {
    if (!isNonEmptyString(event.revisionId)) {
      throw new TypeError(`Change event ${event.kind} is missing revisionId`);
    }
    payload.revisionId = event.revisionId;
    if (event.kind === "proposal.resolved") {
      payload.resolution = event.resolution;
    }
  }

  const json = JSON.stringify(payload);
  // `TextEncoder`, not `Buffer.byteLength`: the limit is in bytes rather than
  // UTF-16 units, and this module has to stay importable by the browser half of
  // the feed, where `Buffer` does not exist.
  if (new TextEncoder().encode(json).length > CHANGE_PAYLOAD_LIMIT) {
    throw new RangeError(
      `Change event ${event.kind} exceeds the ${CHANGE_PAYLOAD_LIMIT}-byte ` +
        "NOTIFY payload limit",
    );
  }
  return json;
}

/**
 * The inverse, for Phase 2's listener and Phase 3's client.
 *
 * Returns `null` rather than throwing for anything it does not recognise. A
 * notification is not a request: there is no caller to answer, the payload may
 * have been written by an older or newer deployment sharing the channel, and
 * the honest response to "I do not understand this" is to ignore it and let
 * §3's catch-up carry the change instead.
 */
export function decodeChangeEvent(raw: string): ChangeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const value = parsed as Record<string, unknown>;
  const { kind, id, authorId, origin } = value;
  if (
    !isNonEmptyString(kind) ||
    !isNonEmptyString(id) ||
    !isNonEmptyString(authorId) ||
    !isNonEmptyString(origin)
  ) {
    return null;
  }

  if (DOCUMENT_KINDS.has(kind)) {
    return {
      kind: kind as DocumentChangeEvent["kind"],
      id,
      authorId,
      origin,
    };
  }

  if (kind === "proposal.upserted" || kind === "proposal.resolved") {
    const { revisionId } = value;
    if (!isNonEmptyString(revisionId)) return null;
    if (kind === "proposal.upserted") {
      return { kind, id, authorId, origin, revisionId };
    }
    const { resolution } = value;
    if (resolution !== "approved" && resolution !== "rejected") return null;
    return { kind, id, authorId, origin, revisionId, resolution };
  }

  return null;
}
