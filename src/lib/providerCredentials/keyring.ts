/**
 * Where the key-encryption keys come from —
 * docs/plans/archive/byo-provider-keys.md §4.2.
 *
 * A single `AI_CREDENTIAL_KEY` would make rotation a flag day: there would be
 * no moment at which both the old and the new key are available, so every row
 * would have to be re-sealed inside the same deploy that changes the variable.
 * A *versioned set* removes that — a new key is appended, new writes use it,
 * and existing rows keep naming the version that sealed them until a background
 * pass moves them.
 *
 *     AI_CREDENTIAL_KEYS="1:Base64OfV1,2:Base64OfV2"
 *     AI_CREDENTIAL_KEY_VERSION="2"
 *
 * `parseKeyring` is separated from `loadKeyring` for the usual reason: parsing
 * operator-supplied text is where the mistakes are, and it should be testable
 * without setting process-wide variables.
 */
import { KEY_BYTES, KeyringError } from "./crypto";

export interface Keyring {
  /** The version new writes seal under. */
  currentVersion: number;
  /** Every version this process can open, including the current one. */
  keys: ReadonlyMap<number, Buffer>;
}

export const KEYS_ENV = "AI_CREDENTIAL_KEYS";
export const VERSION_ENV = "AI_CREDENTIAL_KEY_VERSION";

/**
 * Parse the two variables into a keyring, or explain what is wrong with them.
 *
 * Every refusal names the offending version rather than saying "invalid", since
 * the whole point of the format is that there is more than one key in it and
 * "one of your keys is malformed" is not an actionable sentence.
 *
 * `currentVersionSpec` may be omitted when exactly one key is configured — the
 * common case is a deployment that has never rotated, and making it name the
 * version it has no choice about is ceremony. With two or more it is required,
 * because guessing (highest? first?) would silently decide which key a leak
 * exposes.
 */
export function parseKeyring(
  keysSpec: string | undefined,
  currentVersionSpec?: string | undefined,
): Keyring {
  const raw = keysSpec?.trim();
  if (!raw) {
    throw new KeyringError(
      `${KEYS_ENV} is not set. Generate one with: ` +
        `node -e 'console.log("1:" + require("node:crypto").randomBytes(${KEY_BYTES}).toString("base64"))'`,
    );
  }

  const keys = new Map<number, Buffer>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    // `indexOf` rather than `split`, because base64 has no colon but a
    // misconfigured value might, and the version is only ever the first field.
    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      throw new KeyringError(
        `${KEYS_ENV} entries must be "version:base64" — found an entry with no version prefix`,
      );
    }

    const versionText = trimmed.slice(0, separator).trim();
    const version = Number(versionText);
    if (!Number.isInteger(version) || version < 1) {
      throw new KeyringError(
        `${KEYS_ENV} has a key numbered "${versionText}"; versions are positive integers`,
      );
    }
    if (keys.has(version)) {
      throw new KeyringError(
        `${KEYS_ENV} declares version ${version} twice`,
      );
    }
    keys.set(version, decodeKey(version, trimmed.slice(separator + 1).trim()));
  }

  if (keys.size === 0) {
    throw new KeyringError(`${KEYS_ENV} is set but contains no keys`);
  }

  const currentVersion = resolveCurrentVersion(keys, currentVersionSpec);
  return { currentVersion, keys };
}

/** The key that sealed a given row, or a refusal naming the version it wants. */
export function keyFor(keyring: Keyring, version: number): Buffer {
  const key = keyring.keys.get(version);
  if (!key) {
    throw new KeyringError(
      `No key for version ${version} in ${KEYS_ENV}. A credential sealed under ` +
        `a retired key cannot be opened; the owner must re-enter it.`,
    );
  }
  return key;
}

/** The key new writes seal under. */
export const currentKey = (keyring: Keyring): Buffer =>
  keyFor(keyring, keyring.currentVersion);

let cached: Keyring | undefined;

/**
 * The process's keyring, parsed once.
 *
 * Memoised because this is on the path of every completion and the parse is
 * pure — but the throw is *not* cached, so a deployment that fixes the variable
 * without restarting recovers. That matters more than the saved microsecond:
 * the failure mode this guards is an operator staring at a corrected `.env` and
 * a process still refusing.
 */
export function loadKeyring(): Keyring {
  if (!cached) {
    cached = parseKeyring(process.env[KEYS_ENV], process.env[VERSION_ENV]);
  }
  return cached;
}

function decodeKey(version: number, encoded: string): Buffer {
  if (!encoded) {
    throw new KeyringError(`${KEYS_ENV} version ${version} has no key material`);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES) {
    throw new KeyringError(
      `${KEYS_ENV} version ${version} decodes to ${key.length} bytes, expected ${KEY_BYTES}`,
    );
  }
  // `Buffer.from(…, "base64")` discards characters it does not recognise rather
  // than failing, so a key pasted in base64url — or one that lost a character
  // on the way into a secrets manager — can still decode to a plausible length
  // and then silently be the wrong key. Re-encoding is how that gets caught at
  // load instead of as an unopenable row six weeks later.
  if (key.toString("base64") !== encoded) {
    throw new KeyringError(
      `${KEYS_ENV} version ${version} is not canonical base64; it may have been ` +
        `truncated or pasted in base64url`,
    );
  }
  return key;
}

function resolveCurrentVersion(
  keys: ReadonlyMap<number, Buffer>,
  spec: string | undefined,
): number {
  const trimmed = spec?.trim();
  if (!trimmed) {
    if (keys.size === 1) return [...keys.keys()][0];
    throw new KeyringError(
      `${VERSION_ENV} must say which of the ${keys.size} keys in ${KEYS_ENV} new ` +
        `credentials are sealed under`,
    );
  }
  const version = Number(trimmed);
  if (!Number.isInteger(version) || version < 1) {
    throw new KeyringError(
      `${VERSION_ENV} is "${trimmed}"; versions are positive integers`,
    );
  }
  if (!keys.has(version)) {
    throw new KeyringError(
      `${VERSION_ENV} is ${version}, which ${KEYS_ENV} does not define`,
    );
  }
  return version;
}
