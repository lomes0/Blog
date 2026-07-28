"use client";
import { Post } from "@/types";
import { Copy } from "lucide-react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";

const ForkDocument: React.FC<
  {
    post: Post;
    variant?: "menuitem" | "iconbutton";
    closeMenu?: () => void;
  }
> = ({ post, variant = "iconbutton", closeMenu }) => {
  const id = post.id;
  const handle = post.handle ?? null;
  const head = post.head;
  const searchParams = useSearchParams();
  const revisionId = searchParams.get("v");
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  const handleFork = () => {
    if (closeMenu) closeMenu();
    const href = `/new/${handle || id}${
      revisionId && revisionId !== head ? `?v=${revisionId}` : ""
    }`;
    navigate(href);
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
