"use client";
import { useEffect, useState } from "react";
import { Box, LinearProgress, Link, Typography } from "@mui/material";
import { postsSelectors, useSelector } from "@/store";
import {
  countWords,
  type OutlineHeading,
  readingMinutes,
} from "@/utils/editorContent";

interface OutlineSectionProps {
  activeDocId: string | null;
  /**
   * The document's headings, read by `RightRail` rather than here.
   *
   * They are the rail icon's badge count as well as this list, and the badge
   * has to be right whether or not this view is in a slot — so the extraction
   * (and its `MutationObserver` fallback for view mode) moved up to the one
   * component that is always mounted. See `useViewData.ts`.
   */
  headings: OutlineHeading[];
}

export default function OutlineSection(
  { activeDocId, headings }: OutlineSectionProps,
) {
  const [scrollPct, setScrollPct] = useState(0);

  const docData = useSelector((state) => {
    if (!activeDocId) return undefined;
    return postsSelectors.selectById(state, activeDocId)?.data;
  });

  const wordCount = countWords(docData);
  const readMinutes = readingMinutes(wordCount);

  useEffect(() => {
    const el = document.getElementById("app-main");
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const remaining = Math.max(
    0,
    Math.ceil(((100 - scrollPct) / 100) * readMinutes),
  );

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
    <>
      {wordCount > 0 && (
        <>
          <Box
            sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}
          >
            <Typography variant="caption" color="text.secondary">
              {scrollPct}% read
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ~{remaining} min left
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={scrollPct}
            sx={{ mb: 1, height: 4, borderRadius: 2 }}
          />
        </>
      )}
      {headings.length === 0
        ? (
          <Typography variant="caption" color="text.disabled">
            No headings found
          </Typography>
        )
        : (
          <Box
            component="nav"
            aria-label="Document outline"
            sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}
          >
            {headings.map((h) => (
              <Link
                key={h.key}
                component="button"
                underline="none"
                onClick={() => scrollTo(h.text)}
                sx={{
                  display: "block",
                  textAlign: "left",
                  typography: h.level === 2 ? "dense" : "micro",
                  pl: h.level === 3 ? 2 : 0.75,
                  py: 0.25,
                  color: "text.secondary",
                  borderLeft: "2px solid",
                  borderColor: "divider",
                  "&:hover": {
                    color: "text.primary",
                    borderColor: "primary.main",
                  },
                }}
              >
                {h.text}
              </Link>
            ))}
          </Box>
        )}
    </>
  );
}
