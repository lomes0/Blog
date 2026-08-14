import { fileURLToPath } from "node:url";
import { relative } from "node:path";
import { defineConfig } from "vitest/config";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

/**
 * Make `.css.ts` modules importable without vanilla-extract's bundler plugin.
 *
 * A spec that builds a real editor over the real node registry — the rule
 * docs/plans/archive/haklex-adoption.md §10.3 draws from the table bug —
 * reaches `packages/editor/src/theme.tsx`, which pulls in the `--ed-*` token
 * contract, and every vanilla-extract API throws at module scope unless its
 * transform has told the runtime which file it is in. This is that transform's
 * one load-bearing half: bracket the module in `setFileScope`/`endFileScope`.
 * Imports hoist above both calls, so a nested `.css.ts` still opens and closes
 * its own scope first.
 *
 * The hash a scope produces only ever reaches a class name, and no spec asserts
 * on one, so the exact path spelling does not matter here. A spec that ever runs
 * under jsdom should also import `@vanilla-extract/css/disableRuntimeStyles`;
 * under `environment: "node"` there is no stylesheet to write to and nothing
 * tries.
 */
const vanillaExtractFileScope = {
  name: "vanilla-extract-file-scope",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith(".css.ts")) return;
    return [
      `import { setFileScope as __vesfs, endFileScope as __veefs } from ` +
      `"@vanilla-extract/css/fileScope";`,
      `__vesfs(${JSON.stringify(relative(ROOT, id))}, "blog-simple");`,
      code,
      `__veefs();`,
    ].join("\n");
  },
};

/**
 * Both existing specs are pure logic — `lib/ordering` mints fractional rank
 * keys, `SideBar/dragGeometry` is import-free by design — so the default
 * environment is `node`. Anything that needs a DOM should opt in per-file with
 * a `// @vitest-environment jsdom` docblock rather than slowing the whole run.
 */
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [vanillaExtractFileScope],
  resolve: {
    // Mirrors the `@/*` path alias in tsconfig.json.
    //
    // Array form, not the object shorthand, and `@/editor` first: alias
    // resolution is first-match-wins, so a bare `@` entry ahead of it would
    // swallow every `@/editor/...` specifier and send it to `src/editor`, which
    // no longer exists. Mirrors the `@/editor` / `@/editor/*` entries in
    // tsconfig.json, where TS picks the longest matching prefix instead.
    alias: [
      {
        find: "@/editor",
        replacement: fileURLToPath(
          new URL("./packages/editor/src", import.meta.url),
        ),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.{ts,tsx}",
      "packages/**/__tests__/**/*.test.{ts,tsx}",
    ],
  },
});
