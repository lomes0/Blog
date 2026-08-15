import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { AI_PROVIDERS, type AIProviderType, providerRequiresKey } from "@/lib/ai/types";
import { verifyProviderKey } from "@/lib/ai/verifyKey";
import { createTokenBucketLimiter } from "@/lib/rateLimit";
import { deleteCredential, saveCredential } from "@/lib/providerCredentials";
import { MIN_SECRET_LENGTH } from "@/lib/providerCredentials/crypto";

export const dynamic = "force-dynamic";

/**
 * Store or remove one user's key for one provider —
 * docs/plans/byo-provider-keys.md §4.6.
 */

/**
 * Longest key we will accept.
 *
 * Provider keys run to about a hundred characters; this is generous by a factor
 * of five and exists so the field cannot be used to push a megabyte through
 * `seal` and into a `Bytes` column.
 */
const MAX_SECRET_LENGTH = 512;

const bodySchema = z.object({
  // Trimmed here rather than only in `saveCredential`, so the length bounds
  // apply to what will actually be stored: a key pasted with a trailing newline
  // should not be able to satisfy a minimum it would fail without the whitespace.
  apiKey: z.string().trim().min(
    MIN_SECRET_LENGTH,
    `An API key must be at least ${MIN_SECRET_LENGTH} characters`,
  ).max(MAX_SECRET_LENGTH, "That does not look like an API key"),
}).strict();

/**
 * Because `PUT` checks the key against its provider before storing it, it is
 * also a free oracle for asking *is this stolen key still live* — a capability
 * this feature creates rather than inherits, so it gets its own budget.
 *
 * Six an hour, burstable to five: generous for a human typing their own key
 * (the realistic worst case is a couple of typos and a paste), useless for
 * working through a list. Keyed by user, which is the identity the route
 * already proved; per-IP would be both weaker and harder to get right behind a
 * proxy.
 *
 * Process-local, like every other limiter here — see `rateLimit.ts` on what
 * that means if the app is ever scaled out.
 */
const verifyLimiter = createTokenBucketLimiter({
  capacity: 5,
  refillPerMinute: 6 / 60,
});

/** The `[provider]` segment, or a 404 — an unknown provider is not a bad request. */
function parseProvider(value: string | undefined): AIProviderType {
  if (!value || !(AI_PROVIDERS as readonly string[]).includes(value)) {
    throw new ApiError(
      404,
      "Unknown provider",
      `'${value}' is not one of: ${AI_PROVIDERS.join(", ")}`,
    );
  }
  return value as AIProviderType;
}

export const PUT = userRoute<{ provider: string }>(
  async (request, { params, user }) => {
    const provider = parseProvider(params.provider);

    // Ollama authenticates with nothing — see `providerRequiresKey`. Accepting a
    // key for it would store a secret that is never sent anywhere, which is
    // worse than useless.
    if (!providerRequiresKey(provider)) {
      throw new ApiError(
        400,
        "No key needed",
        `${provider} does not take an API key; it is configured by this deployment.`,
      );
    }

    const { apiKey } = await parseBody(request, bodySchema);

    // Spent here rather than on the way in, because what is being rationed is
    // the *provider call* below — the part that answers "is this key live".
    // A body the schema rejects never asks that question, and charging for it
    // would let the settings dialog's own validation errors eat the allowance a
    // user needs to enter their key.
    const budget = verifyLimiter.take(user.id);
    if (!budget.allowed) {
      throw new ApiError(
        429,
        "Too many attempts",
        `Wait ${budget.retryAfterSeconds}s before trying another key.`,
        { headers: { "Retry-After": String(budget.retryAfterSeconds) } },
      );
    }

    // Checked before it is stored, so a typo is an error on the field the user
    // is looking at. The two failure reasons get different statuses on purpose:
    // "the provider says no" is the user's to fix, "we could not ask" is ours,
    // and telling someone their key is wrong when the network was down is the
    // one outcome worth spending a branch to avoid.
    const verification = await verifyProviderKey(provider, apiKey);
    if (!verification.ok) {
      throw verification.reason === "rejected"
        ? new ApiError(400, "That key was rejected", verification.message)
        : new ApiError(
          502,
          "Could not reach the provider",
          `${verification.message}. The key has not been saved.`,
        );
    }

    const summary = await saveCredential({
      userId: user.id,
      provider,
      apiKey,
      verifiedAt: new Date(),
    });
    return NextResponse.json({ data: summary });
  },
  { errorLabel: "Error saving an AI provider key" },
);

export const DELETE = userRoute<{ provider: string }>(
  async (_request, { params, user }) => {
    await deleteCredential(user.id, parseProvider(params.provider));
    // 204 whether or not there was a row. A delete that reports "there was
    // nothing there" invites a client to treat absence as an error, and the
    // caller's goal — no key on file for this provider — is satisfied either
    // way.
    return new NextResponse(null, { status: 204 });
  },
  { errorLabel: "Error removing an AI provider key" },
);
