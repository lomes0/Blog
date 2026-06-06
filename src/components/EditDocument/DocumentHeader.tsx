"use client";
import { Box, Divider, Typography } from "@mui/material";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";

interface DocumentHeaderProps {
  docId: string;
  rootId: string;
}

export default function DocumentHeader({
  docId,
}: DocumentHeaderProps) {
  const { name } = useSelector(
    (state: RootState) => {
      const activeUserDoc = documentsSelectors.selectById(state, docId);
      const localDoc = activeUserDoc?.local;
      const effectiveDoc = localDoc ?? activeUserDoc?.cloud;
      return {
        name: effectiveDoc?.name ?? "Untitled",
      };
    },
    shallowEqual,
  );

  return (
    <Box sx={{ pt: 2, pb: 0 }}>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontWeight: 700, lineHeight: 1.1, mb: 2 }}
      >
        {name}
      </Typography>
      <Divider />
    </Box>
  );
}
