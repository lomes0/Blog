/**
 * Is this actually a working key? — docs/plans/archive/byo-provider-keys.md §4.6.
 *
 * A key is checked against its provider before it is stored, so a typo fails in
 * the settings dialog where the user is still looking at the field they
 * mistyped, rather than three screens later as a stream that dies mid-sentence.
 * Nothing else in the app can tell those two apart after the fact.
 *
 * The check costs one token. It is deliberately not a "list models" call: some
 * providers let a key list models it cannot generate with, so the only question
 * worth asking is the one the app will actually ask later.
 */
import { APICallError, generateText } from "ai";
import { getModelsByProvider } from "./models";
import { createProvider, deploymentEndpoint } from "./providers";
import type { AIProviderType } from "./types";

export type KeyVerification =
  | { ok: true }
  | {
    ok: false;
    /**
     * `rejected` means the provider looked at the credential and said no — the
     * user mistyped it, or revoked it. `unreachable` means we never got an
     * answer, which is our problem rather than theirs and must not be reported
     * as a bad key.
     */
    reason: "rejected" | "unreachable";
    message: string;
  };

/** Long enough for a cold model, short enough that a dialog does not hang. */
const VERIFY_TIMEOUT_MS = 15_000;

export async function verifyProviderKey(
  provider: AIProviderType,
  apiKey: string,
): Promise<KeyVerification> {
  const model = cheapestModel(provider);
  if (!model) {
    return {
      ok: false,
      reason: "unreachable",
      message: `No model is registered for ${provider}, so a key cannot be checked`,
    };
  }

  try {
    const instance = createProvider(provider, {
      apiKey,
      ...deploymentEndpoint(provider),
    });
    await generateText({
      model: instance(model),
      prompt: "hi",
      maxOutputTokens: 1,
      // No retries: a rejected credential is not going to be accepted on the
      // second try, and the only thing retrying adds is the delay before the
      // user is told what is wrong.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    return { ok: true };
  } catch (error) {
    return classify(error, apiKey);
  }
}

/**
 * The cheapest model we already know about for a provider.
 *
 * Derived from the registry rather than a second hard-coded list, so a provider
 * whose models change does not leave a stale id here that 404s and reads as a
 * bad key. `fast` is the registry's own word for the small model.
 */
function cheapestModel(provider: AIProviderType): string | undefined {
  const models = getModelsByProvider(provider);
  return (models.find((m) => m.metadata?.fast) ?? models[0])?.id;
}

function classify(error: unknown, apiKey: string): KeyVerification {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        reason: "rejected",
        message: redact(error.message, apiKey),
      };
    }
    return {
      ok: false,
      reason: "unreachable",
      message: redact(
        status ? `The provider answered ${status}` : error.message,
        apiKey,
      ),
    };
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return {
      ok: false,
      reason: "unreachable",
      message: `The provider did not answer within ${VERIFY_TIMEOUT_MS / 1000}s`,
    };
  }
  return {
    ok: false,
    reason: "unreachable",
    message: redact(
      error instanceof Error ? error.message : "Could not reach the provider",
      apiKey,
    ),
  };
}

/**
 * Nothing that came back from a provider is quoted without this.
 *
 * A key is in the request headers of the call that just failed, and error
 * objects from HTTP clients have a long history of carrying the request back
 * with them. This message goes into a 400 body and possibly a log line, so the
 * cost of being wrong about that is the credential.
 */
const redact = (message: string, apiKey: string): string =>
  apiKey ? message.split(apiKey).join("[redacted]") : message;
