/**
 * Agent tokens — the credential half of docs/plans/mcp_support.md.
 *
 * What is worth pinning here is the refusal side, not the happy path. A token
 * that works is obvious the first time anyone uses one; a token that *keeps*
 * working after it was revoked, expired, or after its owner's account was
 * switched off, is a silent hole that nothing else in the app would notice.
 * §7 of the plan lists those as endpoint checks, and they will be — but the
 * decision itself lives in `verifyAgentToken`, so it can be tested without an
 * endpoint to point at.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentToken: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => create(...args),
      update: (...args: unknown[]) => update(...args),
      findMany: () => Promise.resolve([]),
    },
  },
}));

const {
  hasScope,
  hashAgentToken,
  looksLikeAgentToken,
  mintAgentToken,
  shouldTouch,
  tokenState,
  touchAgentToken,
  verifyAgentToken,
} = await import("../agentTokens");

const NOW = new Date("2026-08-08T12:00:00.000Z");

/** A stored row as `verifyAgentToken` selects it. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "tok-1",
  userId: "author-a",
  name: "laptop",
  scopes: ["read", "propose"],
  createdAt: NOW,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  user: { disabled: false },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("token format", () => {
  it("mints a prefixed secret that validates and is never reused", async () => {
    create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...row(), ...data })
    );

    const first = await mintAgentToken({
      userId: "author-a",
      name: "laptop",
      scopes: ["read"],
    });
    const second = await mintAgentToken({
      userId: "author-a",
      name: "laptop",
      scopes: ["read"],
    });

    expect(first.secret).toMatch(/^blog_pat_[A-Za-z0-9_-]{43}$/);
    expect(looksLikeAgentToken(first.secret)).toBe(true);
    expect(second.secret).not.toBe(first.secret);
  });

  it("stores only the hash", async () => {
    create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...row(), ...data })
    );

    const { secret } = await mintAgentToken({
      userId: "author-a",
      name: "laptop",
      scopes: ["read"],
    });

    const written = create.mock.calls[0][0].data;
    expect(written.hash).toBe(hashAgentToken(secret));
    expect(JSON.stringify(written)).not.toContain(secret);
  });

  it("refuses a token that could do nothing", async () => {
    await expect(
      mintAgentToken({ userId: "author-a", name: "x", scopes: [] }),
    ).rejects.toThrow(/at least one/);
  });

  it("rejects malformed secrets without touching the database", async () => {
    for (const bad of ["", "hunter2", "blog_pat_short", "Bearer blog_pat_x"]) {
      expect(looksLikeAgentToken(bad)).toBe(false);
      await expect(verifyAgentToken(bad)).resolves.toEqual({
        ok: false,
        reason: "malformed",
      });
    }
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("tokenState", () => {
  it("prefers revoked over expired, so a revocation is never reported as a lapse", () => {
    const both = { revokedAt: new Date("2026-08-01"), expiresAt: new Date("2026-08-02") };
    expect(tokenState(both, NOW)).toBe("revoked");
  });

  it("expires on the boundary, not after it", () => {
    expect(tokenState({ revokedAt: null, expiresAt: NOW }, NOW)).toBe("expired");
    expect(
      tokenState({ revokedAt: null, expiresAt: new Date(NOW.getTime() + 1) }, NOW),
    ).toBe("active");
  });

  it("treats a null expiry as no expiry", () => {
    expect(tokenState({ revokedAt: null, expiresAt: null }, NOW)).toBe("active");
  });
});

describe("verifyAgentToken", () => {
  const secret = "blog_pat_" + "a".repeat(43);

  it("returns the token, without its hash", async () => {
    findUnique.mockResolvedValue({ ...row(), hash: hashAgentToken(secret) });

    const result = await verifyAgentToken(secret, NOW);

    expect(result.ok).toBe(true);
    expect(result.ok && result.token).toMatchObject({
      id: "tok-1",
      userId: "author-a",
      scopes: ["read", "propose"],
    });
    // The hash is an authenticator. Handing it back to the caller that just
    // presented the secret gains nothing and puts it one careless log line away
    // from being written down.
    expect(result.ok && "hash" in result.token).toBe(false);
  });

  it("looks the token up by hash, never by the secret itself", async () => {
    findUnique.mockResolvedValue({ ...row(), hash: hashAgentToken(secret) });
    await verifyAgentToken(secret, NOW);

    expect(findUnique.mock.calls[0][0].where).toEqual({
      hash: hashAgentToken(secret),
    });
  });

  it("refuses an unknown, revoked or expired token", async () => {
    findUnique.mockResolvedValue(null);
    await expect(verifyAgentToken(secret, NOW)).resolves.toEqual({
      ok: false,
      reason: "unknown",
    });

    findUnique.mockResolvedValue({
      ...row({ revokedAt: new Date("2026-08-01") }),
      hash: hashAgentToken(secret),
    });
    await expect(verifyAgentToken(secret, NOW)).resolves.toEqual({
      ok: false,
      reason: "revoked",
    });

    findUnique.mockResolvedValue({
      ...row({ expiresAt: new Date("2026-08-07") }),
      hash: hashAgentToken(secret),
    });
    await expect(verifyAgentToken(secret, NOW)).resolves.toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("refuses a valid token whose owner is disabled", async () => {
    // The rule `requireUser` enforces on every session route. A credential that
    // outlived the switching-off of its account is the obvious way to miss it,
    // and nothing else in the token's own columns would say so.
    findUnique.mockResolvedValue({
      ...row({ user: { disabled: true } }),
      hash: hashAgentToken(secret),
    });

    await expect(verifyAgentToken(secret, NOW)).resolves.toEqual({
      ok: false,
      reason: "disabled",
    });
  });
});

describe("scopes", () => {
  it("separates reading from proposing", () => {
    const readOnly = { scopes: ["read"] };
    expect(hasScope(readOnly, "read")).toBe(true);
    expect(hasScope(readOnly, "propose")).toBe(false);
    expect(hasScope({ scopes: ["read", "propose"] }, "propose")).toBe(true);
  });
});

describe("lastUsedAt throttling", () => {
  it("writes on first use, then at most once a minute", () => {
    expect(shouldTouch(null, NOW)).toBe(true);
    expect(shouldTouch(new Date(NOW.getTime() - 59_000), NOW)).toBe(false);
    expect(shouldTouch(new Date(NOW.getTime() - 60_000), NOW)).toBe(true);
  });

  it("never fails the request it is describing", async () => {
    update.mockRejectedValue(new Error("database is on fire"));
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      touchAgentToken({ ...row(), lastUsedAt: null } as never, NOW),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
