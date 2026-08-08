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
 *   3. A raw color literal in a `.css.ts` file. Vanilla-extract styles are
 *      TypeScript, so nothing about `color: '#0f172a'` looks like CSS to any
 *      other tool in the repo — and it responds to the toggle exactly as well
 *      as a `[theme="dark"]` rule does, which is to say not at all. Colors in
 *      the editor package come through `vars.*` from the token contract, which
 *      is the single file exempted here.
 *
 * `[data-theme="dark"]` is banned for the same reason as `[theme="dark"]`, and
 * is listed separately because it is not a hypothetical: it is how haklex's own
 * `.css.ts` files spell the dark scheme (docs/plans/haklex-adoption.md §5.2),
 * and phase 2 ports their component code. Nothing in this app sets that
 * attribute, so a paste that keeps it must fail loudly rather than match
 * nothing.
 *
 * The scheme selector is `html.dark` — the class MUI writes via
 * InitColorSchemeScript (layout.tsx) and colorSchemeSelector: "class"
 * (ThemeProvider.tsx). `prefers-color-scheme` is not a synonym: it reads the OS
 * preference and ignores the in-app toggle, so a rule keyed to it disagrees
 * with the rest of the app the moment a reader overrides the theme.
 *
 * Usage:
 *   node scripts/check-theme.mjs          # analyse all src+packages CSS
 *   node scripts/check-theme.mjs --list   # also print every html.dark rule found
 *
 * Exit code: 0 = clean, 1 = violations found.
 */

import fg from "fast-glob";
import { existsSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { fileURLToPath } from "url";

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// `packages/**` is listed alongside `src/**` ahead of the editor extraction
// (docs/plans/haklex-adoption.md §4.3): the moment `src/editor/theme.css` moves
// to a workspace package, a src-rooted glob goes green by checking nothing.
//
// `*.css.ts` is listed separately because `*.css` does not match it. Without
// these two entries this checker goes blind the moment a style becomes
// vanilla-extract — which is the failure it exists to prevent, one file
// extension later.
const CSS_PATTERNS = ["src/**/*.css", "packages/**/*.css"];
const CSS_TS_PATTERNS = ["src/**/*.css.ts", "packages/**/*.css.ts"];
const PATTERNS = [...CSS_PATTERNS, ...CSS_TS_PATTERNS];

/**
 * The one `.css.ts` file allowed to contain raw color literals, because it is
 * where the light/dark pair is *defined*. Hard-coded rather than inferred: if
 * the contract moves and this path stops resolving, the run below fails with an
 * instruction instead of silently exempting nothing (or, worse, exempting a
 * file that no longer defines anything).
 */
const CONTRACT = "packages/editor/src/styles/tokens.css.ts";

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
  {
    id: "dead-data-theme-attribute",
    pattern: /\[data-theme\s*[~|^$*]?=/g,
    message:
      "`[data-theme=\"dark\"]` is how haklex spells the dark scheme; nothing in this app sets that attribute, so the rule would match nothing. Use `html.dark`.",
  },
  {
    id: "raw-color-in-css-ts",
    // `#rgb`…`#rrggbbaa`, and any rgb()/hsl() that is not the
    // `rgba(var(--…Channel) / a)` form — that one *is* scheme-aware, because
    // the channel variable it reads flips with `html.dark`.
    pattern: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*(?!var\(--)/g,
    appliesTo: (rel) => rel.endsWith(".css.ts") && rel !== CONTRACT,
    message:
      `A literal color in a .css.ts file cannot respond to the theme toggle — nothing re-declares it under \`html.dark\`. Take it from the token contract (\`vars.color.*\`, ${CONTRACT}); if the value genuinely differs by scheme, it belongs *in* the contract. \`rgba(var(--…Channel) / a)\` is allowed.`,
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

/**
 * `.css.ts` files are TypeScript, so they also carry `//` comments — and the
 * reasoning for a token is exactly the place a banned literal gets written down
 * (`/** default: '#000' *\/`, all through haklex's contract). Skip a `//` that
 * follows a `:`, so a `https://` inside a url() or a string is not mistaken for
 * one.
 */
function stripLineComments(src) {
  return src.replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) =>
    lead + m.slice(lead.length).replace(/[^\n]/g, " "),
  );
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

/**
 * Rot guards. Every one of these is a way this script could go green while
 * checking nothing — the same failure as the `[theme="dark"]` rules it was
 * written about, one level up. `58ddac8c` added the `packages/**` globs for
 * exactly this reason; these make the `.css.ts` half as hard to blind.
 */
function fatal(message) {
  console.error(`check-theme: ${message}`);
  process.exit(1);
}

if (!existsSync(resolve(ROOT, CONTRACT))) {
  fatal(
    `token contract not found at \`${CONTRACT}\` — it moved or was renamed. ` +
      `Repoint CONTRACT in scripts/check-theme.mjs; until then the raw-color ` +
      `rule is exempting a file that does not exist.`,
  );
}

if (!readFileSync(resolve(ROOT, CONTRACT), "utf8").includes("html.dark")) {
  fatal(
    `\`${CONTRACT}\` contains no \`html.dark\` block. The vanilla-extract dark ` +
      `contract is what makes every \`vars.color.*\` respond to the in-app ` +
      `toggle (DESIGN.md §19.1); without it the editor renders light in both ` +
      `schemes and every other rule here passes.`,
  );
}

const cssTsFiles = await fg(CSS_TS_PATTERNS, { cwd: ROOT, absolute: true });
if (cssTsFiles.length === 0) {
  fatal(
    `the \`*.css.ts\` globs matched no files, but \`${CONTRACT}\` exists — so ` +
      `the glob is wrong, not the tree. Check CSS_TS_PATTERNS.`,
  );
}

const files = await fg(PATTERNS, { cwd: ROOT, absolute: true });
const violations = [];
let darkRuleCount = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const src = rel.endsWith(".css.ts")
    ? stripLineComments(stripComments(raw))
    : stripComments(raw);

  darkRuleCount += (src.match(/html\.dark/g) ?? []).length;

  for (const rule of RULES) {
    if (rule.appliesTo && !rule.appliesTo(rel)) continue;
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
    `Scanned ${files.length} files (${cssTsFiles.length} .css.ts) · ${darkRuleCount} \`html.dark\` rules`,
  );
}

if (violations.length === 0) {
  console.warn(
    `check-theme: clean — ${files.length} style files (${cssTsFiles.length} .css.ts), no scheme-invariant colors.`,
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
