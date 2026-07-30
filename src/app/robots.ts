import { MetadataRoute } from "next";

// Generated rather than served from `public/robots.txt`, because the `Sitemap:`
// line has to name a real origin. The static file inherited from the upstream
// project hardcoded that project's domain, which this app is not deployed on,
// so the sitemap it advertised was never fetchable. Read `PUBLIC_URL` like
// `sitemap.ts` does, and omit the line entirely when it is unset.
const PUBLIC_URL = process.env.PUBLIC_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    ...(PUBLIC_URL ? { sitemap: `${PUBLIC_URL}/sitemap.xml` } : {}),
  };
}
