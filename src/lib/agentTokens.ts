/**
 * Agent tokens: the credential an agent presents to reach one user's content
 * over HTTP, without a browser session. See docs/plans/archive/mcp-support.md §4.3.
 *
 * The whole lifecycle lives here — mint, verify, revoke, list — rather than
 * splitting the hash across a script and a route. Two implementations of "how a
 * secret becomes a row" is exactly the drift this module exists to prevent.
 *
 * Nothing here decides HTTP status codes; `verifyAgentToken` returns *why* it
 * refused and the caller maps that to a response. That split matters, because
 * the reasons are for the server's logs and must not reach the client: an
 * unknown token and a revoked one have to be indistinguishable from outside, or
 * the endpoint answers "that token used to exist" to anyone who asks.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * What a token may do.
 *
 * `read` is the whole listing/outline/read/search surface; `propose` adds
 * `apply_ops` and `create_post`. A read-only token is the reason scopes exist
 * at all — it is the difference between handing something the ability to read
 * your blog and the ability to write to it.
 *
 * `manage` is a third rather than part of `propose`, and the reason is that
 * every write `propose` grants is *reversible by declining it*: a proposal sits
 * in the review rail until the author approves it, and a created post is an
 * unpublished draft they can discard. `rename_post` and `delete_post` are
 * neither. They land on the author's own content immediately, and `Document`
 * has no `deletedAt` — a deleted post and its revisions are gone. Folding those
 * into `propose` would have retroactively widened every token already minted,
 * so a credential that predates this scope cannot use them.
 */
export const AGENT_SCOPES = ["read", "propose", "manage"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const isAgentScope = (value: string): value is AgentScope =>
  (AGENT_SCOPES as readonly string[]).includes(value);

/**
 * Prefix on every secret.
 *
 * Not decoration: it makes a leaked token greppable in a log file and
 * recognisable to the secret scanners that watch public repositories, which is
 * the difference between finding out from a scanner and finding out from the
 * audit trail.
 */
const PREFIX = "blog_pat_";
/** 32 bytes of CSPRNG, base64url — 43 characters, no padding. */
const SECRET_BYTES = 32;
const SECRET_RE = new RegExp(`^${PREFIX}[A-Za-z0-9_-]{43}$`);

/** Cheap structural check, so a malformed header never reaches the database. */
export const looksLikeAgentToken = (value: string): boolean =>
  SECRET_RE.test(value);

/**
 * SHA-256, hex.
 *
 * Unsalted and unstretched deliberately — the input is 32 bytes of CSPRNG, not
 * a password. There is no dictionary to run and nothing worth slowing down, and
 * a plain hash is what allows the lookup to be one indexed equality instead of
 * a scan comparing candidates one by one.
 */
export const hashAgentToken = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex");

export type TokenState = "active" | "revoked" | "expired";

/** Pure: what a stored row is, at a given moment. */
export function tokenState(
  token: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date,
): TokenState {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}

/** Pure: does this token carry the scope a tool needs? */
export const hasScope = (
  token: { scopes: string[] },
  scope: AgentScope,
): boolean => token.scopes.includes(scope);

/**
 * Pure: is `lastUsedAt` stale enough to be worth a write?
 *
 * Recording every use would turn each read into a write, and an agent reading
 * an outline twenty times in a session does not need twenty rows updated. A
 * minute is enough to answer "is this token still in use" without that.
 */
const TOUCH_INTERVAL_MS = 60_000;
export const shouldTouch = (lastUsedAt: Date | null, now: Date): boolean =>
  lastUsedAt === null ||
  now.getTime() - lastUsedAt.getTime() >= TOUCH_INTERVAL_MS;

export interface AgentTokenSummary {
  id: string;
  userId: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

const SUMMARY_SELECT = {
  id: true,
  userId: true,
  name: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

/**
 * Mint a token for a user.
 *
 * The secret is returned once and never again — only its hash is stored, so a
 * caller that loses it has to mint another. That is the point.
 */
export async function mintAgentToken(input: {
  userId: string;
  name: string;
  scopes: AgentScope[];
  expiresAt?: Date | null;
}): Promise<{ secret: string; token: AgentTokenSummary }> {
  if (input.scopes.length === 0) {
    throw new Error("A token with no scopes could do nothing; pass at least one.");
  }
  const secret = PREFIX + randomBytes(SECRET_BYTES).toString("base64url");
  const token = await prisma.agentToken.create({
    data: {
      userId: input.userId,
      name: input.name,
      hash: hashAgentToken(secret),
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
    },
    select: SUMMARY_SELECT,
  });
  return { secret, token };
}

export type VerifyResult =
  | { ok: true; token: AgentTokenSummary }
  | {
    ok: false;
    /**
     * For the server's logs only. `disabled` is the one the caller should treat
     * differently — it matches `requireUser`'s 403, because the account exists
     * and the credential is valid; it is the account that is switched off.
     */
    reason: "malformed" | "unknown" | "revoked" | "expired" | "disabled";
  };

/**
 * Resolve a presented secret to the token it names, or say why not.
 *
 * The owner's `disabled` flag is checked here so token auth cannot drift from
 * `requireUser` (`api-utils.ts`), which refuses a disabled account on every
 * session-authenticated route. A credential that outlived the switching-off of
 * its account would be the obvious way to miss that.
 */
export async function verifyAgentToken(
  presented: string,
  now: Date = new Date(),
): Promise<VerifyResult> {
  if (!looksLikeAgentToken(presented)) return { ok: false, reason: "malformed" };

  const row = await prisma.agentToken.findUnique({
    where: { hash: hashAgentToken(presented) },
    select: { ...SUMMARY_SELECT, hash: true, user: { select: { disabled: true } } },
  });
  if (!row) return { ok: false, reason: "unknown" };

  // The unique index already matched, so this compares two values that are
  // equal in every reachable case. It is here so that the comparison a reviewer
  // looks for is present, and so it stays constant-time if the lookup is ever
  // changed to a prefix scan.
  const expected = Buffer.from(row.hash, "hex");
  const actual = Buffer.from(hashAgentToken(presented), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "unknown" };
  }

  const state = tokenState(row, now);
  if (state !== "active") return { ok: false, reason: state };
  if (row.user.disabled) return { ok: false, reason: "disabled" };

  const { hash: _hash, user: _user, ...token } = row;
  return { ok: true, token };
}

/**
 * Record that a token was used, at most once a minute.
 *
 * Best-effort: a failure here must not fail the request it is describing, since
 * the write is bookkeeping and the read it accompanies already succeeded.
 */
export async function touchAgentToken(
  token: AgentTokenSummary,
  now: Date = new Date(),
): Promise<void> {
  if (!shouldTouch(token.lastUsedAt, now)) return;
  try {
    await prisma.agentToken.update({
      where: { id: token.id },
      data: { lastUsedAt: now },
    });
  } catch (error) {
    console.error("Could not record agent token use:", error);
  }
}

export async function listAgentTokens(
  userId: string,
): Promise<AgentTokenSummary[]> {
  return prisma.agentToken.findMany({
    where: { userId },
    select: SUMMARY_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Revoke by id. Idempotent, and it keeps the row — see the schema comment: a
 * revoked token's `lastUsedAt` is the evidence of what a leaked credential did.
 */
export async function revokeAgentToken(
  id: string,
  now: Date = new Date(),
): Promise<AgentTokenSummary | null> {
  const existing = await prisma.agentToken.findUnique({
    where: { id },
    select: SUMMARY_SELECT,
  });
  if (!existing) return null;
  if (existing.revokedAt) return existing;
  return prisma.agentToken.update({
    where: { id },
    data: { revokedAt: now },
    select: SUMMARY_SELECT,
  });
}
