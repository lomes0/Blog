import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { approveProposal } from "@/repositories/revision";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { validate } from "uuid";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * What the reviewer decided, when they sent anything at all.
 *
 * `.strict()`, so a field this route does not accept is a 400 naming it rather
 * than a silently ignored decision — which on this endpoint would mean applying
 * the *whole* proposal while the author believed they had refused half of it.
 * That is the one failure mode worth engineering against here: a body that is
 * misunderstood must never be a body that is quietly widened.
 *
 * Note what is *not* accepted: no content, no block, no state. Only hunk ids,
 * which the server re-derives meaning for from its own two rows.
 */
const decisionsSchema = z.object({
  rejectedHunks: z.array(z.string().min(1)).optional(),
  /** The proposal `version` these hunks were computed from (§3.2's CAS token). */
  version: z.number().int().nonnegative().optional(),
}).strict();

/**
 * Make a pending agent proposal the document, whole or in part
 * (docs/plans/archive/agent-gating.md §3.4, docs/plans/archive/haklex-adoption.md §7).
 *
 * **`own`, not `write`.** `collab` satisfies `write` — "anyone holding the link
 * may edit" (`lib/access.ts`) — so on a collab document `write` would let any
 * signed-in visitor commit Claude's unreviewed work into `head`. Approving is an
 * act *on* the document rather than an edit *of* its content, which is the line
 * `own` already draws for rename, delete and move. Per-hunk review does not
 * soften that: choosing which half of an agent's work becomes the document is
 * more of an act on it, not less.
 *
 * The document is resolved before the revision id is used, and `approveProposal`
 * then matches on `{ id: revisionId, documentId }` — a revision id is not a
 * bearer token, and one belonging to another document must not be approvable
 * through a document you happen to own.
 *
 * Everything else is phase 1's transaction: the compare-and-set on
 * `Document.head` uses the proposal's `baseRevisionId`, so a save made after the
 * proposal was written makes the guard miss and this answers 409 rather than
 * quietly discarding that save.
 *
 * **The body is optional and absent means what it always meant.** A `POST` with
 * no JSON content type is the whole-proposal approval, byte for byte the request
 * every existing caller sends. The two 409s it can now answer are told apart by
 * `error.code` rather than by their wording: `head-moved` is terminal for this
 * attempt, `proposal-moved` means the hunks on screen are out of date and the
 * client should re-fetch the proposal and ask again.
 */
export const POST = userRoute<{ id: string; revisionId: string }>(
  async (request, { params, user }) => {
    if (!validate(params.revisionId)) {
      throw new ApiError(400, "Bad Request", "Invalid revision id");
    }

    // Only a client that says it is sending JSON has its body read. `parseBody`
    // treats an empty body as a 400, so probing the header is what keeps a bare
    // `fetch(url, { method: "POST" })` — the shape every caller uses today —
    // from becoming an error the moment this route learned to accept a body.
    const decisions =
      request.headers.get("content-type")?.includes("application/json")
        ? await parseBody(request, decisionsSchema)
        : {};

    // `revisions: "all"` keeps this read off `findDocument`'s head-repair write
    // path, and leaves `head` as stored rather than as repaired.
    const userPost = await requireDocument(params.id, user, "own", {
      revisions: "all",
      subtitle: "You are not authorized to approve changes to this document",
    });

    // The document's own id, never `params.id` — that segment may be a handle,
    // and the proposal is keyed by `documentId`.
    const result = await approveProposal(
      userPost.id,
      params.revisionId,
      decisions,
    );

    if (!result.ok) {
      if (result.reason === "unknown-hunks") {
        // The client's diff and the server's disagree, so its selection cannot
        // be honoured — and must not be rounded down to "accept everything".
        // The ids are named because the only useful response is to re-fetch the
        // proposal and recompute, and a client that cannot see which ids were
        // rejected cannot tell that apart from a bug of its own.
        throw new ApiError(
          400,
          "Bad Request",
          `This document has no change matching ${result.ids.join(", ")}. ` +
            "Reload the proposal and try again.",
          { code: "unknown-hunks" },
        );
      }

      if (result.reason === "version-moved") {
        // Not "someone saved" — the *proposal* was rewritten, by another agent
        // batch squashing onto it while the review was open (§3.2). Nothing was
        // applied, the proposal is still approvable, and the fix is to look at
        // it again. A distinct `code` is what lets the UI do that automatically
        // instead of showing the conflict below.
        throw new ApiError(
          409,
          "This change was updated while you were reviewing it",
          "Claude added more to this proposal, so the changes you picked no " +
            "longer describe it. Nothing was applied — reload and review again.",
          { code: "proposal-moved" },
        );
      }

      if (result.reason === "not-found") {
        // Approving twice. The first call cleared `proposedAt` and moved `head`,
        // so there is no longer a pending row to find — but if `head` is already
        // this revision the caller's intent is satisfied, and a second click on
        // a rail button should not read as an error. Anything else genuinely is
        // not there: no such revision, or one belonging to another document.
        if (userPost.head === params.revisionId) {
          return NextResponse.json({
            data: {
              id: userPost.id,
              head: params.revisionId,
              approved: false,
            },
          });
        }
        throw new ApiError(
          404,
          "Proposal not found",
          "There is no pending proposal by that id on this document",
        );
      }

      if (result.reason === "stale") {
        throw new ApiError(
          409,
          "This proposal is out of date",
          "The document changed after this was proposed. Ask Claude again " +
            "against the current content.",
          { code: "proposal-stale" },
        );
      }

      // "conflict": the compare-and-set on `head` missed, so the document moved
      // off the base this proposal was built on — a save of your own, in another
      // tab. Nothing was overwritten.
      throw new ApiError(
        409,
        "Saved somewhere else first",
        "This document changed after the proposal was written, so approving " +
          "it would have overwritten that change. Nothing was applied.",
        { code: "head-moved" },
      );
    }

    revalidatePath("/");
    revalidatePath(`/${userPost.handle || userPost.id}`);
    revalidatePath(`/view/${userPost.id}`);
    if (userPost.seriesId) {
      revalidatePath("/series");
      revalidatePath(`/series/${userPost.seriesId}`);
    }

    return NextResponse.json({
      data: {
        id: userPost.id,
        head: result.head,
        approved: true,
        // Only when something was refused. Absent is the whole proposal, which
        // keeps the success body of a no-decisions approval unchanged.
        ...(result.partial ? { partial: result.partial } : {}),
      },
    });
  },
  {
    errorLabel: "Error approving proposal",
    signInMessage: "Please sign in to approve this change",
  },
);
