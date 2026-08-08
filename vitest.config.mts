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
    // swallow every `@/editor/...` specifier. The entry is seeded here, ahead
    // of the editor's extraction into `packages/editor`
    // (docs/plans/haklex-adoption.md §4), so that phase is a one-line change to
    // this `replacement` rather than a restructuring under time pressure.
    //
    // It still points at `./src/editor`, which is where the files are. Pointing
    // it at the empty package directory early is NOT a no-op: two specs
    // (`editor/nodes/__tests__/serialization.test.ts` and
    // `editor/utils/__tests__/virtualRepo.test.ts`) import `@/editor/...` today
    // and fail to resolve.
    alias: [
      {
        find: "@/editor",
        replacement: fileURLToPath(new URL("./src/editor", import.meta.url)),
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
