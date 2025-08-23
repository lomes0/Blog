"use client";
import * as React from "react";
import { User, UserDocument } from "@/types";
import { memo } from "react";
import { SxProps, Theme } from "@mui/material/styles";
import PostCard from "./PostCard";

// Simplified card wrapper - no more document/directory routing
const PostCardWrapper: React.FC<{
  userDocument?: UserDocument;
  user?: User;
  sx?: SxProps<Theme>;
}> = memo(({ userDocument, user, sx = {} }) => {
  // Apply default responsive styles
  const defaultSx: SxProps<Theme> = {
    width: "100%",
    height: "100%",
    margin: 0,
    display: "flex",
    flexDirection: "column",
  };

  const combinedSx: SxProps<Theme> = { ...defaultSx, ...(sx as any) };

  return (
    <PostCard
      userDocument={userDocument}
      user={user}
      sx={combinedSx}
    />
  );
});

PostCardWrapper.displayName = "PostCardWrapper";

export default PostCardWrapper;
