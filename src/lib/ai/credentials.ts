/**
 * Where a completion's API key comes from — docs/plans/archive/byo-provider-keys.md §4.4.
 *
 * This is the seam the whole plan exists to move. Until phase 4 the answer was
 * `process.env`, and every signed-in user spent the deployment's credits; now it
 * is the user's own stored key, and a user without one is refused rather than
 * quietly served on someone else's account. There is deliberately no fallback —
 * §4.7, decided at the outset.
 *
 * **Not exported from `src/lib/ai/index.ts`.** That barrel is imported by client
 * components (`AIDialog` pulls `AI_MODELS` through it), and this module reaches
 * Prisma. Routes import it by path.
 */
import { ApiError } from "@/lib/api-utils";
import {
  KeyringError,
  resolveApiKey,
  SealError,
} from "@/lib/providerCredentials";
// The code is declared in the client-safe module beside the helper that reads
// it back off a failed request — one constant, both ends of the contract.
import { MISSING_PROVIDER_KEY } from "./errorMessage";
import { deploymentEndpoint, type ProviderCredentials } from "./providers";
import {
  AI_PROVIDER_LABEL,
  type AIProviderType,
  providerRequiresKey,
} from "./types";

/**
 * The credentials for one user's request to one provider, or a refusal.
 *
 * @throws {ApiError} 409 when the user has no key for a provider that needs one;
 * 500 when a stored key exists but cannot be read.
 */
export async function resolveProviderCredentials(
  userId: string,
  provider: AIProviderType,
): Promise<ProviderCredentials> {
  // Ollama authenticates with nothing, so BYO-only does not apply to it — see
  // `providerRequiresKey`. Its endpoint is deployment config, as every
  // provider's URL is.
  if (!providerRequiresKey(provider)) return deploymentEndpoint(provider);

  let apiKey: string | null;
  try {
    apiKey = await resolveApiKey(userId, provider);
  } catch (error) {
    if (error instanceof SealError || error instanceof KeyringError) {
      // The row is there and we cannot open it: the key material that sealed it
      // is gone, or the row was tampered with. That is the deployment's
      // problem, and it must not be reported as a missing key — the user would
      // re-enter a key they already have, and it would fail the same way.
      console.error(`Could not open the ${provider} key for ${userId}:`, error);
      throw new ApiError(
        500,
        "Stored key could not be read",
        "This deployment cannot decrypt your saved key. Contact the administrator.",
      );
    }
    throw error;
  }

  if (!apiKey) {
    throw new ApiError(
      409,
      `No ${AI_PROVIDER_LABEL[provider]} key`,
      `Add one in Settings → Provider keys to use this model.`,
      { code: MISSING_PROVIDER_KEY },
    );
  }

  return { apiKey, ...deploymentEndpoint(provider) };
}
