"use client";
import { Box, Link, Paper, Typography } from "@mui/material";
import { Table } from "lucide-react";
import { usePathname } from "next/navigation";
import { documentsSelectors, useSelector } from "@/store";
import { extractHeadings } from "@/utils/editorContent";
import { useLayoutMode } from "@/contexts/LayoutModeContext";

const FloatingOutlinePill: React.FC = () => {
  const { viewMode } = useLayoutMode();
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);
  const isDocPage = segments[0] === "edit" || segments[0] === "view";
  const rootId = isDocPage ? segments[1] ?? null : null;

  const activeTabId = useSelector((state) => state.ui.tabs.activeTabId);
  const activeDocId = segments[0] === "edit" ? (activeTabId ?? rootId) : rootId;

  const docData = useSelector((state) => {
    if (!activeDocId) return undefined;
    const doc = documentsSelectors.selectById(state, activeDocId);
    return doc?.local?.data;
  });

  const headings = extractHeadings(docData);

  if (viewMode !== "focus" || !isDocPage || headings.length === 0) return null;

  const scrollTo = (text: string) => {
    const el = document.getElementById("app-main");
    if (!el) return;
    const allHeadings = el.querySelectorAll("h2, h3");
    for (const h of allHeadings) {
      if (h.textContent?.trim() === text) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  };

  return (
    <Paper
      component="nav"
      role="navigation"
      aria-label="Document outline"
      elevation={2}
      sx={{
        position: "fixed",
        right: 24,
        top: 70,
        zIndex: 3,
        width: 170,
        p: 1,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        bgcolor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.25 }}>
        <Table
          size={13}
          style={{ color: "var(--mui-palette-text-secondary)" }}
        />
        <Typography variant="caption" fontWeight={700} color="text.primary">
          Outline
        </Typography>
      </Box>
      {headings.map((h) => (
        <Link
          key={h.key}
          component="button"
          underline="none"
          onClick={() => scrollTo(h.text)}
          sx={{
            display: "block",
            textAlign: "left",
            fontSize: h.level === 2 ? "0.72rem" : "0.68rem",
            pl: h.level === 3 ? 1.5 : 0.5,
            py: 0.125,
            color: "text.secondary",
            "&:hover": { color: "primary.main" },
          }}
        >
          {h.text}
        </Link>
      ))}
    </Paper>
  );
};

export default FloatingOutlinePill;
