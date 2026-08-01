import PublicShell from "@/components/Layout/PublicShell";
import { Viewport } from "next/types";

/**
 * The anonymous, cacheable half of the app (plan §4.2).
 *
 * Route groups are parenthesized, so splitting `(appLayout)` into `(public)`
 * and `(workspace)` preserved every URL. What changed is what these pages boot:
 * no Redux store, no sidebar, no Copilot — see §8.1, decided.
 */
export const viewport: Viewport = {
  themeColor: [{
    media: "(prefers-color-scheme: light)",
    color: "#4f46e5",
  }, {
    media: "(prefers-color-scheme: dark)",
    color: "#272727",
  }],
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
