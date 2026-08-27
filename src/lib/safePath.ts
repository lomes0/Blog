import path from "path";

/**
 * Resolving a caller-supplied name inside a directory it must not escape.
 *
 * Two places take a filename from outside the app and turn it into a path on
 * disk: the attachment routes (from the URL) and the backup importer (from
 * inside an uploaded zip). Both need the same guarantee, and the importer did
 * not have it — it passed archive entry names straight to `path.join`, so a
 * bundle containing `../../server.js` would write wherever it liked. Zip
 * entries are attacker-controlled even when the uploader is authenticated, so
 * the name is treated as hostile regardless of who sent it.
 */

/**
 * The last path segment of `name`, with anything that could traverse removed.
 * Returns null when nothing usable is left — an empty name, a bare `.`/`..`, or
 * a value that was only separators.
 *
 * **Private on purpose.** It was exported while the backup importer needed a
 * bare basename to look an entry up *inside* a zip, where there is no directory
 * to resolve against; that caller went with the background images
 * (docs/plans/blob-storage.md §10.2). Every remaining path from a hostile name
 * to the disk ends in a real directory, so `resolveWithin` is the entry point
 * and its second check — re-resolving against `dir` — is not optional. Exporting
 * this again would make it possible to take the first half of the guarantee
 * without the second.
 */
function safeBasename(name: string): string | null {
  // Normalise Windows separators first: path.basename on POSIX treats a
  // backslash as an ordinary character, so `..\..\x` would survive intact.
  const flattened = name.replace(/\\/g, "/");
  const base = path.posix.basename(flattened).trim();
  if (!base || base === "." || base === "..") return null;
  // Leading dots are legal in filenames, but a name that is *only* dots is not
  // something we want to create.
  if (/^\.+$/.test(base)) return null;
  return base;
}

/**
 * Resolve `name` inside `dir`, or null if it does not belong there.
 *
 * The basename is taken first so traversal cannot be expressed at all, then the
 * resolved path is re-checked against `dir` as a backstop — belt and braces,
 * because the cost of being wrong here is an arbitrary file write.
 */
export function resolveWithin(dir: string, name: string): string | null {
  const base = safeBasename(name);
  if (!base) return null;
  const root = path.resolve(dir);
  const resolved = path.resolve(root, base);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
