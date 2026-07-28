"use client";
import { Share2 } from "lucide-react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tab,
  Tabs,
} from "@mui/material";
import { Post } from "@/types";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import { useShareDocument } from "./hooks/useShareDocument";
import {
  ShareCopyLinkButton,
  ShareDocxPanel,
  ShareEditPanel,
  ShareEmbedPanel,
  SharePdfPanel,
  ShareViewPanel,
} from "./ShareTabPanels";

const ShareDocument: React.FC<{
  post: Post;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ post, variant = "iconbutton", closeMenu }) => {
  const {
    isAuthor,
    isCollab,
    isPrivate,
    formats,
    format,
    setFormat,
    revision,
    setRevision,
    shareDialogOpen,
    shareFormRef,
    openShareDialog,
    closeShareDialog,
    copyLink,
    handleShare,
    togglePrivate,
    toggleCollab,
    updateCoauthors,
  } = useShareDocument(post);

  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  useFixedBodyScroll(shareDialogOpen);

  const panelProps = {
    post: post!,
    revision,
    setRevision,
    isPrivate: isPrivate ?? false,
    isAuthor,
    togglePrivate,
  };

  return (
    <>
      {variant === "menuitem"
        ? (
          <MenuItem onClick={openShareDialog}>
            <ListItemIcon>
              <Share2 />
            </ListItemIcon>
            <ListItemText>Share</ListItemText>
          </MenuItem>
        )
        : (
          <IconButton
            aria-label="Share Document"
            onClick={openShareDialog}
            size="small"
          >
            <Share2 />
          </IconButton>
        )}
      <Dialog
        open={shareDialogOpen}
        onClose={() => closeShareDialog(closeMenu)}
        fullWidth
        maxWidth="sm"
        fullScreen={fullScreen}
        disablePortal={false}
        style={{ zIndex: 1300 }}
      >
        <Box
          component="form"
          onSubmit={(e) => handleShare(e, closeMenu)}
          ref={shareFormRef}
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
          }}
        >
          <DialogTitle>Share Document</DialogTitle>
          <DialogContent>
            <Tabs
              variant="scrollable"
              allowScrollButtonsMobile
              value={format}
              onChange={(_, v) => setFormat(v)}
              aria-label="Share tabs"
            >
              {formats.map((f) => <Tab key={f} label={f} value={f} />)}
            </Tabs>
            {format === "view" && <ShareViewPanel {...panelProps} />}
            {format === "embed" && <ShareEmbedPanel {...panelProps} />}
            {format === "pdf" && <SharePdfPanel {...panelProps} />}
            {format === "docx" && <ShareDocxPanel {...panelProps} />}
            {format === "edit" && (
              <ShareEditPanel
                post={post}
                isAuthor={isAuthor}
                isCollab={isCollab ?? false}
                toggleCollab={toggleCollab}
                updateCoauthors={updateCoauthors}
              />
            )}
            <ShareCopyLinkButton
              isPrivate={isPrivate ?? false}
              format={format}
              copyLink={copyLink}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => closeShareDialog(closeMenu)}>Cancel</Button>
            <Button
              type="submit"
              disabled={!post ||
                (isPrivate && ["embed", "pdf", "docx"].includes(format))}
            >
              Share
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
};

export default ShareDocument;
