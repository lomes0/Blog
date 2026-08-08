#!/usr/bin/env node
/**
 * Every custom Lexical node class must round-trip its own serialization.
 *
 * `importJSON` is the only parse path: `$parseSerializedNodeImpl` calls it and
 * nothing afterwards restores whatever the implementation forgot. And
 * `exportJSON` is the only write path. So a class that hand-rolls either half
 * without delegating to its base silently drops:
 *
 *   - node state (`$`), on any node; and
 *   - `format`, `indent` and `direction`, on any element node.
 *
 * That was live in five classes — details and layout lost their alignment and
 * indent on every load — until it was measured and fixed. This check exists so
 * the next node class cannot reintroduce it, because the failure is invisible:
 * the document still opens, it just quietly comes back different.
 *
 * The runtime half is
 * `packages/editor/src/nodes/__tests__/serialization.test.ts`, but
 * it can only cover the classes that import without a DOM. This covers all of
 * them, by reading the source.
 *
 * Run: npm run check:nodes
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const NODES_DIR = join(ROOT, "packages/editor/src/nodes");

/** Classes that legitimately do not implement one half themselves. */
const EXEMPT = new Set([
  // Re-exports and helpers, not node classes.
  "nestedConfig",
]);

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

/** Extract each `class X extends Y { … }` body by brace matching. */
function classes(source) {
  const found = [];
  const re = /(?:export\s+)?class\s+(\w+)\s+extends\s+([\w.<>]+)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const open = source.indexOf("{", match.index);
    if (open === -1) continue;
    let depth = 0;
    let i = open;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) break;
    }
    found.push({ name: match[1], extends: match[2], body: source.slice(open, i) });
  }
  return found;
}

/** The body of one method, by brace matching from its signature. */
function method(body, signature) {
  const at = body.indexOf(signature);
  if (at === -1) return null;
  const open = body.indexOf("{", at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < body.length; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}" && --depth === 0) return body.slice(open, i + 1);
  }
  return null;
}

const problems = [];
let scanned = 0;

for (const file of sourceFiles(NODES_DIR)) {
  const source = readFileSync(file, "utf8");
  const where = relative(ROOT, file);

  for (const klass of classes(source)) {
    if (EXEMPT.has(klass.name)) continue;
    // Only node classes — everything else in these files is incidental.
    if (!/Node$/.test(klass.extends) && !/Node<|Node$/.test(klass.extends)) continue;
    scanned++;

    const exportJSON = method(klass.body, "exportJSON(");
    if (exportJSON && !exportJSON.includes("super.exportJSON()")) {
      problems.push(
        `${where}: ${klass.name}.exportJSON() does not spread ` +
          `...super.exportJSON() — node state will be dropped on save.`,
      );
    }

    const importJSON = method(klass.body, "static importJSON(");
    // Delegating to another node class's `importJSON` is fine: that class is
    // checked too, so the guarantee holds transitively. The legacy table types
    // exist only to answer for a pre-rename `type` string and do exactly this.
    const delegates =
      importJSON &&
      (importJSON.includes("updateFromJSON(") ||
        /\b\w+\.importJSON\(/.test(importJSON));
    if (importJSON && !delegates) {
      problems.push(
        `${where}: ${klass.name}.importJSON() does not delegate to ` +
          `updateFromJSON() — node state and element format/indent/direction ` +
          `will be dropped on load.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("\n❌  Node serialization conformance failures:\n");
  for (const problem of problems) console.error(`   ${problem}`);
  console.error(
    `\n   ${problems.length} problem(s). See ` +
      `packages/editor/src/nodes/__tests__/serialization.test.ts for what this ` +
      `protects.\n`,
  );
  process.exit(1);
}

// A checker that finds nothing to check reports the same "✅" as one that
// checked everything. That is not hypothetical: NODES_DIR was repointed when
// the editor moved to packages/editor, and a stale path here would have gone
// green over an empty tree.
if (scanned === 0) {
  console.error(
    `\n❌  No node classes found under ${relative(ROOT, NODES_DIR)} — ` +
      `NODES_DIR is stale or the tree moved. This check was passing on nothing.\n`,
  );
  process.exit(1);
}

console.log(
  `✅  Every node class round-trips its own serialization (${scanned} classes).`,
);
