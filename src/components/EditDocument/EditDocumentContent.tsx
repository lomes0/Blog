"use client";
import { usePathname } from "next/navigation";
import SplashScreen from "@/components/shared/SplashScreen";
import TabbedDocumentEditor from "./TabbedDocumentEditor";

/**
 * The one place the URL is still an *input*.
 *
 * Since Phase 2 nothing else parses a path to learn what is open — the
 * workspace holds that (docs/plans/workspace-panes.md §2.3). A deep link has to
 * enter somewhere, though, and this is that seam: the id off the address bar
 * becomes the pane `TabbedDocumentEditor` opens. Phase 4 turns this into a
 * replayed `document.open` command rather than a prop.
 */
const DocumentEditor: React.FC<React.PropsWithChildren> = () => {
  const pathname = usePathname();
  const id = pathname.split("/")[2]?.toLowerCase();

  if (!id) {
    return <SplashScreen title="Document Not Found" />;
  }

  return <TabbedDocumentEditor rootId={id} />;
};

export default DocumentEditor;
