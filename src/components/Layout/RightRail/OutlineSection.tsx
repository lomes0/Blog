"use client";
import { useEffect, useState } from "react";
import { Box, LinearProgress, Link, Typography } from "@mui/material";
import { postsSelectors, useSelector } from "@/store";
import {
  countWords,
  type OutlineHeading,
  readingMinutes,
} from "@/utils/editorContent";
import { documentScrollerFor } from "@/components/EditDocument/paneChrome";

interface OutlineSectionProps {
  activeDocId: string | null;
  /**
   * The focused pane, so the progress below is read off the scroller that
   * actually moves — see {@link documentScrollerFor}. Split, that is the pane's
   * own; unsplit, the page's container.
   */
  paneId: string | null;
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
  { activeDocId, paneId, headings }: OutlineSectionProps,
) {
  const [scrollPct, setScrollPct] = useState(0);

  const docData = useSelector((state) => {
    if (!activeDocId) return undefined;
    return postsSelectors.selectById(state, activeDocId)?.data;
  });

  const wordCount = countWords(docData);
  const readMinutes = readingMinutes(wordCount);

  /*
   * This listened on `#app-main`, which is `overflow: hidden` — the top bar,
   * the document container and the status bar sit inside it and it never
   * scrolls. So `scrollHeight - clientHeight` was 0, the percentage never left
   * 0, the bar never moved and "~N min left" always reported the whole
   * document. The scroller is one level down, and in a split it is the focused
   * pane's own.
   *
   * Read once on attach as well as on the event: a document restored to where
   * it was left (`useScrollMemory`) has already scrolled by the time this runs,
   * and waiting for a wheel to learn that is how the bar shows 0% on a
   * half-read page.
   */
  useEffect(() => {
    const el = documentScrollerFor(paneId);
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [paneId, activeDocId]);

  const remaining = Math.max(
    0,
    Math.ceil(((100 - scrollPct) / 100) * readMinutes),
  );

  const scrollTo = (text: string) => {
    // The pane's own scroller is also the right search root: in a split, the
    // other pane's headings are not this outline's to jump to.
    const el = documentScrollerFor(paneId);
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
