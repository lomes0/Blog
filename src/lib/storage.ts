import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";

/**
 * The blob store: bytes addressed by the SHA-256 of their own content.
 *
 * See docs/plans/blob-storage.md. Two properties of content addressing are load
 * bearing here rather than incidental:
 *
 * - **Writes are idempotent by construction.** The key *is* the content, so
 *   re-uploading the same bytes is a no-op rather than a conflict, and two
 *   concurrent uploads of the same image cannot race into different objects.
 * - **Objects are immutable.** A given key's bytes never change, which is what
 *   makes `immutable` caching unconditionally safe for anything servable — no
 *   invalidation problem exists.
 *
 * ## One bucket, not two
 *
 * The plan (§7) originally carried over the two-bucket public/private split from
 * `archive/storage-uploads.md`. That does not survive content addressing, for the
 * same reason §4 gives for ACLs: a blob deduplicated across a published post and
 * a private draft belongs in *both* buckets, and would have to be moved whenever
 * either document's visibility changed. Bucket placement is per-blob; visibility
 * is per-document; deduplication severs the two.
 *
 * So: one private bucket, and `/api/blob/[hash]` decides cacheability per
 * request from the *documents* referencing the blob. Public content still gets
 * CDN-cached — by Cloudflare, off the immutable response — without the store
 * having to model an access rule it cannot see.
 */

const endpoint = process.env.S3_ENDPOINT || undefined;
const region = process.env.S3_REGION || "auto";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";

/** The one bucket. See the docblock above for why there is not a second. */
export const BLOB_BUCKET = process.env.S3_BUCKET || "blog-blobs";

/**
 * `||` rather than `??` throughout: `.env.example` ships every key as `""`, so a
 * copied-but-unedited env file must fall through to the default rather than
 * configure the client with an empty string. Same reasoning as
 * `src/lib/uploads.ts`.
 */
export const isStorageConfigured = (): boolean =>
  !!endpoint && !!accessKeyId && !!secretAccessKey;

let client: S3Client | null = null;

/**
 * The S3 client, built once.
 *
 * Deliberately lazy: constructing it at module scope would run during
 * `next build`, where none of these variables are set, and turn a missing
 * credential into a build failure rather than a runtime error on the one route
 * that needs it. The blob route is the only caller, and it is dynamic.
 */
function s3(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "Blob storage is not configured — set S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  }
  client ??= new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // MinIO and most non-AWS endpoints address buckets by path, not by
    // subdomain. R2 accepts either.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  });
  return client;
}

/** Lowercase hex SHA-256 of `bytes` — the key this module addresses by. */
export function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 64 lowercase hex characters, and nothing else. */
const HASH_RE = /^[0-9a-f]{64}$/;

/**
 * Whether `hash` is well-formed.
 *
 * This is the key-space equivalent of the traversal check on the filesystem
 * path it replaces. `resolveWithin` had something to assert — that a resolved
 * path stayed inside a directory — and an object key space does not: `a/../b`
 * is simply a key. So the defence has to move to *constructing* the key, which
 * is why every entry point validates rather than sanitising. See
 * blob-storage.md §4 and the note in `archive/storage-uploads.md` §Security.
 */
export const isValidHash = (hash: string): boolean => HASH_RE.test(hash);

/** The object key for a blob. Flat: the hash is already uniformly distributed. */
const keyFor = (hash: string): string => {
  if (!isValidHash(hash)) throw new Error(`Invalid blob hash: ${hash}`);
  return hash;
};

/**
 * Store `bytes` under `hash`.
 *
 * The caller is responsible for `hash` being the digest of `bytes`; this does
 * not re-verify, because every caller has just computed it and re-hashing a
 * large upload on the write path is pure cost. Use {@link hashBytes}.
 */
export async function putBlob(
  hash: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: BLOB_BUCKET,
      Key: keyFor(hash),
      Body: bytes,
      ContentType: mimeType,
    }),
  );
}

/** Fetch a blob's bytes. */
export async function getBlob(hash: string): Promise<Buffer> {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
  );
  if (!result.Body) throw new Error(`Blob ${hash} has no body`);
  return Buffer.from(await result.Body.transformToByteArray());
}

/**
 * Whether the object exists in the bucket.
 *
 * Note this asks the *store*, not the database. The `Blob` row and the object
 * can disagree — a crashed upload leaves a row with no object, and a
 * half-finished GC leaves an object with no row — so a caller that needs the
 * truth about bytes must ask here.
 */
export async function blobExists(hash: string): Promise<boolean> {
  try {
    await s3().send(
      new HeadObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
    );
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return false;
    throw error;
  }
}

/**
 * A time-limited URL that serves the blob directly from the store.
 *
 * The authorization decision is made *before* this is called and is not encoded
 * in the URL beyond its expiry — so a signed URL must only ever be handed to a
 * caller `requireBlobRead` has already admitted.
 */
export function presignBlobGet(
  hash: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BLOB_BUCKET, Key: keyFor(hash) }),
    { expiresIn },
  );
}
