/**
 * Reading an API refusal out of an AI SDK error —
 * docs/plans/archive/byo-provider-keys.md §4.7.
 *
 * The SDK's streaming hooks (`useCompletion`, `useChat`) surface a non-2xx as an
 * `Error` whose message is the raw response body. Ours is the route wrapper's
 * envelope — `{ error: { title, subtitle, code } }` — so what reaches a
 * component is that JSON as a string, and rendering `error.message` puts a
 * serialized object in front of the user.
 *
 * That was survivable while the only refusals were 401 and a genuine 500. It
 * stops being survivable now: "you have no key for this provider" is the most
 * common thing either route says, and it has to arrive as the sentence the
 * server wrote.
 *
 * Pure and client-safe — no server imports — so both design systems can use it.
 */

/** The tag on "you have no key for this provider". See `ApiErrorOptions.code`. */
export const MISSING_PROVIDER_KEY = "provider_key_missing";

export interface AIErrorInfo {
  title: string;
  subtitle?: string;
  code?: string;
}

/**
 * What to show a user for a failed AI request.
 *
 * Falls back to the raw message when the body is not our envelope — a network
 * failure, or an error thrown before the request was made — because a truthful
 * technical message beats a generic one that hides it.
 */
export function describeAIError(
  error: unknown,
  fallback: AIErrorInfo = { title: "Something went wrong" },
): AIErrorInfo {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return fallback;

  const envelope = parseEnvelope(message);
  if (envelope?.title) {
    return {
      title: envelope.title,
      subtitle: envelope.subtitle,
      code: envelope.code,
    };
  }

  // The pre-existing special case, kept: the 401 body is the same envelope, but
  // a session that expired mid-session is worth naming plainly wherever it
  // surfaces.
  if (/Unauthorized|sign in|401/i.test(message)) {
    return { title: "Sign in to use AI features" };
  }

  return { title: message };
}

/** Does this failure mean "add a key in Settings"? */
export const isMissingProviderKey = (error: unknown): boolean =>
  describeAIError(error).code === MISSING_PROVIDER_KEY;

function parseEnvelope(
  message: string,
): { title?: string; subtitle?: string; code?: string } | null {
  try {
    const body = JSON.parse(message);
    const error = body?.error;
    return error && typeof error === "object" ? error : null;
  } catch {
    return null;
  }
}
