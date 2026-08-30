"use client";
import { Post } from "@/types";
import { seriesPositionOf } from "@/utils/posts/seriesGrouping";
import { useEffect, useRef, useState } from "react";
import ViewAttachmentEnhancer from "./ViewAttachmentEnhancer";
import { registerCodeCardActions } from "@/editor/nodes/CodeNode/actions";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RouterLink from "next/link";
import {
  Copy,
  FileText,
  Link2,
  MoreHorizontal,
  Printer,
  SquarePen,
} from "lucide-react";
import { format } from "date-fns";
import { ICON_SIZE } from "@/theme/icons";

/** One entry in the post's tab strip — the root post plus its child tabs. */
export interface ViewTab {
  id: string;
  name: string;
}

interface ViewDocumentProps {
  /** The document being shown. May be a child tab of `tabs[0]`. */
  cloudDocument: Post;
  /** Stored revision HTML for `cloudDocument`, rendered by the server. */
  cloudHtml: string;
  /** Root post first, then its child tabs, in the parent's `tabOrder`. */
  tabs: ViewTab[];
  /** True when the session owns this post — gates "Open in workspace". */
  isAuthor: boolean;
  /** True for any signed-in session — gates forking. */
  isSignedIn: boolean;
  /** The `?v=` currently pinned, when it is not the head revision. */
  pinnedRevisionId?: string;
}

/**
 * The published post, as anyone may read it.
 *
 * **This component has no store.** Until Phase 4 it minted a pane id and drove
 * `ui.workspace` (openPane / setPaneTabs / closePane) so the workspace shell
 * around it could tell what was open. The shell is gone — `/view/[id]` renders
 * in `(public)` now — and every one of those reads resolved to one of two
 * things (plan §4.3):
 *
 *  - **A prop.** The tab strip, the active tab, whether the viewer is the
 *    author: all of it is known to the server that already fetched the
 *    document, and none of it needs a live editor. `activeTabId` in particular
 *    was pane state standing in for "which document did you ask for" — which
 *    the URL already answers.
 *  - **A workspace concern.** Publishing the tab list to the top bar, and the
 *    command-registry actions (open/fork), belong to the shell. What survives
 *    here is the one affordance §4.4 calls for: *Open in workspace*.
 *
 * Tabs are links, not client-side switches. The old in-page switch fetched the
 * child through `/api/documents/[id]`, which is `write`-gated — so it only ever
 * worked for the author, and silently showed a spinner to everyone else. A
 * navigation re-enters this same page, which authorizes and renders the child
 * server-side.
 */
const ViewDocument: React.FC<ViewDocumentProps> = ({
  cloudDocument,
  cloudHtml,
  tabs,
  isAuthor,
  isSignedIn,
  pinnedRevisionId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * The whole of the reader's side of the code block card
   * (docs/plans/archive/code-block-card.md §4.2).
   *
   * The header is in `cloudHtml` already — `CodeNode.exportDOM` emits the same
   * card the editor builds — so nothing here constructs anything. This binds
   * copy and collapse to it with one delegated `click`, which is what let
   * `ViewCodeEnhancer` go: 174 lines that rebuilt a second, drifted header per
   * block out of `document.createElement`, re-run by a `MutationObserver`
   * racing hydration. A tab switch replaces the markup and needs no
   * re-enhancement, because the markup was never this file's to make.
   */
  useEffect(() => {
    const container = containerRef.current;
    return container ? registerCodeCardActions(container) : undefined;
  }, []);

  const activeTabId = cloudDocument.id;
  const slug = cloudDocument.handle || cloudDocument.id;
  const query = pinnedRevisionId ? `?v=${pinnedRevisionId}` : "";

  const authorLabel = cloudDocument.author?.handle ??
    cloudDocument.author?.name;
  const updatedDate = cloudDocument.updatedAt
    ? format(new Date(cloudDocument.updatedAt), "MMM d, yyyy")
    : null;
  const seriesTitle = cloudDocument.series?.title;
  const seriesOrder = seriesPositionOf(cloudDocument.series, cloudDocument.id);
  const seriesTotal = cloudDocument.series?.posts?.length;

  const closeMenu = () => setMoreAnchor(null);

  const copyLink = async () => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link copied to clipboard");
    } catch {
      setNotice("Failed to copy link to clipboard");
    }
  };

  return (
    <Box>
      <Box sx={{ px: { xs: 1, sm: 2, md: 2 } }}>
        {/* Post header */}
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
            <Box
              sx={{
                ml: "auto",
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                displayPrint: "none",
              }}
            >
              {
                /* Plan §4.4: the author arriving from a shared link gets a way
                  into the editor, not a silent redirect — the URL has to keep
                  meaning "the published thing" for it to be safe to share. */
              }
              {isAuthor && (
                <Button
                  component={RouterLink}
                  href={`/edit/${slug}`}
                  prefetch={false}
                  size="small"
                  variant="outlined"
                  startIcon={<SquarePen size={ICON_SIZE.inline} />}
                  sx={{ typography: "dense" }}
                >
                  Open in workspace
                </Button>
              )}
              <Tooltip title="More options">
                <IconButton
                  size="small"
                  onClick={(e) => setMoreAnchor(e.currentTarget)}
                  aria-label="More options"
                  sx={{ color: "text.secondary" }}
                >
                  <MoreHorizontal size={ICON_SIZE.dense} />
                </IconButton>
              </Tooltip>
            </Box>
            <Menu
              anchorEl={moreAnchor}
              open={Boolean(moreAnchor)}
              onClose={closeMenu}
            >
              <MenuItem onClick={copyLink}>
                <ListItemIcon>
                  <Link2 size={ICON_SIZE.dense} />
                </ListItemIcon>
                <ListItemText>Copy link</ListItemText>
              </MenuItem>
              {
                /* Plain hrefs, not commands: `/pdf/…` and `/docx/…` are export
                  endpoints outside both route groups, and the registry is the
                  AI's tool list (plan §3.2) — a download is not a workspace
                  action to give it. */
              }
              <MenuItem
                component="a"
                href={`/pdf/${slug}.pdf${query}`}
                onClick={closeMenu}
              >
                <ListItemIcon>
                  <Printer size={ICON_SIZE.dense} />
                </ListItemIcon>
                <ListItemText>Print / PDF</ListItemText>
              </MenuItem>
              <MenuItem
                component="a"
                href={`/docx/${slug}.docx${query}`}
                onClick={closeMenu}
              >
                <ListItemIcon>
                  <FileText size={ICON_SIZE.dense} />
                </ListItemIcon>
                <ListItemText>Download .docx</ListItemText>
              </MenuItem>
              {isSignedIn && (
                <MenuItem
                  component={RouterLink}
                  href={`/new/${slug}${query}`}
                  prefetch={false}
                  onClick={closeMenu}
                >
                  <ListItemIcon>
                    <Copy size={ICON_SIZE.dense} />
                  </ListItemIcon>
                  <ListItemText>Fork</ListItemText>
                </MenuItem>
              )}
            </Menu>
          </Box>
          {tabs.length > 1 && (
            <Tabs
              value={activeTabId}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Post tabs"
              sx={{ minHeight: 36, displayPrint: "none" }}
            >
              {tabs.map((tab) => (
                <Tab
                  key={tab.id}
                  value={tab.id}
                  label={tab.name}
                  component={RouterLink}
                  href={`/view/${tab.id}${query}`}
                  prefetch={false}
                  sx={{
                    minHeight: 36,
                    typography: "dense",
                    textTransform: "none",
                    borderRadius: "6px 6px 0 0",
                  }}
                />
              ))}
            </Tabs>
          )}
          <Divider />
        </Box>

        <div className="document-container document-view" ref={containerRef}>
          <div
            style={{ display: "contents" }}
            dangerouslySetInnerHTML={{ __html: cloudHtml }}
          />

          <ViewAttachmentEnhancer containerRef={containerRef} />
        </div>
      </Box>
      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </Box>
  );
};

export default ViewDocument;
