import { userRoute } from "@/lib/api-utils";
import {
  countAgentCreatedDocuments,
  countPendingRenames,
} from "@/repositories/document";
import { countPendingProposals } from "@/repositories/revision";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * How much agent work is waiting on the caller (docs/plans/archive/agent-gating.md
 * §3.4, §3.5).
 *
 * **`userRoute`, and scoped to the caller's own documents.** A bare count
 * endpoint is exactly the shape of thing that gets written as `publicRoute`
 * without anyone deciding to, and `grep -rn "publicRoute" src/app/api` is meant
 * to stay the complete list of unauthenticated surfaces (CLAUDE.md). There is
 * nothing here anyone else may know: how many drafts an agent has rewritten for
 * you is your business, and an unscoped count would leak the whole install's
 * activity to any signed-in visitor.
 *
 * Three numbers, because the §3.5 badge covers every case an agent can leave
 * behind and they are answered by different columns — a pending proposal on an
 * existing document (approve or reject), an agent-created post awaiting accept
 * or discard, and a rename waiting to be applied
 * (docs/plans/claude-code-backlog.md §8). `total` is the number the badge
 * renders; the parts are there so the rail can label its groups without a
 * second request.
 *
 * The browser cannot know a terminal write happened, so this is what the focus
 * poll asks. It stays a count rather than a listing on purpose: the answer is
 * almost always zero, and the poll should cost three indexed counts.
 */
export const GET = userRoute(
  async (_request, { user }) => {
    const [proposals, agentPosts, renames] = await Promise.all([
      countPendingProposals(user.id),
      countAgentCreatedDocuments(user.id),
      countPendingRenames(user.id),
    ]);

    return NextResponse.json({
      data: {
        proposals,
        agentPosts,
        renames,
        total: proposals + agentPosts + renames,
      },
    });
  },
  { errorLabel: "Error counting pending agent changes" },
);
