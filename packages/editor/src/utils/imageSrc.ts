/**
 * What may be done with an image `src` that came out of a document.
 *
 * A `src` is not trusted input. It arrives from a paste, an import, an agent
 * write or a stored revision authored years ago, and the image toolbar hands
 * it to `window.open` and to an `<a download>` — two places where a
 * `javascript:` URL is executable rather than decorative. haklex guards the
 * same seam (`rich-renderer-image/src/useImageActions.ts:27-29`); this module
 * is that guard, hardened in two ways and moved somewhere it can be tested.
 *
 * **It is a deny-list there and an allow-list here.** Theirs is
 * `!/^(?:javascript\s*:|vbscript\s*:|data\s*:(?!image\/))/i`, which lets
 * through every scheme nobody thought of — `filesystem:`, `intent:`, and the
 * handful a browser resolves through a registered protocol handler. It also
 * reads the raw string, so a leading NUL or a tab inside the scheme
 * (`java&#9;script:`) slips past a check the browser then resolves anyway.
 * Both are closed below.
 *
 * The cost of the allow-list being wrong is a disabled button, not a broken
 * document: nothing here gates *rendering*, only the actions that hand a URL
 * to the browser. That asymmetry is the whole reason it may be strict.
 *
 * Import-free by design, per the rule `SideBar/dragGeometry.ts` set: the logic
 * lives where it can be exercised without mounting an editor. `URL` is a
 * platform global in both Node and the browser, so it costs nothing here.
 */

/** Schemes an image may carry for us to open or download it. */
const SAFE_SCHEMES = new Set(["http:", "https:", "blob:"]);

/**
 * Everything a browser drops before it resolves a URL: ASCII whitespace and
 * the C0 controls, anywhere in the string, plus DEL. Stripping them is what
 * makes `"\tjava\nscript:alert(1)"` and `" javascript:alert(1)"` read as the
 * scheme they will actually resolve to.
 */
const IGNORED = /[\u0000-\u0020\u007f]/g;

/**
 * A scheme cannot be longer than this in anything we will ever see, and a
 * `data:` image is measured in megabytes — so normalize a prefix rather than
 * the whole string, which is read on every keystroke in the dialog.
 */
const PREFIX = 128;

const normalized = (src: string): string =>
  src.slice(0, PREFIX).replace(IGNORED, "");

/**
 * The scheme a browser would resolve this src with, lower-cased and with its
 * colon, or `null` when the src is relative (`/api/attachments/x.png`) or
 * scheme-relative (`//host/x.png`).
 */
function schemeOf(src: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(normalized(src));
  return match ? `${match[1].toLowerCase()}:` : null;
}

/** True when this src may be handed to the browser at all. */
export function isSafeImageSrc(src: string): boolean {
  const scheme = schemeOf(src);
  if (scheme === null) return true;
  if (SAFE_SCHEMES.has(scheme)) return true;
  // `data:` is allowed only for images — which is not a nicety: every graph
  // and every sketch in this editor stores its whole picture as one.
  return scheme === "data:" && /^data:image\//i.test(normalized(src));
}

/**
 * True when "open in a new tab" will actually show something.
 *
 * Distinct from `isSafeImageSrc` because a `data:` image is safe to download
 * and impossible to open: Chrome has blocked top-level navigation to `data:`
 * since 60, so the tab opens blank. Graph and sketch nodes are always in that
 * case, so this is what decides whether they get the button at all, rather
 * than a button that silently does nothing.
 */
export function isOpenableImageSrc(src: string): boolean {
  return isSafeImageSrc(src) && schemeOf(src) !== "data:";
}

/**
 * True when `<a download>` will save the file rather than navigate to it.
 *
 * The `download` attribute is honoured for same-origin URLs and for `blob:` /
 * `data:`, and **ignored cross-origin** — where the anchor navigates away
 * instead, losing the reader's place in the document. Callers that get `false`
 * have to fetch the bytes themselves, which needs the host to grant CORS.
 *
 * Same-origin is also what makes `/api/attachments/…` work at all: the route
 * is session-gated, and a same-origin download carries the cookie.
 *
 * @param origin `window.location.origin`, passed in so this stays import-free
 *               and testable.
 */
export function isDirectDownloadSrc(src: string, origin: string): boolean {
  const scheme = schemeOf(src);
  if (scheme === "data:" || scheme === "blob:") return true;
  try {
    // Resolves relative and scheme-relative srcs too — `//host/x.png` is
    // cross-origin despite carrying no scheme of its own.
    return new URL(src.trim(), origin).origin === origin;
  } catch {
    return false;
  }
}

/** Windows-illegal path characters, plus the C0 controls. */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]/g;

const DATA_MIME = /^data:image\/([a-z0-9.+-]+)/i;

/** The extension the saved file should carry, or "" when nothing says. */
function extensionOf(src: string): string {
  const mime = DATA_MIME.exec(normalized(src));
  // `image/svg+xml` is the one whose subtype is not its extension.
  if (mime) return mime[1].toLowerCase().replace(/\+xml$/, "");
  const path = src.split(/[?#]/)[0];
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const dot = segment.lastIndexOf(".");
  if (dot <= 0) return "";
  const ext = segment.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

/**
 * What to call the file the reader just asked to download.
 *
 * haklex uses the alt text alone, which produces an extensionless file for
 * every image and a path-traversal-shaped name for any alt text containing a
 * slash. The alt text is still the right stem — it is the only human name the
 * node carries — so it is cleaned rather than replaced, and the extension is
 * recovered from the src.
 */
export function imageFileName(src: string, altText: string): string {
  const stem = altText.replace(UNSAFE_NAME, "").trim().slice(0, 64) || "image";
  const ext = extensionOf(src);
  if (!ext) return stem;
  return stem.toLowerCase().endsWith(`.${ext}`) ? stem : `${stem}.${ext}`;
}
