import type { Metadata, Viewport } from "next";
import ThemeProvider from "@/components/Layout/ThemeProvider";
import AuthProvider from "@/components/shared/AuthProvider";
import { FloatingActionsProvider } from "@/components/Layout/FloatingActions";
import { AIModelProvider } from "@/contexts/AIModelContext";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import "mathlive/static.css";
import "@/editor/theme.css";
import "./globals.css";

// Force Next.js to use SSG for this layout, which helps with consistency between server and client
export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

const PUBLIC_URL = process.env.PUBLIC_URL;

const DESCRIPTION =
  "A blog platform with a rich text editor: LaTeX, Geogebra, Excalidraw, sticky notes and markdown shortcuts. Write posts and organize them into series.";

// No `openGraph.images` on purpose. This used to point at `/feature.png`, the
// Google Play feature graphic of the project this app was forked from — 1024x500
// of "Math Editor / Easy as π" over a screenshot of the old Android app. Every
// link to this site rendered that card. Until there is artwork for *this*
// product, a text-only card is the honest result; drop a file in and add the
// `images` key back.
export const metadata: Metadata = {
  title: "Blog",
  description: DESCRIPTION,
  applicationName: "Blog",
  appleWebApp: {
    capable: true,
    title: "Blog",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: "/favicon.ico",
  keywords: [
    "Blog",
    "Editor",
    "Latex",
    "Geogebra",
    "Excalidraw",
    "Markdown",
  ],
  metadataBase: PUBLIC_URL ? new URL(PUBLIC_URL) : undefined,
  openGraph: {
    title: "Blog",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "dark light",
  themeColor: [{
    media: "(prefers-color-scheme: light)",
    color: "#ffffff",
  }, {
    media: "(prefers-color-scheme: dark)",
    color: "#121212",
  }],
};

export default function RootLayout(
  { children }: { children: React.ReactNode },
) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <InitColorSchemeScript attribute="class" />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <AIModelProvider>
              <FloatingActionsProvider>
                {children}
              </FloatingActionsProvider>
            </AIModelProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
