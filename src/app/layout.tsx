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

export const metadata: Metadata = {
  title: "Editor",
  description:
    "Editor is a free text editor, with support for LaTeX, Geogebra, Excalidraw and markdown shortcuts. Create, share and print math documents with ease.",
  applicationName: "Editor",
  appleWebApp: {
    capable: true,
    title: "Editor",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: "/favicon.ico",
  keywords: [
    "Editor",
    "Online Editor",
    "Latex",
    "Geogebra",
    "Excalidraw",
    "Markdown",
  ],
  metadataBase: PUBLIC_URL ? new URL(PUBLIC_URL) : undefined,
  openGraph: {
    title: "Editor",
    description:
      "Editor is a free text editor, with support for LaTeX, Geogebra, Excalidraw and markdown shortcuts. Create, share and print math documents with ease.",
    images: [
      {
        url: "/feature.png",
        width: 1024,
        height: 500,
        alt: "Editor Feature Image",
      },
    ],
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
