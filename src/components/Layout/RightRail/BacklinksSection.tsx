"use client";
import { useEffect, useState } from "react";
import { Box, Link, Typography } from "@mui/material";
import { FileText, Link as LinkIcon } from "lucide-react";
import RouterLink from "next/link";
import RailSection from "./RailSection";
import { ICON_SIZE } from "@/theme/icons";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

interface BacklinkDoc {
  id: string;
  name: string;
  handle: string | null;
}

interface BacklinksSectionProps {
  rootId: string;
}

export default function BacklinksSection({ rootId }: BacklinksSectionProps) {
  const [backlinks, setBacklinks] = useState<BacklinkDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const run = useCommandRun();

  useEffect(() => {
    if (!rootId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/documents/${rootId}/backlinks`)
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((json) => {
        if (!cancelled) setBacklinks(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rootId]);

  return (
    <RailSection
      title="Backlinks"
      count={backlinks.length || undefined}
      icon={<LinkIcon size={ICON_SIZE.dense} />}
      iconLabel="Backlinks"
      defaultOpen={false}
    >
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
                  {doc.name}
                </Box>
              </Link>
            ))}
          </Box>
        )}
    </RailSection>
  );
}
