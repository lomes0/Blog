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
import DeletePost from "./Delete";
import { Post, User } from "@/types";
import { capabilities } from "@/lib/capabilities";
import ShareDocument from "./Share";
import EditDocumentDialog from "./Edit";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

function DocumentActionMenu(
  { post, user }: { post: Post; user?: User },
) {
  const run = useCommandRun();
  const { anchorEl, menuOpen: open, openMenu, closeMenu } = useMenuState();

  const can = capabilities(user);
  // A post with no author is a guest draft, which is by definition the viewer's.
  const isAuthor = post.author ? post.author.id === user?.id : true;
  const isCoauthor = !!post.coauthors?.some((u) => u.id === user?.id);
  const isCollab = !!post.collab;
  const canEditContent = isAuthor || isCollab;
  const id = post.id;
  const handle = post.handle || post.id || id;

  const options: string[] = [];
  if (can.share) options.push("share");
  if (can.exportImport && (isAuthor || isCoauthor || isCollab)) {
    options.push("download");
  }
  if (isAuthor) options.push("delete", "edit");
  if (canEditContent) options.push("editContent");

  return (
    <>
      {options.includes("edit") && <EditDocumentDialog post={post} />}
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
              run(documentCommands.open, { id: handle });
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
            post={post}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("download") && (
          <DownloadDocument
            post={post}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
        {options.includes("delete") && (
          <DeletePost
            post={post}
            variant="menuitem"
            closeMenu={closeMenu}
          />
        )}
      </Menu>
    </>
  );
}

export default DocumentActionMenu;
