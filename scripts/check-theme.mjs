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
 *   4. A color literal in a plain `.css` file that is not *defining* a token.
 *      The same defect as (3), and for two years the largest instance of it —
 *      but it cannot be spelled as a pattern, because a literal in `:root` or
 *      `html.dark` is the one place a literal belongs. See
 *      `color-literal-outside-token-block` below and
 *      docs/plans/theme-css-tokenization.md §2.5 for why this rule is about
 *      position rather than file extension.
 *
 * `[data-theme="dark"]` is banned for the same reason as `[theme="dark"]`, and
 * is listed separately because it is not a hypothetical: it is how haklex's own
 * `.css.ts` files spell the dark scheme (docs/plans/archive/haklex-adoption.md §5.2),
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
// (docs/plans/archive/haklex-adoption.md §4.3): the moment `src/editor/theme.css` moves
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
 * Regions that violate `color-literal-outside-token-block` today and have a
 * plan against them. Deferred, never silenced: the count is printed on every
 * run and `--list` names the sites, so this is a visible debt rather than a
 * hole. An entry that stops suppressing anything is a hard failure (see the rot
 * guards below) — the whole point is that it cannot outlive the work.
 *
 * Match on the *enclosing selector* rather than a line range. The only entry
 * this has ever held covered a region whose own cleanup deleted lines above and
 * inside it on every commit, and a line range would then have exempted whatever
 * drifted in — the failure mode of every allowlist keyed to a position in a
 * file that is being edited.
 *
 * Empty, and kept empty rather than deleted. The one entry
 * (`attachment-card`, docs/plans/theme-css-tokenization.md) retired when its
 * plan's phase 4 landed, which is exactly the rot guard below doing its job:
 * it failed the run the moment the entry stopped suppressing anything. The
 * mechanism is the durable half of that plan and the next region will want it,
 * so what survives here is the shape and the argument for using it, not the
 * debt it was pointed at.
 */
const PENDING = [];

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
  {
    id: "color-literal-outside-token-block",
    appliesTo: (rel) => rel.endsWith(".css") && !rel.endsWith(".css.ts"),
    scan: scanCss,
    message:
      "A color literal in an ordinary rule cannot respond to the theme toggle — only the rule it sits in can, and that means a second rule under `html.dark` restating every property. Declare it as a custom property in a block that declares *only* custom properties (`:root`, `html.dark`, or a component's own palette), and reference it here. A scheme-invariant value goes in such a block too, so that \"this does not change\" is stated rather than inferred (DESIGN.md §19.3).",
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

// ─── The CSS scanner (`color-literal-outside-token-block`) ───────────────────

/**
 * The literal shapes, identical to `raw-color-in-css-ts`: `#rgb`…`#rrggbbaa`,
 * and any `rgb()`/`hsl()` that is not the `rgba(var(--…Channel) / a)` form —
 * that one *is* scheme-aware, because the channel variable it reads flips.
 */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*(?!var\(--)/g;

/**
 * Blank the *fallback* argument of `var(--x, …)`, preserving length so offsets
 * and line numbers still hold.
 *
 * A fallback is not a color choice; it is what renders if a variable that
 * should exist does not. Flagging them would be asking for the fallback to be
 * a variable, which is circular.
 *
 * Whether they should exist at all is a separate question, and
 * docs/plans/theme-css-tokenization.md §4.2 answered it: the eight `--tok-*`
 * defaults inherited from Lexical's stock theme were unreachable — every one
 * is declared on `.LexicalTheme__code`, the only ancestor a
 * `.LexicalTheme__token*` span can have, in both schemes — and are gone. The
 * two `--code-glyph-*` remain, because no rule declares those at all:
 * `nodes/CodeNode/card.ts` sets them inline per language, so the fallback is
 * the real default rather than dead text.
 */
function maskVarFallbacks(src) {
  return src.replace(
    /var\(\s*--[\w-]+\s*,((?:[^()]|\([^()]*\))*)\)/g,
    (m, fallback) =>
      m.slice(0, m.length - fallback.length - 1) +
      fallback.replace(/[^\n]/g, " ") +
      ")",
  );
}

/**
 * Split a stylesheet into brace-delimited blocks, each with its selector text
 * and its own children. Quoted strings are skipped whole, so a `{`, `}` or `;`
 * inside `content: "…"` or an attribute selector does not split anything.
 */
function parseBlocks(src) {
  const all = [];
  const stack = [];
  let i = 0;
  let segStart = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (ch === "{") {
      stack.push({ selStart: segStart, selEnd: i, open: i, children: [] });
      i++;
      segStart = i;
      continue;
    }
    if (ch === "}") {
      const block = stack.pop();
      if (block) {
        block.close = i;
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(block);
        all.push(block);
      }
      i++;
      segStart = i;
      continue;
    }
    if (ch === ";") {
      i++;
      segStart = i;
      continue;
    }
    i++;
  }

  // An unbalanced file is a syntax error the build will report; close what is
  // open so this checker still reports on the part it could read.
  while (stack.length) {
    const block = stack.pop();
    block.close = src.length;
    all.push(block);
  }
  return all;
}

/**
 * A block's own declarations — everything at its top level, with nested blocks
 * and the selector text that introduces them removed. That removal is what
 * keeps `.LexicalTheme__image svg [fill="#ffffff"]` (theme.css) out of the
 * results: a hex inside a selector is matching someone else's markup, not
 * choosing a color, and it is not tokenizable at all.
 */
function directDeclarations(src, block) {
  const decls = [];
  const children = [...block.children].sort((a, b) => a.open - b.open);
  let childIndex = 0;
  let i = block.open + 1;
  let segStart = i;

  const push = (end) => {
    const text = src.slice(segStart, end);
    if (text.includes(":")) decls.push({ start: segStart, end, text });
  };

  while (i < block.close) {
    const child = children[childIndex];
    if (child && i === child.open) {
      // `segStart … child.open` is the child's selector, not a declaration.
      i = child.close + 1;
      segStart = i;
      childIndex++;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < block.close && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (ch === ";") {
      push(i);
      i++;
      segStart = i;
      continue;
    }
    i++;
  }
  push(block.close);
  return decls;
}

const CUSTOM_PROPERTY = /^\s*--[\w-]+\s*:/;

/**
 * Report every color literal that is not *defining* a token.
 *
 * Allowed: the value of a `--custom-property` declaration, in a block whose
 * declarations are all custom properties. Both halves matter. The first is what
 * makes a color a name that a second block can reassign; the second is what
 * keeps a palette a palette — a block that mixes `--code-bg: #fff` with
 * `font-family:` is one where the next literal added reads as belonging, and
 * `theme.css:116` was exactly that block.
 *
 * Deliberately *not* checked: that a token defined outside `html.dark` has a
 * twin inside it. That is the stronger rule and it is worth having, but four of
 * the current `--code-*` values are scheme-invariant washes with no twin by
 * design, so it needs an opt-out marker before it can be turned on.
 */
function scanCss(raw) {
  const src = maskVarFallbacks(raw);
  const found = [];

  for (const block of parseBlocks(src)) {
    const decls = directDeclarations(src, block);
    if (decls.length === 0) continue;
    const isTokenBlock = decls.every((d) => CUSTOM_PROPERTY.test(d.text));
    if (isTokenBlock) continue;

    const selector = src.slice(block.selStart, block.selEnd).trim();
    for (const decl of decls) {
      COLOR_LITERAL.lastIndex = 0;
      let m;
      while ((m = COLOR_LITERAL.exec(decl.text)) !== null) {
        found.push({
          index: decl.start + m.index,
          text: m[0],
          selector: selector.replace(/\s+/g, " "),
        });
      }
    }
  }
  return found;
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
const deferred = [];
let darkRuleCount = 0;

/** The PENDING entry covering a hit, or undefined. */
function pendingFor(rel, hit) {
  return PENDING.find(
    (p) => p.file === rel && hit.selector && p.selector.test(hit.selector),
  );
}

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const src = rel.endsWith(".css.ts")
    ? stripLineComments(stripComments(raw))
    : stripComments(raw);

  darkRuleCount += (src.match(/html\.dark/g) ?? []).length;

  for (const rule of RULES) {
    if (rule.appliesTo && !rule.appliesTo(rel)) continue;

    const hits = [];
    if (rule.scan) {
      hits.push(...rule.scan(src));
    } else {
      rule.pattern.lastIndex = 0;
      let m;
      while ((m = rule.pattern.exec(src)) !== null) {
        hits.push({ index: m.index, text: m[0] });
      }
    }

    for (const hit of hits) {
      const entry = {
        file: rel,
        line: lineOf(src, hit.index),
        text: hit.text,
        selector: hit.selector,
        rule,
      };
      const pending = pendingFor(rel, hit);
      if (pending) {
        entry.pending = pending;
        deferred.push(entry);
      } else {
        violations.push(entry);
      }
    }
  }
}

/**
 * A deferral that suppresses nothing has outlived its plan, and leaving it
 * would exempt whatever next matches its selector. Fatal rather than a warning:
 * the entry's whole justification is that it disappears when the work lands, so
 * the moment it could be deleted is the moment to be told.
 */
for (const p of PENDING) {
  if (!deferred.some((d) => d.pending === p)) {
    fatal(
      `deferral \`${p.id}\` suppresses nothing. The work it was waiting on ` +
        `(${p.plan}) has landed, or its selector no longer matches — either ` +
        `way, delete the entry from PENDING in scripts/check-theme.mjs.`,
    );
  }
}

if (process.argv.includes("--list")) {
  console.warn(
    `Scanned ${files.length} files (${cssTsFiles.length} .css.ts) · ${darkRuleCount} \`html.dark\` rules`,
  );
  for (const d of deferred) {
    console.warn(`  deferred ${d.file}:${d.line}  ${d.text}  (${d.selector})`);
  }
}

/**
 * Printed on every run, clean or not. A deferral the reader never sees is
 * indistinguishable from a rule that does not cover the region.
 */
const deferredNote = deferred.length
  ? ` · ${deferred.length} deferred (${PENDING.map((p) => `${p.id} → ${p.plan}`).join(", ")})`
  : "";

if (violations.length === 0) {
  console.warn(
    `check-theme: clean — ${files.length} style files (${cssTsFiles.length} .css.ts), no scheme-invariant colors.${deferredNote}`,
  );
  process.exit(0);
}

const byRule = new Map();
for (const v of violations) {
  if (!byRule.has(v.rule.id)) byRule.set(v.rule.id, []);
  byRule.get(v.rule.id).push(v);
}

console.error(
  `check-theme: ${violations.length} violation(s) in ${byRule.size} rule(s)${deferredNote}\n`,
);
for (const [id, list] of byRule) {
  console.error(`  ${id} — ${list[0].rule.message}`);
  for (const v of list) {
    const where = v.selector ? `  in \`${v.selector}\`` : "";
    console.error(`    ${v.file}:${v.line}  ${v.text}${where}`);
  }
  console.error("");
}
process.exit(1);
