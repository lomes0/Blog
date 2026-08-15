/**
 * Parsing the key-encryption keys — docs/plans/archive/byo-provider-keys.md §4.2.
 *
 * This is operator-supplied text that decides whether every stored credential
 * in the deployment can be opened, so the interesting cases are all the ways it
 * can be *nearly* right: a key that decodes to a plausible length but is not the
 * key that was generated, a version that names nothing, two entries claiming the
 * same version. Each of those, left unchecked, surfaces weeks later as rows that
 * will not open, with nothing pointing at the variable that caused it.
 */
import { KEY_BYTES, KeyringError } from "../crypto";
import { currentKey, keyFor, parseKeyring } from "../keyring";

/** A valid entry, without randomness. */
const encoded = (fill: number) => Buffer.alloc(KEY_BYTES, fill).toString("base64");

const V1 = encoded(0x11);
const V2 = encoded(0x22);

describe("a single key", () => {
  it("needs no version variable — there is no choice to make", () => {
    const keyring = parseKeyring(`1:${V1}`);
    expect(keyring.currentVersion).toBe(1);
    expect(currentKey(keyring)).toEqual(Buffer.alloc(KEY_BYTES, 0x11));
  });

  it("does not have to be version 1", () => {
    // A deployment that has rotated and dropped the old key is left holding one
    // entry numbered 7, and that is a valid state rather than an error.
    expect(parseKeyring(`7:${V1}`).currentVersion).toBe(7);
  });

  it("tolerates the whitespace a multi-line .env picks up", () => {
    expect(parseKeyring(`  1:${V1}  ,  `).currentVersion).toBe(1);
  });
});

describe("several keys", () => {
  it("seals under the version it is told to", () => {
    const keyring = parseKeyring(`1:${V1},2:${V2}`, "2");
    expect(keyring.currentVersion).toBe(2);
    expect(currentKey(keyring)).toEqual(Buffer.alloc(KEY_BYTES, 0x22));
    // The point of the set: the retired key is still openable.
    expect(keyFor(keyring, 1)).toEqual(Buffer.alloc(KEY_BYTES, 0x11));
  });

  it("refuses to guess which one is current", () => {
    // Guessing (highest? first?) would silently decide which key a leak
    // exposes, which is not a decision to make on the operator's behalf.
    expect(() => parseKeyring(`1:${V1},2:${V2}`)).toThrow(KeyringError);
    expect(() => parseKeyring(`1:${V1},2:${V2}`))
      .toThrow(/must say which of the 2 keys/);
  });

  it("refuses a current version it does not define", () => {
    expect(() => parseKeyring(`1:${V1},2:${V2}`, "3"))
      .toThrow(/is 3, which AI_CREDENTIAL_KEYS does not define/);
  });

  it("refuses a duplicated version", () => {
    expect(() => parseKeyring(`1:${V1},1:${V2}`, "1"))
      .toThrow(/declares version 1 twice/);
  });
});

describe("malformed key material", () => {
  it("refuses an unset or empty value, and says how to make one", () => {
    expect(() => parseKeyring(undefined)).toThrow(/AI_CREDENTIAL_KEYS is not set/);
    expect(() => parseKeyring("   ")).toThrow(KeyringError);
    expect(() => parseKeyring(undefined)).toThrow(/randomBytes/);
  });

  it("refuses an entry with no version prefix", () => {
    expect(() => parseKeyring(V1)).toThrow(/no version prefix/);
  });

  it("refuses a version that is not a positive integer", () => {
    expect(() => parseKeyring(`v1:${V1}`)).toThrow(/numbered "v1"/);
    expect(() => parseKeyring(`0:${V1}`)).toThrow(/numbered "0"/);
    expect(() => parseKeyring(`1.5:${V1}`)).toThrow(/numbered "1.5"/);
    expect(() => parseKeyring(`1:${V1}`, "nope")).toThrow(/is "nope"/);
  });

  it("refuses a key of the wrong length, naming the version", () => {
    const short = Buffer.alloc(16, 1).toString("base64");
    expect(() => parseKeyring(`2:${short}`))
      .toThrow(/version 2 decodes to 16 bytes, expected 32/);
  });

  it("refuses an entry with no key material", () => {
    expect(() => parseKeyring("1:")).toThrow(/version 1 has no key material/);
  });

  it("refuses base64url, which Node would otherwise decode silently", () => {
    // The real mistake this catches: `Buffer.from(…, "base64")` accepts the
    // url-safe alphabet, so a key that went through a URL-safe encoder decodes
    // to 32 bytes of *something* and passes every other check.
    const urlSafe = encoded(0xff).replace(/\//g, "_").replace(/\+/g, "-");
    expect(urlSafe).not.toBe(encoded(0xff));
    expect(Buffer.from(urlSafe, "base64")).toHaveLength(KEY_BYTES);
    expect(() => parseKeyring(`1:${urlSafe}`)).toThrow(/not canonical base64/);
  });

  it("refuses unpadded base64 too, which is stricter than necessary on purpose", () => {
    // Unpadded is a legitimate spelling and decodes to the same key. It is
    // refused anyway, because "canonical or nothing" is a rule an operator can
    // hold — and the error prints the exact command that produces a canonical
    // one, so the fix is a copy-paste rather than a judgement call.
    expect(() => parseKeyring(`1:${V1.replace(/=+$/, "")}`))
      .toThrow(/not canonical base64/);
  });
});

describe("keyFor", () => {
  it("refuses a version the process does not hold, and says what that means", () => {
    const keyring = parseKeyring(`2:${V2}`);
    // The state after dropping a key too early: rows still name version 1.
    expect(() => keyFor(keyring, 1)).toThrow(/No key for version 1/);
    expect(() => keyFor(keyring, 1)).toThrow(/must re-enter it/);
  });
});
