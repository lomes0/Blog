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
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
