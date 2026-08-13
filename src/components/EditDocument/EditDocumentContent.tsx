"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { validate as isUuid } from "uuid";
import { actions, postsSelectors, useDispatch, useSelector } from "@/store";
import SplashScreen from "@/components/shared/SplashScreen";
import PaneSkeleton from "./PaneSkeleton";
import WorkspacePanes from "./WorkspacePanes";

/**
 * The one place the URL is still an *input*.
 *
 * Since Phase 2 nothing else parses a path to learn what is open — the
 * workspace holds that (docs/plans/archive/workspace-panes.md §2.3). A deep link has to
 * enter somewhere, though, and this is that seam: the id off the address bar
 * becomes the document `WorkspacePanes` opens.
 *
 * ## Why this resolves the segment instead of forwarding it
 *
 * `/edit/[id]` accepts an id **or a handle** — `findDocument` branches on
 * `validate(handle)` — and Phase 2 forwarded the raw segment straight through
 * as the pane's `rootId`. Everything downstream compares that against a real
 * document id (`PostItem`'s `rootId === post.id`, the pane's own tab list), so
 * on a handle URL those comparisons silently answered "no": the sidebar never
 * marked the open post. Resolving here makes a pane's `rootId` a document id by
 * construction, which is the only version of that invariant nothing can route
 * around.
 *
 * The id path — every link the app itself generates — is unchanged and does no
 * work. Only a handle URL pays, and usually not even then: the session's posts
 * are already in the store, so the handle is answered from memory. The fetch
 * below is the cold-load fallback for a handle whose post is not in the store
 * yet.
 */
const DocumentEditor: React.FC<React.PropsWithChildren> = () => {
  const dispatch = useDispatch();
  const pathname = usePathname();
  const segment = pathname.split("/")[2]?.toLowerCase();
  const isId = !!segment && isUuid(segment);

  /** The id of the post carrying `segment` as its handle, once known. */
  const resolvedId = useSelector((state) => {
    if (!segment || isId) return null;
    return postsSelectors.selectAll(state)
      .find((post) => post.handle?.toLowerCase() === segment)?.id ?? null;
  });

  // Keyed by segment rather than a bare boolean, so navigating between two
  // handle URLs re-runs the lookup and a failed one is not retried forever.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const [missingFor, setMissingFor] = useState<string | null>(null);

  useEffect(() => {
    if (!segment || isId || resolvedId) return;
    if (fetchedFor === segment) return;
    setFetchedFor(segment);
    // Through the store seam, not `apiClient`: `getPost` upserts the post under
    // its real id, which is exactly what the selector above then reads back.
    dispatch(actions.getPost(segment)).unwrap()
      .catch(() => setMissingFor(segment));
  }, [dispatch, segment, isId, resolvedId, fetchedFor]);

  if (!segment) {
    return <SplashScreen title="Document Not Found" />;
  }

  const rootId = isId ? segment : resolvedId;
  if (!rootId) {
    // Not-found is terminal and belongs to the whole route, so it keeps the
    // splash. Resolving a handle is transient and belongs to the pane about to
    // appear, so it gets the pane's own stand-in — see `PaneSkeleton`.
    return missingFor === segment
      ? <SplashScreen title="Document Not Found" />
      : <PaneSkeleton withToolbar />;
  }

  return <WorkspacePanes rootId={rootId} />;
};

export default DocumentEditor;
