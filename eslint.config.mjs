import nextPlugin from "@next/eslint-plugin-next";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "next-pwa/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsPlugin,
      "react": reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...tsPlugin.configs.recommended.rules,
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // Route handlers must declare their auth requirement by naming one of the
    // wrappers in `@/lib/api-utils` — `publicRoute`, `userRoute` or
    // `optionalUserRoute`. That is the whole point of there being three of them:
    // the unauthenticated surface of the app is `grep -rn "publicRoute"`, and a
    // handler that checks nothing cannot be mistaken for one that is meant to be
    // public. Resolving the session by hand reopens that gap, so the imports
    // needed to do it are unavailable here.
    //
    // NextAuth's own catch-all route is exempt: it *is* the auth handler.
    files: ["src/app/api/**/*.{ts,tsx}"],
    ignores: ["src/app/api/auth/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "next-auth",
            importNames: ["getServerSession"],
            message:
              "Wrap the handler in publicRoute / userRoute / optionalUserRoute from @/lib/api-utils, which resolves the session and hands you `context.user`.",
          },
          {
            name: "@/lib/auth",
            importNames: ["authOptions"],
            message:
              "authOptions is only needed to call getServerSession by hand — use the route wrappers from @/lib/api-utils instead.",
          },
        ],
      }],
    },
  },
  {
    // A handler that is not wrapped at all has made no auth declaration, which is
    // the state this arrangement exists to make unrepresentable. The import ban
    // above cannot catch it, because such a handler imports nothing.
    //
    // `src/app/api/og` is exempt from *this* rule only — it runs on the edge
    // runtime, where the session helpers the wrappers import cannot be bundled. It
    // reads nothing from the database; see the comment in that file. It remains
    // subject to the import ban above.
    files: ["src/app/api/**/*.{ts,tsx}"],
    ignores: ["src/app/api/auth/**", "src/app/api/og/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector:
          "ExportNamedDeclaration > FunctionDeclaration[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]",
        message:
          "Export the handler as `export const GET = userRoute(...)` (or publicRoute / optionalUserRoute) from @/lib/api-utils, so its auth requirement is stated in the source.",
      }, {
        selector:
          "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/] > :matches(ArrowFunctionExpression, FunctionExpression)",
        message:
          "Wrap the handler in publicRoute / userRoute / optionalUserRoute from @/lib/api-utils instead of exporting a bare function, so its auth requirement is stated in the source.",
      }, {
        // `(await request.json()) as SomeType` is a cast, not a check: the type
        // says what a well-behaved client sends while the handler goes on to use
        // whatever arrived. Routes that fed such a body to Prisma were assigning
        // the columns the *caller* named — which is how `parentId` on a document
        // PATCH became a way to graft a document into someone else's post.
        //
        // So reading a body is spelled `parseBody(request, schema)`, and the
        // schema is the endpoint's stated input. Same reasoning as the wrapper
        // rules above: the mistake should be unavailable, not discouraged.
        //
        // Only `.json()` is restricted — `request.formData()` and `.text()` are
        // untouched, since the upload and export routes legitimately need them.
        selector:
          "AwaitExpression > CallExpression[callee.property.name='json'][callee.object.name='request']",
        message:
          "Use `parseBody(request, schema)` from @/lib/api-utils instead of request.json(), so the body is validated rather than cast. Declare a zod schema for what the route accepts (`.strict()` on updates, so a field you did not mean to expose is a 400 and not a silent write).",
      }],
    },
  },
  {
    // Color tokens that do not respond to the active scheme (DESIGN.md §19).
    //
    // Both of these read as ordinary theme access and are wrong in a way the
    // call site cannot show you. They shipped, survived review, and were only
    // found by asking why attachments were still light after the CSS had been
    // fixed twice (277c9db7, 6614f07e, then a1c14273).
    //
    // The CSS-var spellings of the same mistakes are caught by
    // `npm run check:theme`; this covers the `sx` / TSX side.
    //
    // Scoped away from `src/app/api/**` only because a second
    // `no-restricted-syntax` block over the same files would replace the route
    // rules above rather than add to them — API routes have no UI colors.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**"],
    rules: {
      "no-restricted-syntax": ["error", {
        // MUI spreads `grey` once at the top of createPalette, outside the
        // light/dark blocks, so grey.50 is #fafafa in *both* schemes. Whole
        // cards rendered near-white on the #252b3a canvas. Worse in
        // CardBase, where grey.800 was darker than the dark-mode surface it
        // outlined and so inverted the signal it drew.
        selector: "Literal[value=/^grey\\.\\d+$/]",
        message:
          "MUI's grey scale is the same in both color schemes — grey.50 is #fafafa in dark too. Use a scheme-aware token: action.hover / action.selected for tints, divider or text.secondary / text.disabled for borders, background.paper / background.input for surfaces. If a fixed light value is genuinely correct (a button on a saturated banner, say), spell it common.white and disable this rule with the reason.",
      }, {
        // augmentColor only emits main/light/dark/contrastText, so
        // `--mui-palette-primary-50` is never generated: the declaration is
        // invalid and drops silently, in both schemes. This is why the
        // attachment's selected state and TimeEditRow's dirty-row tint had no
        // fill at all — not the wrong color, no color.
        selector:
          "Literal[value=/^(primary|secondary|success|warning|info|error)\\.\\d+$/]",
        message:
          "Numeric shades of a semantic color do not exist — augmentColor generates only main/light/dark/contrastText, so this resolves to undefined and the declaration is dropped. Use alpha(theme.palette.X.main, n) for a tint, or the .light / .dark members.",
      }, {
        selector: "Literal[value=/--mui-palette-grey-/]",
        message:
          "MUI's grey scale is the same in both color schemes. Use --mui-palette-{background,action,text,divider}-* instead.",
      }, {
        selector:
          "MemberExpression[property.name='grey'][object.property.name='palette']",
        message:
          "theme.palette.grey is the same in both color schemes. Use theme.palette.{background,action,text,divider} instead.",
      }],
    },
  },
];
