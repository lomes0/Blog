/**
 * Re-sealing under a new KEK — docs/plans/archive/byo-provider-keys.md phase 5.
 *
 * The property that matters is not "the plaintext survives" — it is that the
 * *old key stops working*. A rotation that leaves a row openable under the
 * retired key has done nothing, and it would look exactly like a successful one
 * from the outside, since the only visible change is a column that says 2.
 */
import { expect } from "vitest";
import { credentialAad, KEY_BYTES, open, seal, SealError } from "../crypto";
import { parseKeyring } from "../keyring";
import { resealRow } from "../rotate";

const key = (fill: number) => Buffer.alloc(KEY_BYTES, fill);
const encoded = (fill: number) => key(fill).toString("base64");

const V1 = key(0x11);
const V2 = key(0x22);

const SECRET = "sk-ant-api03-notarealkeyatall";
const USER = "author-a";
const PROVIDER = "anthropic";

/** A stored row, sealed under version 1. */
const rowSealedUnderV1 = () => {
  const sealed = seal(SECRET, V1, credentialAad(USER, PROVIDER, 1));
  return {
    id: "cred-1",
    userId: USER,
    provider: PROVIDER,
    ciphertext: new Uint8Array(sealed.ciphertext),
    iv: new Uint8Array(sealed.iv),
    authTag: new Uint8Array(sealed.authTag),
    keyVersion: 1,
  };
};

const keyring = () =>
  parseKeyring(`1:${encoded(0x11)},2:${encoded(0x22)}`, "2");

describe("resealRow", () => {
  it("preserves the secret", () => {
    const { sealed, keyVersion } = resealRow(rowSealedUnderV1(), keyring());
    expect(keyVersion).toBe(2);
    expect(open(sealed, V2, credentialAad(USER, PROVIDER, 2))).toBe(SECRET);
  });

  it("leaves the retired key unable to open it", () => {
    const { sealed } = resealRow(rowSealedUnderV1(), keyring());
    expect(() => open(sealed, V1, credentialAad(USER, PROVIDER, 1)))
      .toThrow(SealError);
    // Nor under the new key with the old AAD: the version is bound in, so a row
    // whose column was edited without re-sealing does not open either.
    expect(() => open(sealed, V2, credentialAad(USER, PROVIDER, 1)))
      .toThrow(SealError);
  });

  it("re-encrypts rather than re-labelling", () => {
    const row = rowSealedUnderV1();
    const { sealed } = resealRow(row, keyring());
    expect(Buffer.from(row.ciphertext).equals(sealed.ciphertext)).toBe(false);
    expect(Buffer.from(row.iv).equals(sealed.iv)).toBe(false);
  });

  it("stays bound to its own row", () => {
    const { sealed } = resealRow(rowSealedUnderV1(), keyring());
    expect(() => open(sealed, V2, credentialAad("author-b", PROVIDER, 2)))
      .toThrow(SealError);
  });

  it("is a no-op in effect when the row is already current", () => {
    // Rotation re-runs over rows it has already done — after a crash, or when
    // an operator runs it twice. Doing so must not corrupt them.
    const first = resealRow(rowSealedUnderV1(), keyring());
    const again = resealRow({
      ...rowSealedUnderV1(),
      ciphertext: new Uint8Array(first.sealed.ciphertext),
      iv: new Uint8Array(first.sealed.iv),
      authTag: new Uint8Array(first.sealed.authTag),
      keyVersion: 2,
    }, keyring());
    expect(open(again.sealed, V2, credentialAad(USER, PROVIDER, 2))).toBe(SECRET);
  });

  it("refuses a row whose key material is gone, rather than dropping it", () => {
    // The state after retiring a key too early. The row is not recoverable and
    // must be reported, not skipped quietly — its owner has to re-enter it.
    const onlyV2 = parseKeyring(`2:${encoded(0x22)}`);
    expect(() => resealRow(rowSealedUnderV1(), onlyV2))
      .toThrow(/No key for version 1/);
  });
});
