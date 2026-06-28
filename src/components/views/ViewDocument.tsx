"use client";
import { Document } from "@/types";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ViewAttachmentEnhancer from "./ViewAttachmentEnhancer";
import ViewCodeEnhancer from "./ViewCodeEnhancer";
import SyncToCloudFab from "../shared/SyncToCloudFab";
import LocalDocumentView from "./LocalDocumentView";
import ChildDocumentView from "./ChildDocumentView";
import { useTopBarTabs } from "@/contexts/TopBarTabsContext";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { MoreHorizontal, Pencil } from "lucide-react";
import { format } from "date-fns";
import { apiClient } from "@/api";
import { actions, useDispatch, useSelector } from "@/store";
import type { TabMeta } from "@/contexts/TopBarTabsContext";
import ShareDocument from "@/components/DocumentActions/Share";
import DownloadDocument from "@/components/DocumentActions/Download";
import ForkDocument from "@/components/DocumentActions/Fork";
import { ICON_SIZE } from "@/theme/icons";

const ViewDocumentInfo = dynamic(
  () => import("./ViewDocumentInfo"),
  { ssr: false },
);

const ViewDocument: React.FC<
  { cloudDocument: Document; cloudHtml: string }
> = ({ cloudDocument, cloudHtml }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatch = useDispatch();

  // Determine root: this doc is root when it has no parent.
  const isChild = !!cloudDocument.parentId;
  const rootId = isChild ? cloudDocument.parentId! : cloudDocument.id;

  const [tabs, setTabs] = useState<TabMeta[]>([]);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

  // Active tab is driven by the shared Redux tabs store so that selecting a
  // sub-doc from the sidebar (or the top bar) updates the viewed content.
  // Until this view's tabs are initialised, fall back to the URL document.
  const activeTabId = useSelector((state) => {
    const t = state.ui.tabs;
    return t.rootId === rootId && t.activeTabId
      ? t.activeTabId
      : cloudDocument.id;
  });

  const { setTabBar } = useTopBarTabs();

  // Fetch root metadata + all children to populate the tab strip.
  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiClient.documents.get(rootId),
      apiClient.documents.children(rootId),
    ]).then(([rootDoc, childDocs]) => {
      if (cancelled) return;
      const childIds = (childDocs ?? []).map((c) => c.id);
      const metas: TabMeta[] = [
        // The root tab can carry its own label (`tabLabel`) distinct from the
        // post title; fall back to the post name when it isn't set.
        { id: rootId, name: rootDoc?.tabLabel ?? rootDoc?.name ?? "Document" },
        ...(childDocs ?? []).map((c) => ({ id: c.id, name: c.name })),
      ];
      setTabs(metas);
      // Publish tabs to the shared store (sidebar + top bar read from here).
      dispatch(actions.initTabs({ rootId, childIds }));
      // Preserve direct child views (/view/childId): initTabs activates the
      // root, so re-activate the document that was actually requested.
      if (cloudDocument.id !== rootId) {
        dispatch(actions.setActiveTab(cloudDocument.id));
      }
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [rootId, cloudDocument.id, dispatch]);

  // Clear the shared tabs store when leaving the view.
  useEffect(() => {
    return () => {
      dispatch(actions.clearTabs());
    };
  }, [dispatch]);

  const handleTabSwitch = (tabId: string) =>
    dispatch(actions.setActiveTab(tabId));

  // Register tabs with the top bar context.
  useEffect(() => {
    if (tabs.length === 0) return;
    setTabBar({
      tabs,
      activeTabId,
      rootTabId: rootId,
      onSwitch: handleTabSwitch,
    });
    return () => setTabBar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, rootId]);

  const router = useRouter();
  const userDocument = { id: cloudDocument.id, cloud: cloudDocument };
  const authorLabel = cloudDocument.author.handle || cloudDocument.author.name;
  const updatedDate = cloudDocument.updatedAt
    ? format(new Date(cloudDocument.updatedAt), "MMM d, yyyy")
    : null;
  const seriesTitle = cloudDocument.series?.title;
  const seriesOrder = cloudDocument.seriesOrder;
  const seriesTotal = cloudDocument.series?.posts?.length;

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box sx={{ px: { xs: 1, sm: 2, md: 2 } }}>
        {/* Document header */}
        <Box sx={{ pt: 2, pb: 0 }}>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            {cloudDocument.name}
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 0.75,
              mb: 1.5,
            }}
          >
            {authorLabel && (
              <Typography variant="body2" color="text.secondary">
                By {authorLabel}
              </Typography>
            )}
            {updatedDate && (
              <>
                <Typography variant="body2" color="text.secondary">
                  ·
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {updatedDate}
                </Typography>
              </>
            )}
            {seriesTitle && (
              <>
                <Typography variant="body2" color="text.secondary">
                  ·
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Series: {seriesTitle}
                  {seriesOrder != null && seriesTotal != null
                    ? ` · ${seriesOrder}/${seriesTotal}`
                    : ""}
                </Typography>
              </>
            )}
            <Tooltip title="Edit">
              <IconButton
                size="small"
                onClick={() => router.push(`/edit/${cloudDocument.id}`)}
                aria-label="Edit document"
                sx={{ color: "text.secondary", ml: 0.5 }}
              >
                <Pencil size={ICON_SIZE.inline} />
              </IconButton>
            </Tooltip>
            <Tooltip title="More options">
              <IconButton
                size="small"
                onClick={(e) => setMoreAnchor(e.currentTarget)}
                aria-label="More options"
                sx={{ color: "text.secondary" }}
              >
                <MoreHorizontal size={ICON_SIZE.inline} />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={moreAnchor}
              open={Boolean(moreAnchor)}
              onClose={() => setMoreAnchor(null)}
            >
              <ShareDocument
                userDocument={userDocument}
                variant="menuitem"
                closeMenu={() => setMoreAnchor(null)}
              />
              <DownloadDocument
                userDocument={userDocument}
                variant="menuitem"
                closeMenu={() => setMoreAnchor(null)}
              />
              <ForkDocument
                userDocument={userDocument}
                variant="menuitem"
                closeMenu={() => setMoreAnchor(null)}
              />
            </Menu>
          </Box>
          <Divider />
        </Box>

        <div className="document-container document-view" ref={containerRef}>
          {/* Root tab: use SSR-rendered HTML + local-override logic */}
          {activeTabId === cloudDocument.id && (
            <LocalDocumentView
              documentId={cloudDocument.id}
              cloudHead={cloudDocument.head}
              cloudHtml={cloudHtml}
            />
          )}

          {/* Child tabs: fetch content client-side */}
          {activeTabId !== cloudDocument.id && (
            <ChildDocumentView key={activeTabId} docId={activeTabId} />
          )}

          <ViewAttachmentEnhancer containerRef={containerRef} />
          <ViewCodeEnhancer containerRef={containerRef} />
        </div>

        <ViewDocumentInfo cloudDocument={cloudDocument} />
        <SyncToCloudFab documentId={cloudDocument.id} />
      </Box>
    </Box>
  );
};

export default ViewDocument;
