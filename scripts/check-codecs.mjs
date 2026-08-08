#!/usr/bin/env node
/**
 * Every block-capable node type is either covered by a content-bridge codec or
 * named here as deliberately opaque — and never both.
 *
 * A node type with no codec still *addresses*: an agent can see it in an
 * outline, move it and delete it. What it cannot do is read what the block
 * says or rewrite it. That is a fine trade to make on purpose and a bad one to
 * make by accident, and until this check existed nothing cross-referenced the
 * editor's node registry against `src/lib/content-bridge/blocks.ts` at all. So
 * a node added in one commit and forgotten in the next simply went invisible to
 * both agents, silently, with the documents that contain it becoming
 * partly-unreadable rather than anything failing.
 *
 * The haklex adoption plan §7.3 makes shipping a codec with every new node the
 * rule; this is the thing that enforces it. The allowlist below is how the rule
 * lands green over the types that predate it — each entry says why that type is
 * opaque, and entries can only ever be removed.
 *
 * **Scope: registry ↔ codec coverage only.** Codec ↔ zod-schema parity is
 * already pinned, at runtime, by
 * `src/lib/content-bridge/__tests__/codecs.test.ts` (a block type that gains a
 * codec without a schema arm, or the reverse, fails there). Do not add a second
 * enforcement of it here.
 *
 * Run: npm run check:codecs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const NODES_DIR = join(ROOT, "packages/editor/src/nodes");
const BLOCKS_FILE = join(ROOT, "src/lib/content-bridge/blocks.ts");

/**
 * Types that reach the editor from Lexical itself, so no `getType()` of ours
 * exists to scan.
 *
 * Five (`root`, `text`, `paragraph`, `linebreak`, `tab`) are built into every
 * editor; the rest arrive as classes listed in `packages/editor/src/config.tsx`
 * — `HeadingNode`, `ListNode`, `ListItemNode`, `QuoteNode`, `CodeHighlightNode`,
 * `AutoLinkNode`, `LinkNode`, `LexicalTableRowNode`. Reading them out of
 * `node_modules` would make this check depend on an install; they are a closed
 * set that changes only when someone edits that `nodes:` array, so they are
 * written down instead.
 */
const CORE_TYPES = [
  "root",
  "text",
  "paragraph",
  "linebreak",
  "tab",
  "heading",
  "list",
  "listitem",
  "quote",
  "code-highlight",
  "link",
  "autolink",
  "tablerow",
];

/**
 * Inline and leaf types. These are never blocks — the bridge reaches them
 * through `parseInline`/`renderInline` inside a block's text, not as blocks of
 * their own — so a block codec is not a thing they could have.
 */
const INLINE_TYPES = new Set([
  "text",
  "linebreak",
  "code-highlight",
  "link",
  "autolink",
  "tab",
]);

/**
 * Block-capable types that are opaque on purpose, each with the reason.
 *
 * Mirrors the `EXEMPT` set in `check-node-serialization.mjs`. Every entry is a
 * document an agent can only partly work with, so this list shrinking is
 * progress and it growing needs an argument. Removing an entry is the whole of
 * "graduating" a type (plan §4.6.1) plus its codec and schema arm.
 */
const OPAQUE_ALLOWLIST = {
  // --- Structural containers: addressed, and their children addressed
  // individually, so the container itself has nothing left to encode. ---
  "layout-item":
    "a column. `BLOCK_CONTAINERS` descends into it, so its children are addressed and edited one by one",
  "details-content":
    "a collapsible's body. Addressed through, like layout-item; the `details` codec owns the summary and open state",
  tablerow:
    "addressed through by `BLOCK_CONTAINERS`; the `blog-table` codec reads and writes whole rows, and cells are addressed individually",
  listitem:
    "never addressed on its own — the `list` codec reads and writes items, including nesting, inside the one list block",

  // --- Content nodes whose payload the block IR does not model yet. ---
  math:
    "TODO: the most graduate-worthy of these — a `{ value }` LaTeX string is a codec's worth of work and would let an agent author equations",
  image:
    "src/altText/width/height plus a cropped-source payload the IR has no shape for",
  graph:
    "a GeoGebra applet state blob; the IR models nothing of it and a round-trip would have to carry it verbatim",
  sketch:
    "an Excalidraw scene — elements, appState, files. Far outside what a block IR should try to spell",
  iframe: "an embed URL plus sizing the IR does not model",
  canvas:
    "embeds the notes domain (a whole sticky-note board) inside a block; that structure belongs to NotesCanvas, not the block IR",
  sticky:
    "same: a notes-domain structure reached as a block",
  "page-break":
    "no attributes at all. A codec could only encode `{}`, which buys an agent nothing it cannot already do by moving or deleting the block",

  // --- Pre-rename aliases. ---
  table:
    "legacy alias class: answers for the pre-rename `type` string and hands importJSON to `blog-table`, which has the codec. No stored revision still carries it (docs/plans/upstream-scrub.md)",
  tablecell:
    "legacy alias for `blog-tablecell`, same as `table`",
};

// ---------------------------------------------------------------------------
// The editor's node registry
// ---------------------------------------------------------------------------

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (path.includes("__tests__")) continue;
    out.push(path);
  }
  return out;
}

/** The body of one method or function, by brace matching from its signature. */
function bodyAfter(source, at) {
  const open = source.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

const problems = [];
const files = sourceFiles(NODES_DIR);

// `CanvasNode.getType()` returns an imported constant rather than a literal, so
// resolving identifiers is not optional: without it that node type would vanish
// from the registry side of this comparison and its absence would read as
// coverage.
const constants = new Map();
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const re = /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)(?::[^=]+)?\s*=\s*(["'])(.*?)\2\s*;/g;
  let match;
  while ((match = re.exec(source)) !== null) constants.set(match[1], match[3]);
}

/** Node type strings, each mapped to where it was declared. */
const nodeTypes = new Map();
let scanned = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const where = relative(ROOT, file);
  const re = /static\s+getType\s*\(\s*\)\s*(?::\s*string\s*)?\{/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    scanned++;
    const body = bodyAfter(source, match.index);
    const literal = body && body.match(/return\s+(["'])(.*?)\1\s*;/);
    if (literal) {
      nodeTypes.set(literal[2], where);
      continue;
    }
    const identifier = body && body.match(/return\s+([A-Za-z_$][\w$]*)\s*;/);
    const resolved = identifier && constants.get(identifier[1]);
    if (resolved) {
      nodeTypes.set(resolved, where);
      continue;
    }
    problems.push(
      `${where}: a static getType() returns something this check cannot ` +
        `resolve to a string. Return a literal, or a \`const X = "…"\` ` +
        `declared under ${relative(ROOT, NODES_DIR)} — otherwise the type ` +
        `silently escapes codec coverage.`,
    );
  }
}

for (const type of CORE_TYPES) {
  if (!nodeTypes.has(type)) nodeTypes.set(type, "lexical (CORE_TYPES)");
}

// ---------------------------------------------------------------------------
// The bridge's codec coverage
// ---------------------------------------------------------------------------

const blocksSource = readFileSync(BLOCKS_FILE, "utf8");

/** The `case "…"` labels of `nodeToBlock`'s switch — not `describeNode`'s. */
const codecTypes = new Set();
const nodeToBlockAt = blocksSource.indexOf("export function nodeToBlock");
const nodeToBlockBody = nodeToBlockAt === -1
  ? null
  : bodyAfter(blocksSource, nodeToBlockAt);
if (nodeToBlockBody) {
  for (const match of nodeToBlockBody.matchAll(/case\s+(["'])(.*?)\1\s*:/g)) {
    codecTypes.add(match[2]);
  }
}

// Tables dispatch on a set rather than a case label, because the spellings read
// out of stored revisions outlive any one rename.
for (const name of ["TABLE_TYPES", "TABLE_CELL_TYPES"]) {
  const match = blocksSource.match(
    new RegExp(`export const ${name}[^=]*=\\s*new Set\\(\\[([\\s\\S]*?)\\]`),
  );
  if (!match) continue;
  for (const entry of match[1].matchAll(/(["'])(.*?)\1/g)) codecTypes.add(entry[2]);
}

// ---------------------------------------------------------------------------
// Rot guards
//
// Both sides of this comparison are regexes over source, and a regex that stops
// matching reports full coverage of nothing. Phase 1b of the haklex plan caught
// `check:nodes` doing exactly that after the editor moved, so the failure mode
// is measured rather than theoretical: a checker that silently checks nothing is
// worse than no checker, because it also occupies the slot where a real one
// would go.
// ---------------------------------------------------------------------------

if (scanned < 15) {
  console.error(
    `\n❌  Only ${scanned} \`static getType()\` declarations found under ` +
      `${relative(ROOT, NODES_DIR)} — expected at least 15. NODES_DIR is ` +
      `stale, the tree moved, or the regex no longer matches. This check was ` +
      `about to pass on nothing.\n`,
  );
  process.exit(1);
}

if (codecTypes.size < 10) {
  console.error(
    `\n❌  Only ${codecTypes.size} codec types extracted from ` +
      `${relative(ROOT, BLOCKS_FILE)} — expected at least 10. Either ` +
      `\`nodeToBlock\` was renamed or its switch was restructured, and this ` +
      `check is now measuring coverage it cannot see.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The assertion
// ---------------------------------------------------------------------------

let covered = 0;
let opaque = 0;

for (const [type, where] of nodeTypes) {
  if (type === "root" || INLINE_TYPES.has(type)) continue;

  const hasCodec = codecTypes.has(type);
  const allowlisted = Object.hasOwn(OPAQUE_ALLOWLIST, type);

  if (hasCodec && allowlisted) {
    problems.push(
      `"${type}" (${where}) has a codec in nodeToBlock AND sits in ` +
        `OPAQUE_ALLOWLIST. It graduated — delete its allowlist entry.`,
    );
    continue;
  }
  if (!hasCodec && !allowlisted) {
    problems.push(
      `"${type}" (${where}) is a block type with no codec in ` +
        `${relative(ROOT, BLOCKS_FILE)}. Give it one — a \`case "${type}"\` ` +
        `in nodeToBlock, the matching arm in blockToNode, and a schema arm ` +
        `in content-bridge/schema.ts — or add it to OPAQUE_ALLOWLIST here ` +
        `with the reason it stays unreadable to agents.`,
    );
    continue;
  }
  if (hasCodec) covered++;
  else opaque++;
}

// An allowlist entry for a type nobody registers any more is rot of its own: it
// keeps a justification alive for a node that no longer exists, and would go on
// excusing the name if a different node ever took it.
for (const type of Object.keys(OPAQUE_ALLOWLIST)) {
  if (!nodeTypes.has(type)) {
    problems.push(
      `OPAQUE_ALLOWLIST names "${type}", which no node registers. Remove it.`,
    );
  }
}

if (problems.length > 0) {
  console.error("\n❌  Content-bridge codec coverage failures:\n");
  for (const problem of problems) console.error(`   ${problem}`);
  console.error(
    `\n   ${problems.length} problem(s). See docs/plans/haklex-adoption.md ` +
      `§7.3 and docs/plans/claude-code-lexical.md §4.6 for what a codec owes.\n`,
  );
  process.exit(1);
}

console.log(
  `✅  Every block type is either encodable or deliberately opaque ` +
    `(${covered} with codecs, ${opaque} allowlisted, of ` +
    `${covered + opaque} block types across ${nodeTypes.size} registered).`,
);
