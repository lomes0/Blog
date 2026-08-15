/**
 * Re-sealing stored keys under a new KEK — docs/plans/byo-provider-keys.md §4.2,
 * phase 5.
 *
 * This is the operation that runs when something has already gone wrong: a key
 * leaked, an operator left, a secrets store was rebuilt. So it is written for
 * that day rather than for a demo — it is resumable, it never widens the window
 * in which a row is unreadable, and it refuses to touch a row that changed
 * underneath it.
 *
 * ### Why it is safe to interrupt
 *
 * There is no progress file and no checkpoint, because `keyVersion` *is* the
 * progress. A row names the key that sealed it, so "what is left to do" is a
 * query, and the answer is correct after a crash, a `kill -9`, or a rotation
 * that was started twice.
 */
import { credentialAad, open, seal, type SealedSecret } from "./crypto";
import { currentKey, type Keyring, keyFor } from "./keyring";

/** Where a sealed secret is right now, and where it should end up. */
export interface SealContext {
  key: Buffer;
  aad: string;
}

/**
 * Pure: open under one key and re-seal under another.
 *
 * Both halves happen here so the plaintext never leaves this function — a
 * rotation that returned the opened secret to its caller would put every user's
 * key through a variable in a script, which is exactly the kind of thing that
 * ends up in a crash dump.
 */
export function reseal(
  sealed: SealedSecret,
  from: SealContext,
  to: SealContext,
): SealedSecret {
  return seal(open(sealed, from.key, from.aad), to.key, to.aad);
}

/** The row shape a rotation needs — deliberately not the whole record. */
export interface RotatableRow {
  id: string;
  userId: string;
  provider: string;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  keyVersion: number;
}

/**
 * Re-seal one row's bytes under the keyring's current version.
 *
 * Returns the new parts and the version they were sealed under; the caller
 * writes them, guarded on the row still naming `row.keyVersion`.
 *
 * @throws {SealError} the row cannot be opened — its key material is gone, or it
 * was tampered with. Its owner has to re-enter the key; nothing here can help.
 * @throws {KeyringError} the version this row names is not configured.
 */
export function resealRow(
  row: RotatableRow,
  keyring: Keyring,
): { sealed: SealedSecret; keyVersion: number } {
  const target = keyring.currentVersion;
  return {
    keyVersion: target,
    sealed: reseal(
      {
        ciphertext: Buffer.from(row.ciphertext),
        iv: Buffer.from(row.iv),
        authTag: Buffer.from(row.authTag),
      },
      {
        key: keyFor(keyring, row.keyVersion),
        aad: credentialAad(row.userId, row.provider, row.keyVersion),
      },
      {
        key: currentKey(keyring),
        aad: credentialAad(row.userId, row.provider, target),
      },
    ),
  };
}
