import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { proposeOps } from "@/lib/agentWrites";
import type { Op } from "@/lib/content-bridge";
import { opSchema } from "@/lib/content-bridge/schema";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * What the browser's agent proposes with. Server-stamped, so that the client
 * cannot name itself something it is not: an `origin` from the body would let a
 * page label its write `claude-code` in the review rail and in the change feed.
 * When a second in-app writer appears, it gets its own route or an enum here —
 * not a free-text field.
 */
const COPILOT_ORIGIN = "copilot";

const proposalSchema = z.object({
  /** The `stateHash` from the read these block addresses came from. */
  stateHash: z.string().min(1),
  ops: z.array(opSchema).min(1),
  /** One line for the review rail. */
  summary: z.string().max(200).optional(),
}).strict();

/**
 * Propose a block-level edit to a document (docs/plans/
 * ai-surface-consolidation.md §4.4.2).
 *
 * The same call `mcp/content-server.ts`'s `apply_ops` makes — `proposeOps` in
 * `src/lib/agentWrites.ts` — with an HTTP door in front, so an in-app agent's
 * content write lands in the proposal table and is reviewed through the surfaces
 * docs/plans/agent-gating.md already built, instead of being a chat-local accept
 * that overwrites `head` with no compare-and-set, no staleness and no provenance
 * (§2.4).
 *
 * **`write`, not the `own` its sibling routes use.** The asymmetry is the point,
 * and it is the same line `lib/access.ts` already draws:
 *
 * - *Proposing* is an edit of the document's content, which is what `write`
 *   means — and it is strictly weaker than the save any `write` holder can
 *   already perform, because it does not move `head`. Nothing served changes.
 *   Refusing a collaborator here would say that a person may rewrite the
 *   document outright but not suggest a change to it.
 * - *Approving* and *rejecting* are acts **on** the document — see the comment
 *   on `proposals/[revisionId]/approve`. `collab` satisfies `write`, so `own` is
 *   what stops any signed-in visitor committing an unreviewed agent write into
 *   `head`, or throwing away work the owner has not looked at.
 *
 * `read` would be the wrong mode in the other direction: it admits any published
 * document, which would let a stranger fill an author's review queue — and,
 * because one pending proposal per document is a database fact, fold their edit
 * into a proposal the author was already reviewing.
 *
 * The **document's own id** goes to `proposeOps`, never `params.id`: that
 * segment may be a handle, and proposals are keyed by `documentId`. The
 * revision's author is the caller, taken from the session and never from the
 * body, so provenance cannot be forged; `proposeOps` passes the *document's*
 * owner separately as the change feed's fan-out key.
 */
export const POST = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    // `revisions: "all"` for the same reason as approve: it keeps this off
    // `findDocument`'s head-repair write path and leaves `head` as stored, which
    // is the value the proposal is about to record as its base.
    const userPost = await requireDocument(params.id, user, "write", {
      revisions: "all",
      subtitle: "You are not authorized to edit this document",
    });

    const body = await parseBody(request, proposalSchema);

    const result = await proposeOps({
      documentId: userPost.id,
      authorId: user.id,
      // The same cast `apply_ops` makes over the same schema: zod infers a
      // heading's `level` as `number` where the IR narrows it to 1–6, so the
      // types describe the same values and only one of them says so. The range
      // is checked at runtime by the schema this body was parsed with, and the
      // codecs check the block again on the way in.
      ops: body.ops as Op[],
      stateHash: body.stateHash,
      origin: COPILOT_ORIGIN,
      summary: body.summary,
    });

    if (!result.ok) {
      if (result.reason === "not-found") {
        // `requireDocument` found it a moment ago, so this is a delete landing
        // in between rather than a caller error.
        throw new ApiError(404, "Document not found");
      }
      if (result.reason === "stale") {
        // The state moved between the read that produced these addresses and
        // this write, so the ops no longer name the blocks they meant. Recover
        // by re-reading, not by retrying — which is why it is not the 409
        // approve returns for a moved `head`.
        throw new ApiError(
          409,
          "This document changed while the edit was being written",
          result.message,
        );
      }
      // An op naming a block that is not there, or one the codecs refuse.
      // Retrying it unchanged fails identically — but *why* differs, and the
      // one recoverable case says so by name in front of the message. It stays
      // a 400 rather than joining the 409 above: the state did not move, one
      // address was simply wrong, and the subtitle is what the agent reads.
      const code = result.reason === "invalid" ? result.code : undefined;
      throw new ApiError(
        400,
        "That edit could not be applied",
        code ? `${code}: ${result.message}` : result.message,
      );
    }

    return NextResponse.json({
      data: {
        id: result.document.id,
        proposalId: result.proposal.id,
        // "created" | "squashed" | "replaced" — the caller says which, and
        // "replaced" is the one the user has to hear about: their earlier
        // proposal had gone stale and is gone (agent-gating §3.6).
        outcome: result.outcome,
        replaced: result.proposal.replaced,
        changed: result.changed,
        // The token the next batch in this turn must carry back.
        stateHash: result.stateHash,
      },
    });
  },
  {
    errorLabel: "Error proposing a change",
    signInMessage: "Please sign in to edit this document",
  },
);
