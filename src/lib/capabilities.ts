import type { User } from "@/types";

/**
 * What the current session is allowed to do.
 *
 * Guests keep a deliberately small surface: local drafts in IndexedDB, their
 * revision history, backing those up, and viewing published posts. Everything
 * that needs a server — organising posts, sharing, publishing, collaborating —
 * is signed-in only.
 *
 * This exists so the guest/member boundary is stated once rather than as ~20
 * scattered `if (!user)` checks. Prefer *hiding* an unavailable affordance over
 * rendering it disabled: a guest has no path to enable it in place, so a disabled
 * control is just noise.
 */
interface Capabilities {
  /** Group posts into series. */
  series: boolean;
  /** Group series into projects. */
  projects: boolean;
  /** Share links, visibility settings. */
  share: boolean;
  /** Publish a post publicly. */
  publish: boolean;
  /** Invite coauthors / collaborative editing. */
  coauthors: boolean;
  /** Download a post, and the bulk backup/restore panel. */
  exportImport: boolean;
  /** Server-rendered post thumbnails. */
  thumbnails: boolean;
  /** Browse and restore previous revisions. */
  revisions: boolean;
  /** Storage usage reporting. */
  storageUsage: boolean;
}

export function capabilities(user?: User | null): Capabilities {
  const signedIn = !!user;
  return {
    series: signedIn,
    projects: signedIn,
    share: signedIn,
    publish: signedIn,
    coauthors: signedIn,
    // Bundling a backup runs entirely in the browser, and a guest's posts exist
    // nowhere but this IndexedDB — export is their only way to get work out, so
    // withholding it would strand it. The panel's cloud half disables itself.
    exportImport: true,
    thumbnails: signedIn,
    // Guests keep local revision history — it is backed by the IndexedDB
    // `revisions` store and needs no server.
    revisions: true,
    storageUsage: signedIn,
  };
}
