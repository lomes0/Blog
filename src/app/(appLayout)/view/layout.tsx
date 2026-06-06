import { Viewport } from "next/types";
import ViewContainerWrapper from "./ViewContainerWrapper";

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
  return (
    <ViewContainerWrapper>
      {children}
    </ViewContainerWrapper>
  );
}
