import { NextResponse } from "next/server";
import { userRoute } from "@/lib/api-utils";
import { listCredentials } from "@/lib/providerCredentials";

export const dynamic = "force-dynamic";

/**
 * Which AI providers this user has a key for — docs/plans/byo-provider-keys.md §4.6.
 *
 * Masked, and masked by construction rather than by remembering to strip a
 * field: `listCredentials` returns `CredentialSummary`, which has no column
 * that could carry a key. The one function that returns plaintext is
 * `resolveApiKey`, and it is not imported here.
 *
 * `userRoute`, so the answer is always about whoever is signed in. There is no
 * user id in the path, and there should not be one — "show me someone else's
 * credentials" is not a request this route needs to be able to refuse.
 */
export const GET = userRoute(async (_request, { user }) => {
  return NextResponse.json({ data: await listCredentials(user.id) });
}, { errorLabel: "Error listing AI provider keys" });
