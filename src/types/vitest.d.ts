/// <reference types="vitest/globals" />

// `vitest.config.ts` sets `globals: true`, so specs call `describe`/`it`/
// `expect` without importing them. This reference is what tells `tsc --noEmit`
// the same thing. It lives in a `.d.ts` rather than `compilerOptions.types`
// because setting that array would restrict type resolution to only its
// entries, silently dropping every other ambient package in the project.
