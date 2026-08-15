/**
 * Sealing provider keys — docs/plans/byo-provider-keys.md §4.2, phase 1.
 *
 * A round trip is not what is worth pinning here. Encrypt-then-decrypt passes
 * just as happily with the auth tag ignored, with the AAD dropped, and with a
 * fixed IV — all three of which are the actual failure modes. So most of this
 * file is the refusals, and each one names the property it stands for.
 */
import {
  AUTH_TAG_BYTES,
  credentialAad,
  IV_BYTES,
  KEY_BYTES,
  KeyringError,
  last4,
  MIN_SECRET_LENGTH,
  open,
  seal,
  SealError,
} from "../crypto";

/** A distinct 32-byte key per test, without randomness. */
const key = (fill: number) => Buffer.alloc(KEY_BYTES, fill);

const KEY_A = key(0x11);
const KEY_B = key(0x22);

const SECRET = "sk-ant-api03-VGhpcyBpcyBub3QgYSByZWFsIGtleQ";
const AAD = credentialAad("author-a", "anthropic", 1);

describe("seal / open", () => {
  it("round-trips a secret", () => {
    expect(open(seal(SECRET, KEY_A, AAD), KEY_A, AAD)).toBe(SECRET);
  });

  it("round-trips non-ASCII, so the utf8 handling is not assumed", () => {
    const secret = "clé-privée-🔑-Ω";
    expect(open(seal(secret, KEY_A, AAD), KEY_A, AAD)).toBe(secret);
  });

  it("produces the sizes the columns are declared for", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    expect(sealed.iv).toHaveLength(IV_BYTES);
    expect(sealed.authTag).toHaveLength(AUTH_TAG_BYTES);
    expect(sealed.ciphertext.toString("utf8")).not.toContain("sk-ant");
  });

  it("never repeats an IV, so GCM's one catastrophic misuse is unavailable", () => {
    const first = seal(SECRET, KEY_A, AAD);
    const second = seal(SECRET, KEY_A, AAD);
    expect(first.iv.equals(second.iv)).toBe(false);
    // And therefore the same plaintext under the same key does not produce the
    // same bytes — two users with the same key are not visibly the same user.
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });
});

describe("refusals", () => {
  it("refuses a different key", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    expect(() => open(sealed, KEY_B, AAD)).toThrow(SealError);
  });

  it("refuses a ciphertext moved onto another user's row", () => {
    // The attack the AAD exists for: copy the bytes, get someone else's key
    // billed to your completions.
    const sealed = seal(SECRET, KEY_A, credentialAad("author-a", "anthropic", 1));
    expect(() =>
      open(sealed, KEY_A, credentialAad("author-b", "anthropic", 1))
    ).toThrow(SealError);
  });

  it("refuses a row whose provider was edited underneath the ciphertext", () => {
    const sealed = seal(SECRET, KEY_A, credentialAad("author-a", "anthropic", 1));
    expect(() =>
      open(sealed, KEY_A, credentialAad("author-a", "google", 1))
    ).toThrow(SealError);
  });

  it("refuses a row whose keyVersion was edited to fake a rotation", () => {
    const sealed = seal(SECRET, KEY_A, credentialAad("author-a", "anthropic", 1));
    expect(() =>
      open(sealed, KEY_A, credentialAad("author-a", "anthropic", 2))
    ).toThrow(SealError);
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    sealed.ciphertext[0] ^= 0x01;
    expect(() => open(sealed, KEY_A, AAD)).toThrow(SealError);
  });

  it("refuses a tampered auth tag", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    sealed.authTag[0] ^= 0x01;
    expect(() => open(sealed, KEY_A, AAD)).toThrow(SealError);
  });

  it("refuses a tampered IV", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    sealed.iv[0] ^= 0x01;
    expect(() => open(sealed, KEY_A, AAD)).toThrow(SealError);
  });

  it("names the field when a stored part is the wrong size", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    expect(() => open({ ...sealed, iv: Buffer.alloc(8) }, KEY_A, AAD))
      .toThrow(/iv is 8 bytes/);
    expect(() => open({ ...sealed, authTag: Buffer.alloc(8) }, KEY_A, AAD))
      .toThrow(/authTag is 8 bytes/);
  });

  it("says nothing about the plaintext when it refuses", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    sealed.authTag[0] ^= 0x01;
    try {
      open(sealed, KEY_A, AAD);
      expect.unreachable("open should have thrown");
    } catch (error) {
      const text = `${(error as Error).message}${(error as Error).stack ?? ""}`;
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(sealed.ciphertext.toString("base64"));
    }
  });
});

describe("key length", () => {
  // The plan's phase-1 acceptance: wrong key material is refused at the door,
  // as a KeyringError (the deployment is misconfigured) rather than a SealError
  // (this row is bad) — the two want different operator responses.
  it("refuses a short key when sealing", () => {
    expect(() => seal(SECRET, Buffer.alloc(16, 1), AAD)).toThrow(KeyringError);
    expect(() => seal(SECRET, Buffer.alloc(16, 1), AAD))
      .toThrow(/16 bytes, expected 32/);
  });

  it("refuses a short key when opening", () => {
    const sealed = seal(SECRET, KEY_A, AAD);
    expect(() => open(sealed, Buffer.alloc(31, 1), AAD)).toThrow(KeyringError);
  });
});

describe("last4", () => {
  it("takes the trailing four characters", () => {
    expect(last4("sk-ant-0000abcd")).toBe("abcd");
  });

  it("refuses a secret too short to mask", () => {
    expect(last4("a".repeat(MIN_SECRET_LENGTH))).toBe("aaaa");
    expect(() => last4("a".repeat(MIN_SECRET_LENGTH - 1))).toThrow(KeyringError);
    expect(() => last4("")).toThrow(KeyringError);
  });
});

describe("credentialAad", () => {
  it("distinguishes every field it binds", () => {
    const base = credentialAad("author-a", "anthropic", 1);
    expect(base).not.toBe(credentialAad("author-b", "anthropic", 1));
    expect(base).not.toBe(credentialAad("author-a", "google", 1));
    expect(base).not.toBe(credentialAad("author-a", "anthropic", 2));
  });
});
