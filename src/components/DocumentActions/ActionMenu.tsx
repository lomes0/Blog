"use client";
import { useMenuState } from "@/hooks/useMenuState";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import { MoreVertical, Pencil } from "lucide-react";
import DownloadDocument from "./Download";
import DeleteBothDocument from "./DeleteBoth";
import UploadDocument from "./Upload";
import { User, UserDocument } from "@/types";
import ShareDocument from "./Share";
import EditDocumentDialog from "./Edit";
import RestoreDocument from "./Restore";
import { useRouter } from "next/navigation";

function DocumentActionMenu(
  { userDocument, user }: { userDocument: UserDocument; user?: User },
) {
  const router = useRouter();
  const { anchorEl, menuOpen: open, openMenu, closeMenu } = useMenuState();

  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const document = localDocument || cloudDocument;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isUploaded = isLocal && isCloud;
  const isUpToDate = isUploaded && localDocument.head === cloudDocument.head;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;
  const isCoauthor = isCloud
    ? cloudDocument.coauthors.some((u) => u.id === user?.id)
    : false;
  const isCollab = isCloud ? cloudDocument.collab : false;
  const canEditContent = isAuthor || isCollab;
  const id = userDocument.id;
  const handle = document?.handle || document?.id || id;

  const options = ["share"];
  if (isAuthor || isCoauthor || isLocal || isCollab) options.push("download");
  if (isAuthor || isLocal) options.push("delete");
  if (isAuthor) options.push("edit");
  if (isAuthor && isLocal && !isUpToDate) options.push("upload");
  if (isUploaded && !isUpToDate) options.push("restore");
  if (canEditContent) options.push("editContent");

  return (
    <>
      {options.includes("edit") && (
        <EditDocumentDialog userDocument={userDocument} />
      )}
      <IconButton
        id={`${id}-action-button`}
        aria-controls={open ? `${id}-action-menu` : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        aria-label="Document Actions"
        onClick={openMenu}
        size="small"
      >
        <MoreVertical />
      </IconButton>
      <Menu
        id={`${id}-action-menu`}
        aria-labelledby={`${id}-action-button`}
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
      >
        {options.includes("editContent") && (
          <MenuItem
            onClick={() => {
              router.push(`/edit/${handle}`);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <Pencil />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
        )}
        {options.includes("share") && (
          <ShareDocument
            userDocument={userDocument}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("download") && (
          <DownloadDocument
            userDocument={userDocument}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("upload") && (
          <UploadDocument
            userDocument={userDocument}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("restore") && (
          <RestoreDocument
            userDocument={userDocument}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("delete") && (
          <DeleteBothDocument
            userDocument={userDocument}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
      </Menu>
    </>
  );
}

export default DocumentActionMenu;
