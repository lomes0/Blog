/**
 * Who is allowed to create an account.
 *
 * The app is run as an invite-only beta, but nothing enforced that: the `signIn`
 * callback returned true for every successful OAuth login, so any account on the
 * provider could sign up and start writing. This module is the gate.
 *
 * The rule is deliberately asymmetric:
 *
 *   - Someone who already has a `User` row is a member and is always let back
 *     in. Membership is a fact about the database, not about the current value
 *     of an environment variable — so tightening or clearing the allowlist can
 *     never lock out existing users (including whoever set it up).
 *   - Everyone else is a new account, and is admitted only if their address
 *     matches `AUTH_ALLOWED_EMAILS`.
 *
 * That makes the empty/unset case fail *closed* for new sign-ups while staying
 * safe for the people already using the deployment — the property you want from
 * a default, since forgetting to configure this should not quietly reopen
 * registration.
 *
 * `AUTH_ALLOWED_EMAILS` is a comma- or whitespace-separated list. Entries are
 * matched case-insensitively and may be either:
 *
 *   - a full address — `ada@example.com`
 *   - a domain — `@example.com` or `example.com`, matching anyone there
 *
 * Set it to `*` to allow open registration, which has to be written out rather
 * than being what you get by leaving the variable blank.
 */

const OPEN = "*";

/** Parsed entries, lowercased and de-duplicated. */
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Whether `email` matches any entry in `allowlist`. */
export function matchesAllowlist(
  email: string | null | undefined,
  allowlist: string[],
): boolean {
  if (allowlist.includes(OPEN)) return true;
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at === -1) return false;
  const domain = normalized.slice(at + 1);
  if (!domain) return false;

  return allowlist.some((entry) => {
    if (entry === normalized) return true;
    // Domain entries, written either with or without the leading "@".
    const entryDomain = entry.startsWith("@") ? entry.slice(1) : entry;
    return !entryDomain.includes("@") && entryDomain === domain;
  });
}

/**
 * May this address sign in?
 *
 * `isExistingUser` carries the membership fact described above; pass the result
 * of a lookup against the `User` table.
 */
export function isSignInAllowed(
  email: string | null | undefined,
  isExistingUser: boolean,
  raw: string | undefined = process.env.AUTH_ALLOWED_EMAILS,
): boolean {
  if (isExistingUser) return true;
  return matchesAllowlist(email, parseAllowlist(raw));
}
