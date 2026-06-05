"use client";
import { Box, Divider, Typography } from "@mui/material";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";
import SaveStateIndicator from "./SaveStateIndicator";

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
      {/* Title + save state on the same row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          mb: 2,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontWeight: 700, lineHeight: 1.1, flex: 1, minWidth: 0 }}
        >
          {name}
        </Typography>
        <Box sx={{ flexShrink: 0 }}>
          <SaveStateIndicator docId={docId} />
        </Box>
      </Box>

      <Divider />
    </Box>
  );
}
