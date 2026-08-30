"use client";
import { Post } from "@/types";
import { Copy } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { useSearchParams } from "next/navigation";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

const ForkDocument: React.FC<
  {
    post: Post;
    variant?: "menuitem" | "iconbutton";
    closeMenu?: () => void;
  }
> = ({ post, variant = "iconbutton", closeMenu }) => {
  const id = post.id;
  const handle = post.handle ?? null;
  const head = post.headRevisionId;
  const searchParams = useSearchParams();
  const revisionId = searchParams.get("v");
  const run = useCommandRun();

  const handleFork = () => {
    if (closeMenu) closeMenu();
    run(documentCommands.fork, {
      id: handle || id,
      // Only pin a revision when it is not the head — `/new/[id]` forks the
      // head on its own, and naming it would put a redundant `?v=` in the URL.
      ...(revisionId && revisionId !== head ? { revisionId } : {}),
    });
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleFork}>
        <ListItemIcon>
          <Copy />
        </ListItemIcon>
        <ListItemText>Fork</ListItemText>
      </MenuItem>
    );
  }
  return (
    <IconButton
      aria-label="Fork Document"
      onClick={handleFork}
      size="small"
    >
      <Copy />
    </IconButton>
  );
};

export default ForkDocument;
