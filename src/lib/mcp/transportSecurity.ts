/**
 * Refusing to accept a bearer token in cleartext (docs/plans/archive/mcp-support.md
 * phase 5).
 *
 * An agent token is a long-lived credential that a holder replays on every
 * request. Over plain HTTP it is readable by anything on the path, and unlike a
 * session cookie there is no browser to notice and no expiry to limit the
 * damage — so "give it the IP of the blog server", which is where this plan
 * started, is exactly the shape that hands the credential away.
 *
 * The check is deliberately generous about what counts as safe, because a false
 * refusal breaks a working setup while a false accept only fails to protect
 * something the operator chose to expose:
 *
 *   - a proxy that terminated TLS says so in `x-forwarded-proto`;
 *   - a direct HTTPS listener says so in the URL;
 *   - a loopback host never crosses a network;
 *   - and `MCP_ALLOW_INSECURE=1` is the explicit way out for anyone whose
 *     deployment this does not describe — a tunnel, a private mesh like
 *     Tailscale, a proxy that forwards under a different header.
 *
 * `x-forwarded-proto` is client-settable if the app is not behind a proxy that
 * overwrites it. That is worth knowing and is not a hole here: forging it lets
 * a caller disable a check whose only beneficiary is that same caller.
 */

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);

/** Strip the port, and keep an IPv6 literal's brackets. */
const hostname = (host: string): string => {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1);
  const colon = trimmed.lastIndexOf(":");
  return colon === -1 ? trimmed : trimmed.slice(0, colon);
};

export interface SecureTransportEnv {
  /** `"1"` to accept a token over plain HTTP anyway. */
  MCP_ALLOW_INSECURE?: string;
  /** So `process.env` is assignable without a cast. */
  [key: string]: string | undefined;
}

/**
 * May this request carry a bearer token?
 *
 * Pure, and takes its environment, so the decision is testable without setting
 * process-wide state.
 */
export function isSecureTransport(
  request: Request,
  env: SecureTransportEnv = process.env,
): boolean {
  if (env.MCP_ALLOW_INSECURE === "1") return true;

  // A proxy chain appends, so the client's own protocol is the first entry.
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded && forwarded.split(",")[0]!.trim().toLowerCase() === "https") {
    return true;
  }

  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    // An unparseable URL is not evidence of anything; fall through.
  }

  const host = request.headers.get("host");
  return host ? LOOPBACK_HOSTS.has(hostname(host)) : false;
}
