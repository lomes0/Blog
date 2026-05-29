"use client";
import { CloudOff, Share2 } from "lucide-react";
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
  Typography,
} from "@mui/material";
import { UserDocument } from "@/types";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import useFixedBodyScroll from "@/hooks/useFixedBodyScroll";
import UploadDocument from "./Upload";
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
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}> = ({ userDocument, variant = "iconbutton", closeMenu }) => {
  const {
    cloudDocument,
    isCloud,
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
  } = useShareDocument(userDocument);

  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  useFixedBodyScroll(shareDialogOpen);

  const panelProps = {
    cloudDocument: cloudDocument!,
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
            {!cloudDocument && (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  my: 5,
                  gap: 2,
                }}
              >
                <CloudOff size={64} />
                <Typography variant="overline" component="p">
                  Please save document to the cloud first
                </Typography>
                <UploadDocument userDocument={userDocument} variant="button" />
              </Box>
            )}
            {cloudDocument && (
              <>
                {format === "view" && <ShareViewPanel {...panelProps} />}
                {format === "embed" && <ShareEmbedPanel {...panelProps} />}
                {format === "pdf" && <SharePdfPanel {...panelProps} />}
                {format === "docx" && <ShareDocxPanel {...panelProps} />}
                {format === "edit" && (
                  <ShareEditPanel
                    cloudDocument={cloudDocument}
                    isAuthor={isAuthor}
                    isCollab={isCollab ?? false}
                    toggleCollab={toggleCollab}
                    updateCoauthors={updateCoauthors}
                  />
                )}
                {isCloud && (
                  <ShareCopyLinkButton
                    isCloud={isCloud}
                    isPrivate={isPrivate ?? false}
                    format={format}
                    copyLink={copyLink}
                  />
                )}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => closeShareDialog(closeMenu)}>Cancel</Button>
            <Button
              type="submit"
              disabled={!cloudDocument ||
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
