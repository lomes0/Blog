import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import withPWA from "./next-pwa";

// Cache duration constants (in seconds)
const ONE_DAY = 24 * 60 * 60;
const ONE_WEEK = 7 * ONE_DAY;
const ONE_YEAR = 365 * ONE_DAY;

const IS_VERCEL = !!process.env.NEXT_PUBLIC_VERCEL_URL;
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
  // Emit a self-contained server bundle (.next/standalone) for a minimal
  // production container image. See Dockerfile.
  output: "standalone",
  devIndicators: false,
  reactStrictMode: true,
  distDir: process.env.BUILD_DIR || ".next",
  // Skip ESLint during build - run separately with `npm run lint`
  eslint: {
    ignoreDuringBuilds: true,
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
  // Add modularizeImports for deterministic MUI component imports
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push("canvas");
    }
    if (IS_VERCEL) {
      config.externals.push("puppeteer");
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

export default withBundleAnalyzer(withBundleAnalyzerConfig)(
  withPWA(withPWAConfig)(nextConfig),
);
