/**
 * The sealing half of bring-your-own provider keys —
 * docs/plans/archive/byo-provider-keys.md §4.2.
 *
 * This module imports `node:crypto` and nothing else, on the same rule as
 * `dragGeometry.ts` and the content-bridge modules: the part with the bugs in
 * it should be exercisable without a database, an environment, or a browser.
 * Everything that reads `process.env` lives in `./keyring`, and everything that
 * touches Prisma lives in `./index`.
 *
 * ### Why this file exists at all
 *
 * It is the first reversible secret in the codebase. `agentTokens.ts` stores a
 * SHA-256 and is done, because it only ever answers "is this the same string I
 * saw before". A provider key has to be handed to api.anthropic.com verbatim on
 * every completion, so one-way is not available and the question becomes how
 * narrow the two-way version can be made.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256: the key is 32 bytes, and a key of any other length is a config error. */
export const KEY_BYTES = 32;
/**
 * 96 bits, the size GCM is specified for. Longer IVs are re-hashed internally
 * and buy nothing; shorter ones cost collision margin.
 */
export const IV_BYTES = 12;
/** Full-length tag. Truncating it is a documented option and a bad one. */
export const AUTH_TAG_BYTES = 16;

const ALGORITHM = "aes-256-gcm";

/**
 * The three parts of a sealed secret, matching the three columns on
 * `ProviderCredential`. Kept apart rather than packed into one blob so that a
 * malformed row fails at a named field.
 */
export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * The environment is misconfigured — no usable key material. Distinct from
 * `SealError` because the operator response is different: this one is "fix the
 * deployment", and it applies to every row at once.
 */
export class KeyringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyringError";
  }
}

/**
 * One row could not be opened. Either it was tampered with, or it was sealed
 * under key material this process does not have, or its identifying columns
 * were edited out from under the ciphertext (see `credentialAad`).
 *
 * Deliberately says nothing about which: the three are indistinguishable from
 * the tag check, and guessing in the message would be an invented diagnosis.
 */
export class SealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealError";
  }
}

/**
 * What a row is bound to.
 *
 * Without this, a ciphertext is portable: anyone able to write to the table
 * could copy row A's bytes onto row B and have one user's completions billed to
 * another user's key. Feeding the identity of the row in as additional
 * authenticated data costs a string concatenation and closes that — the bytes
 * only open against the exact `(user, provider, version)` they were sealed for,
 * so a row whose `provider` was flipped by hand fails to open rather than
 * decrypting into the wrong provider's client.
 *
 * `keyVersion` is in here too, which means a rotation cannot be faked by
 * editing the column alone.
 */
export const credentialAad = (
  userId: string,
  provider: string,
  keyVersion: number,
): string => `${userId}:${provider}:${keyVersion}`;

/**
 * Seal a plaintext under one key.
 *
 * The IV is generated here and there is no parameter through which a caller
 * could supply one, because GCM's failure under IV reuse is catastrophic rather
 * than gradual — it is not a knob worth exposing to save an argument.
 */
export function seal(
  plaintext: string,
  key: Buffer,
  aad: string,
): SealedSecret {
  assertKeyLength(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/**
 * Open a sealed secret, or throw.
 *
 * Every failure mode arrives as one `SealError`. In particular a wrong key, a
 * wrong AAD and a flipped bit in the ciphertext are all just "the tag did not
 * verify" — which is the property that makes the tag worth having, since
 * without it the third case would return plausible garbage and send it to a
 * provider.
 *
 * No `timingSafeEqual` here: GCM's tag comparison is already constant-time
 * inside OpenSSL, unlike the hash equality in `agentTokens.ts` which had to
 * spell it out.
 */
export function open(
  sealed: SealedSecret,
  key: Buffer,
  aad: string,
): string {
  assertKeyLength(key);
  if (sealed.iv.length !== IV_BYTES) {
    throw new SealError(
      `Stored iv is ${sealed.iv.length} bytes, expected ${IV_BYTES}`,
    );
  }
  if (sealed.authTag.length !== AUTH_TAG_BYTES) {
    throw new SealError(
      `Stored authTag is ${sealed.authTag.length} bytes, expected ${AUTH_TAG_BYTES}`,
    );
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([
      decipher.update(sealed.ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // The underlying message is "Unsupported state or unable to authenticate
    // data", which tells an operator nothing and tells a caller less. It is
    // swallowed rather than chained so no part of the ciphertext can reach a
    // log through a nested `cause`.
    throw new SealError("Could not open the stored credential");
  }
}

/**
 * Shortest secret we will store.
 *
 * Not a security property — it is there so `last4` cannot be handed something
 * with fewer than four characters to take, and so an empty string or a stray
 * newline is refused at the door rather than sealed and sent to a provider.
 * Every real provider key is far longer.
 */
export const MIN_SECRET_LENGTH = 8;

/**
 * The masked-display suffix. Four is what the providers themselves show: enough
 * to tell one of your own keys from another, not a meaningful fraction of it.
 */
export function last4(secret: string): string {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new KeyringError(
      `A provider key must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
  return secret.slice(-4);
}

function assertKeyLength(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new KeyringError(
      `Key material is ${key.length} bytes, expected ${KEY_BYTES}`,
    );
  }
}
