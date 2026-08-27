import path from "path";

/**
 * Where uploaded files live on disk.
 *
 * The split here is load-bearing, not organisational. Attachments are
 * authorization-gated — `/api/attachments/[filename]` proves read access to the
 * parent document before returning a byte, and maps unknown extensions to
 * `application/octet-stream` with `Content-Disposition: attachment` so a
 * malicious upload is inert. **None of that applies to a file Next serves
 * statically.** While attachments lived under `public/`, every one of them was
 * also readable at `/uploads/attachments/<name>` with no session, no check and
 * no hardening — the filename was the only secret, and filenames are preserved
 * in forks, revision JSON and export bundles.
 *
 * So: anything private on disk must stay outside the static tree, and
 * `UPLOADS_DIR` names that location. There is no second root and nothing here
 * may be moved under `public/` — the rule above is the whole reason this module
 * exists.
 *
 * There used to be a second root, `BACKGROUNDS_DIR` → `public/uploads/directories`,
 * for document background images, and it was the deliberate exception: public by
 * design, served straight off the static tree. It is gone, along with the rest of
 * that feature — see docs/plans/blob-storage.md §10.2. `Document.background_image`
 * survives as an inert column; nothing writes it and nothing renders it.
 */

/**
 * Root for files that must NOT be statically served. Outside `public/`.
 *
 * `||` rather than `??` on purpose: `.env.example` ships every key as `""`, so a
 * copied-but-unedited env file would otherwise resolve to the relative path
 * `attachments/` and write into whatever the cwd happens to be.
 */
const UPLOADS_ROOT = process.env.UPLOADS_DIR ||
  path.join(process.cwd(), "var/uploads");

/**
 * Attachment storage. Private: reachable only through
 * `/api/attachments/[filename]`, which authorizes against the parent document.
 */
export const ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, "attachments");

/**
 * Extensions permitted on an uploaded attachment, lowercased and without the
 * dot. Defence in depth behind `ATTACHMENTS_DIR`: `html`, `svg` and friends are
 * absent because they execute in a browser if they are ever served inline, which
 * is exactly the failure this list exists to survive a recurrence of.
 *
 * An extension outside this set is stored as `.bin`. Nothing is rejected and
 * nothing user-visible changes — the original filename is kept in the
 * attachment metadata for display, and the download route derives its
 * `Content-Type` from the stored extension either way.
 */
export const SAFE_ATTACHMENT_EXTENSIONS = new Set([
  // images
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "tif",
  "tiff",
  // documents
  "pdf",
  "txt",
  "md",
  "rtf",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "log",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "epub",
  // archives
  "zip",
  "tar",
  "gz",
  "bz2",
  "xz",
  "7z",
  "rar",
  // audio / video
  "mp3",
  "wav",
  "ogg",
  "flac",
  "m4a",
  "aac",
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  // source text — inert on download, and the editor renders these as code
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "py",
  "rs",
  "go",
  "java",
  "kt",
  "swift",
  "rb",
  "php",
  "sh",
  "sql",
  "toml",
  "ini",
  "conf",
  "diff",
  "patch",
]);
