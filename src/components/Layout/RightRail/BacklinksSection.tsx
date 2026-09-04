"use client";
import { Box, Link, Typography } from "@mui/material";
import { FileText } from "lucide-react";
import RouterLink from "next/link";
import { ICON_SIZE } from "@/theme/icons";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import type { BacklinkDoc } from "./useViewData";

interface BacklinksSectionProps {
  /**
   * The document's backlinks, fetched by `RightRail` rather than here.
   *
   * They are the rail icon's badge count as well as this list, and a badge that
   * is only right once you have opened the view is not a badge. See
   * `useViewData.ts` for what that costs.
   */
  backlinks: BacklinkDoc[];
  loading: boolean;
}

export default function BacklinksSection(
  { backlinks, loading }: BacklinksSectionProps,
) {
  const run = useCommandRun();

  return (
    <>
      {loading
        ? (
          <Typography variant="caption" color="text.disabled">
            Loading…
          </Typography>
        )
        : backlinks.length === 0
        ? (
          <Typography variant="caption" color="text.disabled">
            No backlinks found
          </Typography>
        )
        : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {backlinks.map((doc) => (
              <Link
                key={doc.id}
                component={RouterLink}
                // The rail is drawn beside the panes, so a backlink is a
                // workspace navigation: `/view/[id]` would leave the app and
                // take the layout with it (Phase 4 moved it to `(public)`).
                // `document.open` accepts a handle or an id and resolves it,
                // which is why the href can keep the friendlier spelling.
                href={`/edit/${doc.handle ?? doc.id}`}
                onClick={(e: React.MouseEvent) => {
                  if (
                    e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey ||
                    e.altKey
                  ) return;
                  e.preventDefault();
                  run(documentCommands.open, { id: doc.handle ?? doc.id });
                }}
                underline="hover"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  typography: "caption",
                  color: "text.secondary",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 0.75,
                  py: 0.5,
                  bgcolor: "background.paper",
                  "&:hover": {
                    color: "primary.main",
                    borderColor: "primary.light",
                  },
                }}
              >
                <FileText size={ICON_SIZE.inline} style={{ flexShrink: 0 }} />
                <Box
                  component="span"
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.title}
                </Box>
              </Link>
            ))}
          </Box>
        )}
    </>
  );
}
