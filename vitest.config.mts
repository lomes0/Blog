import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Both existing specs are pure logic — `lib/ordering` mints fractional rank
 * keys, `SideBar/dragGeometry` is import-free by design — so the default
 * environment is `node`. Anything that needs a DOM should opt in per-file with
 * a `// @vitest-environment jsdom` docblock rather than slowing the whole run.
 */
export default defineConfig({
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
