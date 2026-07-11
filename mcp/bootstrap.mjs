// Loaded via `node --import ./mcp/bootstrap.mjs` BEFORE the server's module
// graph. Two jobs, both must happen before any Lexical custom node is imported:
//
//   1. Install a minimal DOM global shim so browser-only libraries pulled in by
//      the editor nodes (e.g. `mathlive`, which does `class X extends
//      HTMLElement`) can be imported without a real DOM. We never render, so
//      stubs are enough.
//   2. Register a loader hook that turns `.css` imports into empty modules
//      (some node files, e.g. PageBreakNode, import their stylesheet).
import { createRequire, register } from "node:module";

const g = /** @type {any} */ (globalThis);
if (typeof g.HTMLElement === "undefined") {
  // NOTE: deliberately leave `window` UNDEFINED. The editor's client node files
  // guard browser-only side effects with `typeof window !== "undefined"` (e.g.
  // MathComponent poking mathlive's virtual keyboard at import) — leaving window
  // unset makes those short-circuit. We only stub what module-load code touches
  // unconditionally (Prism needs document/Element; mathlive needs HTMLElement).
  g.Element = class Element {};
  g.HTMLElement = class HTMLElement extends g.Element {};
  g.Node = class Node {};
  g.customElements = { define() {}, get() {}, whenDefined: () => Promise.resolve() };
  g.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
    createElementNS: () => ({ style: {}, setAttribute() {} }),
    head: { appendChild() {} },
    body: {},
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByTagName: () => [],
    currentScript: null,
    readyState: "complete",
  };
  if (!g.navigator) {
    try {
      g.navigator = { userAgent: "node", platform: "node" };
    } catch {
      // `navigator` is a read-only getter on newer Node; leave the built-in.
    }
  }
}

// ESM path: `.css` imports resolve to an empty module.
register("./css-loader.mjs", import.meta.url);

// CJS path: tsx compiles many node files to CommonJS, so their `require(".css")`
// bypasses the ESM hook above — neutralize style requires here too.
const require = createRequire(import.meta.url);
for (const ext of [".css", ".scss", ".sass", ".less"]) {
  require.extensions[ext] = (module) => {
    module.exports = {};
  };
}
