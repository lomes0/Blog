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
];
