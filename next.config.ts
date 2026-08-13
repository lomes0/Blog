import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { createVanillaExtractPlugin } from "@vanilla-extract/next-plugin";
import withPWA from "./next-pwa";

const withVanillaExtract = createVanillaExtractPlugin();

// Cache duration constants (in seconds)
const ONE_DAY = 24 * 60 * 60;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const withBundleAnalyzerConfig = {
  enabled: process.env.ANALYZE === "true",
};

const withPWAConfig = {
  dest: "public",
  disable: !IS_PRODUCTION,
  register: true,
  buildExcludes: ["app-build-manifest.json"],
  skipWaiting: true,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  fallbacks: {
    document: "/offline",
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: ONE_YEAR,
        },
      },
    },
    {
      urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-font-assets",
        expiration: {
          maxEntries: 4,
          maxAgeSeconds: ONE_WEEK,
        },
      },
    },
    {
      urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-image-assets",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/_next\/image\?url=.+$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-image",
        expiration: {
          maxEntries: 64,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:mp3|wav|ogg)$/i,
      handler: "CacheFirst",
      options: {
        rangeRequests: true,
        cacheName: "static-audio-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:js)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-js-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\.(?:css|less)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "static-style-assets",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "next-data",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
      },
    },
    {
      urlPattern: /\/api\/.*$/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "apis",
        expiration: {
          maxEntries: 16,
          maxAgeSeconds: ONE_DAY,
        },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "others",
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: ONE_DAY,
        },
        networkTimeoutSeconds: 10,
      },
    },
  ],
};

const nextConfig: NextConfig = {
  // Emit `.next/standalone` — a self-contained server bundling only the
  // dependencies actually traced, which is what the Dockerfile's runner stage
  // copies. Production is a container on a single VPS
  // (docs/plans/production-deployment.md), so this has a consumer again.
  output: "standalone",
  devIndicators: false,
  reactStrictMode: true,
  distDir: process.env.BUILD_DIR || ".next",
  // Skip ESLint during build - run separately with `npm run lint`
  //
  // `dirs` is what `npm run lint` (`next lint`) actually walks. Its default is
  // app/pages/components/lib/src, of which only `src` exists here — so
  // `packages/` would be linted by nothing at all. Named explicitly ahead of
  // the editor extraction (docs/plans/haklex-adoption.md §4.3).
  //
  // `mcp/` and `scripts/` are deliberately *not* listed. Neither has ever been
  // linted, and `mcp/smoke.ts` is a CLI that legitimately prints (26 pre-existing
  // `no-console` errors). Bringing them in is a separate decision from this one.
  eslint: {
    ignoreDuringBuilds: true,
    dirs: ["src", "packages"],
  },
  // Skip TypeScript errors during build for faster builds (optional)
  // typescript: {
  //   ignoreBuildErrors: true,
  // },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Use webpack for consistency
    webpackBuildWorker: true,
  },
  // Deterministic MUI component imports: rewrite the `@mui/material` barrel to
  // per-component paths so the barrel's whole surface is not pulled in.
  //
  // Still earning its keep after the editor came off MUI
  // (docs/plans/haklex-adoption.md §5): the app shell keeps MUI, and 131 files
  // under `src/` still import from the barrel. What changed is its reach —
  // `packages/**` is now MUI-free and lint-enforced, so this transform no
  // longer touches the editor at all.
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("canvas");
    }
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: "asset/resource",
      resourceQuery: /url/,
    });

    // Ensure consistent class names between server and client
    if (config.optimization) {
      config.optimization.realContentHash = false;

      // Additional optimization settings for consistent builds
      if (config.optimization.minimizer) {
        config.optimization.minimizer.forEach(
          (
            plugin: {
              constructor: { name: string };
              options: { terserOptions?: any };
            },
          ) => {
            if (plugin.constructor.name === "TerserPlugin") {
              plugin.options.terserOptions = {
                ...plugin.options.terserOptions,
                keep_classnames: true,
                keep_fnames: true,
              };
            }
          },
        );
      }
    }

    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)\.woff2",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, OPTIONS",
          },
        ],
      },
    ];
  },
};

/**
 * Wrapper order matters, and both of the inner two *chain* rather than replace.
 *
 * `withVanillaExtract` is innermost so that the `webpack:` fn above still runs:
 * the plugin installs its loaders and `VanillaExtractPlugin`, then hands the
 * config on —
 *
 *   if (typeof nextConfig.webpack === 'function') {
 *     return nextConfig.webpack(config, options);
 *   }
 *
 * (`@vanilla-extract/next-plugin/dist/…cjs.dev.js:261-263`). The vendored
 * `next-pwa/index.js:63-64` does the same for whatever it wraps, so all three
 * webpack contributions survive.
 *
 * **This build is webpack, deliberately.** `next dev` and `next build` are both
 * run without `--turbopack` (see `package.json`). Adding that flag would drop
 * every vanilla-extract style silently: the plugin's Turbopack support is
 * `unstable_turbopack.mode: "off"` by default and requires Next >= 16 even when
 * switched on (`…cjs.dev.js:159-163`), so on Next 15 it configures no Turbopack
 * rule at all and `.css.ts` files compile to nothing.
 */
export default withBundleAnalyzer(withBundleAnalyzerConfig)(
  withPWA(withPWAConfig)(withVanillaExtract(nextConfig)),
);
