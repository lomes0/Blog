import {
  CODE_LANGUAGE_FRIENDLY_NAME_MAP,
  CODE_LANGUAGE_MAP,
  getLanguageFriendlyName,
  normalizeCodeLang,
} from "@lexical/code";

/**
 * Shared helpers describing code-block languages for the editor and view-mode
 * chrome (language pill/glyph + dropdown options). Keeping this in one place
 * means the authoring header and the published article render identical labels.
 */

export interface CodeLanguageGlyph {
  /** 1-3 character badge text, e.g. "JS", "PY", "{ }". */
  text: string;
  /** Badge background color (CSS). */
  bg: string;
  /** Badge foreground color (CSS). */
  fg: string;
}

const DEFAULT_GLYPH_BG = "#1d222a";
const DEFAULT_GLYPH_FG = "#ffffff";

/** Per-language badge text + brand-ish colors. Falls back to initials. */
const GLYPH_MAP: Record<string, CodeLanguageGlyph> = {
  javascript: { text: "JS", bg: "#000000", fg: "#f7df1e" },
  js: { text: "JS", bg: "#000000", fg: "#f7df1e" },
  jsx: { text: "{}", bg: "#1d222a", fg: "#61dafb" },
  typescript: { text: "TS", bg: "#2f74c0", fg: "#ffffff" },
  ts: { text: "TS", bg: "#2f74c0", fg: "#ffffff" },
  tsx: { text: "{}", bg: "#2f74c0", fg: "#ffffff" },
  python: { text: "PY", bg: "#2b5b84", fg: "#ffd13f" },
  py: { text: "PY", bg: "#2b5b84", fg: "#ffd13f" },
  java: { text: "JV", bg: "#e76f00", fg: "#ffffff" },
  c: { text: "C", bg: "#5c6bc0", fg: "#ffffff" },
  cpp: { text: "C++", bg: "#00599c", fg: "#ffffff" },
  csharp: { text: "C#", bg: "#68217a", fg: "#ffffff" },
  go: { text: "GO", bg: "#00add8", fg: "#ffffff" },
  rust: { text: "RS", bg: "#000000", fg: "#ffffff" },
  ruby: { text: "RB", bg: "#cc342d", fg: "#ffffff" },
  php: { text: "PHP", bg: "#777bb4", fg: "#ffffff" },
  swift: { text: "SW", bg: "#f05138", fg: "#ffffff" },
  kotlin: { text: "KT", bg: "#7f52ff", fg: "#ffffff" },
  css: { text: "#", bg: "#2965f1", fg: "#ffffff" },
  html: { text: "<>", bg: "#e34f26", fg: "#ffffff" },
  markup: { text: "<>", bg: "#e34f26", fg: "#ffffff" },
  markdown: { text: "MD", bg: "#42526e", fg: "#ffffff" },
  md: { text: "MD", bg: "#42526e", fg: "#ffffff" },
  json: { text: "{ }", bg: "#3b3b3b", fg: "#ffffff" },
  yaml: { text: "YML", bg: "#cb171e", fg: "#ffffff" },
  sql: { text: "DB", bg: "#336791", fg: "#ffffff" },
  bash: { text: "$", bg: "#4eaa25", fg: "#ffffff" },
  shell: { text: "$", bg: "#4eaa25", fg: "#ffffff" },
  powershell: { text: "PS", bg: "#012456", fg: "#ffffff" },
  plain: { text: "TXT", bg: "#6b7280", fg: "#ffffff" },
};

/** Friendly display name for a language id (e.g. "javascript" → "JavaScript"). */
export function codeLanguageLabel(language: string | null | undefined): string {
  if (!language) return "Plain Text";
  const normalized = normalizeCodeLang(language);
  return getLanguageFriendlyName(normalized) ||
    CODE_LANGUAGE_FRIENDLY_NAME_MAP[
      normalized as keyof typeof CODE_LANGUAGE_FRIENDLY_NAME_MAP
    ] ||
    language;
}

/** Badge descriptor for a language id, with a sensible initials fallback. */
export function codeLanguageGlyph(
  language: string | null | undefined,
): CodeLanguageGlyph {
  const normalized = normalizeCodeLang(language || "") || "";
  const mapped = GLYPH_MAP[normalized];
  if (mapped) return mapped;
  const text = (normalized || "C").slice(0, 2).toUpperCase();
  return { text, bg: DEFAULT_GLYPH_BG, fg: DEFAULT_GLYPH_FG };
}

/**
 * Ordered [id, friendlyName] options for the language dropdown. Mirrors the
 * list previously built inside CodeTools so behavior is unchanged.
 */
export function getCodeLanguageOptions(): Array<[string, string]> {
  const options: Array<[string, string]> = [];
  for (
    const [lang, friendlyName] of Object.entries(
      CODE_LANGUAGE_FRIENDLY_NAME_MAP,
    )
  ) {
    options.push([lang, friendlyName]);
  }
  options.splice(3, 0, ["csharp", "C#"]);
  options.push(["bash", "Bash"]);
  return options;
}

/** Normalize an arbitrary language alias to its canonical id (e.g. "js" → "javascript"). */
export function canonicalCodeLanguage(
  language: string | null | undefined,
): string {
  if (!language) return "";
  return CODE_LANGUAGE_MAP[language as keyof typeof CODE_LANGUAGE_MAP] ||
    language;
}
