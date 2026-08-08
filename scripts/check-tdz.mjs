#!/usr/bin/env node
/**
 * TDZ (Temporal Dead Zone) hook-reference checker
 *
 * Detects cases where a React hook callback (useMemo, useCallback, useEffect, …)
 * references a `const`/`let` identifier that is declared LATER in the same
 * component / hook function body — a runtime ReferenceError waiting to happen.
 *
 * Usage:
 *   node scripts/check-tdz.mjs             # analyse all src/**\/*.{ts,tsx}
 *   node scripts/check-tdz.mjs --fix-hint  # print suggested fix hint per violation
 *
 * Exit code: 0 = clean, 1 = violations found.
 */

import ts from "typescript";
import fg from "fast-glob";
import { readFileSync } from "fs";
import { resolve, relative } from "path";
import { fileURLToPath } from "url";

// ─── Configuration ────────────────────────────────────────────────────────────

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// See the note in check-theme.mjs: `packages/**` is covered ahead of the editor
// extraction so the glob does not go blind when the files move.
const PATTERNS = ["src/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"];

/** Hook names whose first argument is a function whose body executes during render. */
const EAGER_HOOKS = new Set([
  "useMemo",
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useImperativeHandle",
  "useAsyncEffect", // project-local wrapper
]);

// ─── AST helpers ─────────────────────────────────────────────────────────────

/**
 * Collect all identifier text references inside `node`, not crossing into
 * any nested function scope (arrow / function expression / declaration).
 */
function collectRefs(node, out = new Set()) {
  if (ts.isIdentifier(node)) {
    out.add(node.text);
    return out;
  }
  // Skip binding names in variable declarations — they are local declarations,
  // not references to an outer-scope identifier with the same name.
  // Only recurse into the type annotation and initializer.
  if (ts.isVariableDeclaration(node)) {
    if (node.type) collectRefs(node.type, out);
    if (node.initializer) collectRefs(node.initializer, out);
    return out;
  }
  // `a.b` — only `a` is a reference. `b` is a member name that merely parses as
  // an Identifier, and counting it makes any later `const { b } = …` look like a
  // TDZ hit. Element access (`a[b]`) is left alone: there `b` really is one.
  if (ts.isPropertyAccessExpression(node)) {
    collectRefs(node.expression, out);
    return out;
  }
  // `{ k: v }` — `k` is a key, not a reference; only `v` is. Shorthand `{ v }`
  // is a ShorthandPropertyAssignment, so it falls through and still counts.
  if (ts.isPropertyAssignment(node)) {
    if (ts.isComputedPropertyName(node.name)) collectRefs(node.name, out);
    collectRefs(node.initializer, out);
    return out;
  }
  // `A.B` in type position — the same rule as property access.
  if (ts.isQualifiedName(node)) {
    collectRefs(node.left, out);
    return out;
  }
  ts.forEachChild(node, (child) => {
    // Stop at nested function boundaries — they have their own scope.
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child) ||
      ts.isMethodDeclaration(child) ||
      ts.isClassDeclaration(child) ||
      ts.isClassExpression(child)
    ) {
      return;
    }
    collectRefs(child, out);
  });
  return out;
}

/**
 * Collect all variable-binding names declared directly inside `node` without
 * crossing into any nested function scope. These are locals that shadow
 * outer-scope identifiers and must be excluded from the "referenced from
 * outer scope" check.
 */
function collectLocalBindings(node, out = new Set()) {
  if (ts.isVariableDeclaration(node)) {
    const names = [];
    bindingNames(node.name, names);
    names.forEach((n) => out.add(n));
    return out;
  }
  ts.forEachChild(node, (child) => {
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child) ||
      ts.isMethodDeclaration(child) ||
      ts.isClassDeclaration(child) ||
      ts.isClassExpression(child)
    ) {
      return; // don't enter nested scopes
    }
    collectLocalBindings(child, out);
  });
  return out;
}

/**
 * Given a hook CallExpression, return the set of identifiers referenced in
 * its callback argument. Identifiers inside the callback body are collected
 * without crossing into further nested functions.
 */
function refsInHookCall(callExpr) {
  const out = new Set();
  for (const arg of callExpr.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      collectRefs(arg.body, out);
      // Remove names that are locally declared inside this callback — they
      // shadow outer identifiers and are not TDZ references.
      const locals = collectLocalBindings(arg.body);
      for (const local of locals) out.delete(local);
    } else {
      // Dependency arrays, plain value expressions, etc.
      collectRefs(arg, out);
    }
  }
  return out;
}

/**
 * Walk `node` looking for hook CallExpressions, without crossing into nested
 * function scopes (hooks may not be called inside nested functions anyway).
 */
function findHookCalls(node, found = []) {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    let name = null;
    if (ts.isIdentifier(callee) && EAGER_HOOKS.has(callee.text)) {
      name = callee.text;
    } else if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.name) &&
      EAGER_HOOKS.has(callee.name.text)
    ) {
      name = callee.name.text;
    }
    if (name) {
      found.push({ node, name });
      return found; // don't recurse inside; hooks are not re-entrant
    }
  }
  ts.forEachChild(node, (child) => {
    if (
      ts.isFunctionDeclaration(child) ||
      ts.isFunctionExpression(child) ||
      ts.isArrowFunction(child) ||
      ts.isMethodDeclaration(child)
    ) {
      return; // don't enter nested scopes
    }
    findHookCalls(child, found);
  });
  return found;
}

/**
 * Collect binding names from a BindingName (Identifier or destructure pattern).
 */
function bindingNames(binding, out = []) {
  if (ts.isIdentifier(binding)) {
    out.push(binding.text);
  } else if (
    ts.isObjectBindingPattern(binding) ||
    ts.isArrayBindingPattern(binding)
  ) {
    for (const el of binding.elements) {
      if (ts.isBindingElement(el)) bindingNames(el.name, out);
      // OmittedExpression in array patterns — skip
    }
  }
  return out;
}

/**
 * Return const/let declared names from a VariableStatement.
 * Returns [] for `var` (no TDZ).
 */
function getConstLetNames(stmt) {
  if (!ts.isVariableStatement(stmt)) return [];
  const flags = stmt.declarationList.flags;
  const isConst = (flags & ts.NodeFlags.Const) !== 0;
  const isLet = (flags & ts.NodeFlags.Let) !== 0;
  if (!isConst && !isLet) return [];
  const names = [];
  for (const decl of stmt.declarationList.declarations) {
    bindingNames(decl.name, names);
  }
  return names;
}

// ─── File analyser ────────────────────────────────────────────────────────────

/**
 * Analyse a single Block-bodied function scope for TDZ violations.
 * Returns an array of violation objects.
 */
function analyseBlock(block, sf) {
  const violations = [];
  const stmts = block.statements;

  // Pass 1: build a map of name → line for every const/let in this scope.
  const declaredAt = new Map(); // name => 1-based line
  for (const stmt of stmts) {
    const names = getConstLetNames(stmt);
    if (names.length === 0) continue;
    const line = sf.getLineAndCharacterOfPosition(stmt.getStart()).line + 1;
    for (const name of names) {
      // Keep the earliest declaration if somehow duplicated.
      if (!declaredAt.has(name)) declaredAt.set(name, line);
    }
  }

  if (declaredAt.size === 0) return violations; // nothing to check

  // Pass 2: for each hook call, check referenced identifiers against declaredAt.
  for (const stmt of stmts) {
    const hookCalls = findHookCalls(stmt);
    for (const { node: call, name: hookName } of hookCalls) {
      const hookLine =
        sf.getLineAndCharacterOfPosition(call.getStart()).line + 1;
      const refs = refsInHookCall(call);
      for (const ref of refs) {
        const declLine = declaredAt.get(ref);
        if (declLine !== undefined && declLine > hookLine) {
          violations.push({
            file: sf.fileName,
            hookName,
            hookLine,
            identifier: ref,
            declLine,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Walk an entire SourceFile, entering every function body.
 */
function analyseFile(sf) {
  const violations = [];

  function walk(node) {
    // Enter block-bodied functions.
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) &&
      node.body &&
      ts.isBlock(node.body)
    ) {
      const inner = analyseBlock(node.body, sf);
      violations.push(...inner);
    }
    ts.forEachChild(node, walk);
  }

  walk(sf);
  return violations;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const showFixHint = process.argv.includes("--fix-hint");

const files = await fg(PATTERNS, { cwd: ROOT, absolute: true });
files.sort();

let total = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const violations = analyseFile(sf);
  if (violations.length === 0) continue;

  total += violations.length;
  const rel = relative(ROOT, file);

  for (const v of violations) {
    console.log(
      `\n❌  ${rel}:${v.hookLine}` +
        `\n   ${v.hookName}() references \`${v.identifier}\`` +
        ` declared (const/let) later at line ${v.declLine} — TDZ risk!`,
    );
    if (showFixHint) {
      console.log(
        `   💡 Move \`${v.identifier}\` above the ${v.hookName}() call,` +
          ` or convert it to a module-level \`function\` declaration.`,
      );
    }
  }
}

if (total === 0) {
  console.log("✅  No TDZ hook-reference violations found.");
  process.exit(0);
} else {
  console.log(`\n⚠️  ${total} violation(s) found. Fix before shipping.`);
  process.exit(1);
}
