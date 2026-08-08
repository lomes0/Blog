/**
 * The attachment drawer's own helper.
 *
 * `isEditable` and `formatFileSize` used to live here as a second copy of
 * `@/utils/languageDetection`'s write policy and `@/utils/formatSize`
 * respectively. Import those directly; only URL parsing is local to the drawer.
 */
export function extractFilename(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1];
}
