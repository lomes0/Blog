/**
 * Provider credentials: a user's own API key for one AI provider, stored
 * encrypted — docs/plans/archive/byo-provider-keys.md §4.3.
 *
 * Same shape as `agentTokens.ts`, and for the same reason: the whole lifecycle
 * lives in one module so that "how a secret becomes a row" has exactly one
 * implementation. Two of them is the drift this file exists to prevent.
 *
 * ### The one rule
 *
 * **`resolveApiKey` is the entire plaintext surface.** Everything else here —
 * and therefore everything in the routes, the settings UI and the model pickers
 * — is written against `CredentialSummary`, which cannot carry a key. Handing a
 * key back toward a browser is not something a caller can do by accident; it
 * requires calling the one function that could, from a file with no reason to.
 */
import { shouldTouch } from "@/lib/agentTokens";
import type { AIProviderType } from "@/lib/ai/types";
import { prisma } from "@/lib/prisma";
import { credentialAad, last4, open, seal } from "./crypto";
import { currentKey, keyFor, loadKeyring } from "./keyring";

/**
 * Prisma types a `Bytes` column as `Uint8Array<ArrayBuffer>`, while `node:crypto`
 * hands back `Buffer<ArrayBufferLike>` — which may be backed by a
 * `SharedArrayBuffer` and so is not assignable. Copying into a plain view is the
 * conversion, and it is cheap at these sizes (12 to 48 bytes).
 */
const bytes = (value: Buffer): Uint8Array<ArrayBuffer> => new Uint8Array(value);

/**
 * What a credential looks like to anything that is not about to make a provider
 * call. No key, and no field from which one could be reconstructed.
 */
export interface CredentialSummary {
  provider: AIProviderType;
  /** Masked-display suffix — see `last4` in `./crypto`. */
  last4: string;
  createdAt: Date;
  /** When the key was last replaced. A key is upserted, so this moves. */
  updatedAt: Date;
  lastUsedAt: Date | null;
  lastVerifiedAt: Date | null;
}

const SUMMARY_SELECT = {
  provider: true,
  last4: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  lastVerifiedAt: true,
} as const;

const toSummary = (row: {
  provider: string;
  last4: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  lastVerifiedAt: Date | null;
}): CredentialSummary => ({ ...row, provider: row.provider as AIProviderType });

/**
 * Store a key for a user, replacing whatever was there.
 *
 * An upsert rather than a create, because `@@unique([userId, provider])` says
 * there is one key per provider and a user entering a second one means to
 * replace the first. There is no "which is the default" question to answer.
 *
 * `verifiedAt` is what a caller that has just checked the key against its
 * provider passes in; the route does that before saving, so a typo fails in the
 * settings dialog rather than three screens later as a stream that dies
 * mid-sentence.
 *
 * Returns the summary, never the plaintext — the caller already has it.
 */
export async function saveCredential(input: {
  userId: string;
  provider: AIProviderType;
  apiKey: string;
  verifiedAt?: Date | null;
}): Promise<CredentialSummary> {
  const keyring = loadKeyring();
  const { keyVersion, sealed, suffix } = sealForRow(
    input.apiKey,
    input.userId,
    input.provider,
    keyring.currentVersion,
    currentKey(keyring),
  );

  const row = await prisma.providerCredential.upsert({
    where: {
      userId_provider: { userId: input.userId, provider: input.provider },
    },
    create: {
      userId: input.userId,
      provider: input.provider,
      ciphertext: bytes(sealed.ciphertext),
      iv: bytes(sealed.iv),
      authTag: bytes(sealed.authTag),
      keyVersion,
      last4: suffix,
      lastVerifiedAt: input.verifiedAt ?? null,
    },
    update: {
      ciphertext: bytes(sealed.ciphertext),
      iv: bytes(sealed.iv),
      authTag: bytes(sealed.authTag),
      keyVersion,
      last4: suffix,
      lastVerifiedAt: input.verifiedAt ?? null,
      // A replaced key has never been used *as this key*, so the old row's
      // usage must not carry over — it would read as evidence about a secret
      // that is no longer there.
      lastUsedAt: null,
    },
    select: SUMMARY_SELECT,
  });
  return toSummary(row);
}

/**
 * The user's key for a provider, in the clear, or `null` if they have none.
 *
 * `null` means *no credential exists*, and nothing else. A row that exists but
 * cannot be opened throws instead, because the two need different answers: the
 * first is "add a key in Settings" and the second is "this deployment lost the
 * key material that sealed your credential". Collapsing them would tell a user
 * to re-enter a key they already entered, every time, with no indication that
 * anything is wrong with the server.
 *
 * @throws {SealError} the row exists but did not open (tampered, or sealed
 * under key material this process no longer has).
 * @throws {KeyringError} the deployment has no usable key material at all.
 */
export async function resolveApiKey(
  userId: string,
  provider: AIProviderType,
): Promise<string | null> {
  const row = await prisma.providerCredential.findUnique({
    where: { userId_provider: { userId, provider } },
    select: {
      ciphertext: true,
      iv: true,
      authTag: true,
      keyVersion: true,
    },
  });
  if (!row) return null;

  const key = keyFor(loadKeyring(), row.keyVersion);
  return open(
    {
      ciphertext: Buffer.from(row.ciphertext),
      iv: Buffer.from(row.iv),
      authTag: Buffer.from(row.authTag),
    },
    key,
    credentialAad(userId, provider, row.keyVersion),
  );
}

/** Every credential this user has, masked. Ordered so the UI does not have to. */
export async function listCredentials(
  userId: string,
): Promise<CredentialSummary[]> {
  const rows = await prisma.providerCredential.findMany({
    where: { userId },
    select: SUMMARY_SELECT,
    orderBy: { provider: "asc" },
  });
  return rows.map(toSummary);
}

/**
 * Remove a key. `false` if there was nothing to remove.
 *
 * Deleted outright, unlike `AgentToken`, which keeps revoked rows as evidence.
 * The asymmetry is deliberate: a revoked agent token's `lastUsedAt` says what a
 * leaked credential of *ours* did, and is worth keeping. A deleted provider key
 * is the user's own secret at a third party, and keeping ciphertext they asked
 * us to forget buys nothing — the audit trail that matters for it lives in the
 * provider's own console.
 */
export async function deleteCredential(
  userId: string,
  provider: AIProviderType,
): Promise<boolean> {
  const { count } = await prisma.providerCredential.deleteMany({
    where: { userId, provider },
  });
  return count > 0;
}

/**
 * Record that a key was used, at most once a minute.
 *
 * `shouldTouch` is imported from `agentTokens.ts` rather than restated: it is
 * the same question about the same kind of column, and the Copilot's tool loop
 * can drive several completions in one turn, so the throttle earns its place
 * here for the same reason it did there.
 *
 * Best-effort. A failure to record a use must not fail the completion it is
 * describing, which has already happened.
 */
export async function touchCredential(
  userId: string,
  provider: AIProviderType,
  now: Date = new Date(),
): Promise<void> {
  try {
    const row = await prisma.providerCredential.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { lastUsedAt: true },
    });
    if (!row || !shouldTouch(row.lastUsedAt, now)) return;
    await prisma.providerCredential.update({
      where: { userId_provider: { userId, provider } },
      data: { lastUsedAt: now },
    });
  } catch (error) {
    console.error("Could not record provider credential use:", error);
  }
}

/** Seal one key for one row, and compute what the masked display will show. */
function sealForRow(
  apiKey: string,
  userId: string,
  provider: AIProviderType,
  keyVersion: number,
  key: Buffer,
) {
  // Trimmed before anything else: a key pasted with a trailing newline is the
  // single most common way to store one that then fails at the provider, and
  // the whitespace would otherwise be sealed in and show up in `last4`.
  const trimmed = apiKey.trim();
  return {
    keyVersion,
    suffix: last4(trimmed),
    sealed: seal(trimmed, key, credentialAad(userId, provider, keyVersion)),
  };
}

export { SealError } from "./crypto";
export { KeyringError } from "./crypto";
