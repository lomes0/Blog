#!/usr/bin/env node
/**
 * Color-scheme conformance checker (DESIGN.md §19)
 *
 * Guards the two ways a color has silently failed to respond to the active
 * scheme in this codebase. Both shipped, both survived review, and neither is
 * visible by reading the rule that contains it:
 *
 *   1. A dark rule keyed to a selector nothing sets. `[theme="dark"]` was the
 *      canonical form until the color-theme toggle was removed in bc20ee77
 *      (Jul 2024) along with the component that set the attribute. The rules
 *      stayed, matched nothing for two years, and 0adc7ae7 then deleted the
 *      `@media (prefers-color-scheme: dark)` block that had been doing the
 *      real work — as a "duplicate" of rules that were already dead. Editor
 *      content rendered light in both schemes until 277c9db7.
 *
 *   2. `--mui-palette-grey-*`. MUI's grey scale is spread once at the top of
 *      createPalette, outside the light/dark blocks, so grey.50 is #fafafa in
 *      both schemes. The TSX side of this is caught by no-restricted-syntax in
 *      eslint.config.mjs; this covers the CSS-var spelling.
 *
 * The scheme selector is `html.dark` — the class MUI writes via
 * InitColorSchemeScript (layout.tsx) and colorSchemeSelector: "class"
 * (ThemeProvider.tsx). `prefers-color-scheme` is not a synonym: it reads the OS
 * preference and ignores the in-app toggle, so a rule keyed to it disagrees
 * with the rest of the app the moment a reader overrides the theme.
 *
 * Usage:
 *   node scripts/check-theme.mjs          # analyse all src/**\/*.css
 *   node scripts/check-theme.mjs --list   # also print every html.dark rule found
 *
 * Exit code: 0 = clean, 1 = violations found.
 */

import fg from "fast-glob";
import { readFileSync } from "fs";
import { relative, resolve } from "path";
import { fileURLToPath } from "url";

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// `packages/**` is listed alongside `src/**` ahead of the editor extraction
// (docs/plans/haklex-adoption.md §4.3): the moment `src/editor/theme.css` moves
// to a workspace package, a src-rooted glob goes green by checking nothing.
const PATTERNS = ["src/**/*.css", "packages/**/*.css"];

/**
 * Each rule reports on the comment-stripped source, so this file's own prose
 * and the explanatory comments in theme.css do not trip their own checks.
 */
const RULES = [
  {
    id: "dead-theme-attribute",
    pattern: /\[theme\s*[~|^$*]?=/g,
    message:
      'Dark rules keyed to `[theme="dark"]` match nothing — no component has set that attribute since bc20ee77 (Jul 2024). Use `html.dark`.',
  },
  {
    id: "prefers-color-scheme",
    pattern: /prefers-color-scheme/g,
    message:
      "`prefers-color-scheme` reads the OS preference and ignores the in-app theme toggle. Use `html.dark`, which MUI keeps in sync with both.",
  },
  {
    id: "scheme-invariant-grey",
    pattern: /--mui-palette-grey-\d+/g,
    message:
      "MUI's grey scale is the same in both schemes (grey.50 is #fafafa in dark too). Use --mui-palette-{background,action,text,divider}-* instead.",
  },
];

// ─── Source handling ─────────────────────────────────────────────────────────

/**
 * Blank out `/* … *\/` comments while preserving byte offsets and newlines, so
 * a match's line number still points at the real line. Documenting a banned
 * pattern must not be an error — several of these rules exist precisely
 * because the reasoning was written down next to them.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const files = await fg(PATTERNS, { cwd: ROOT, absolute: true });
const violations = [];
let darkRuleCount = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = stripComments(raw);
  const rel = relative(ROOT, file);

  darkRuleCount += (src.match(/html\.dark/g) ?? []).length;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m;
    while ((m = rule.pattern.exec(src)) !== null) {
      violations.push({
        file: rel,
        line: lineOf(src, m.index),
        text: m[0],
        rule,
      });
    }
  }
}

if (process.argv.includes("--list")) {
  console.warn(
    `Scanned ${files.length} CSS files · ${darkRuleCount} \`html.dark\` rules`,
  );
}

if (violations.length === 0) {
  console.warn(
    `check-theme: clean — ${files.length} CSS files, no scheme-invariant colors.`,
  );
  process.exit(0);
}

const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule.id)) byRule.set(v.rule.id, []);
  byRule.get(v.rule.id).push(v);
}

console.error(
  `check-theme: ${violations.length} violation(s) in ${byRule.size} rule(s)\n`,
);
for (const [id, list] of byRule) {
  console.error(`  ${id} — ${list[0].rule.message}`);
  for (const v of list) {
    console.error(`    ${v.file}:${v.line}  ${v.text}`);
  }
  console.error("");
}
process.exit(1);
