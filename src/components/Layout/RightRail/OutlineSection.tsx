"use client";
import { useEffect, useState } from "react";
import { Box, LinearProgress, Link, Typography } from "@mui/material";
import { Table } from "lucide-react";
import { documentsSelectors, useSelector } from "@/store";
import { countWords, extractHeadings } from "@/utils/editorContent";
import RailSection from "./RailSection";

const WORDS_PER_MIN = 200;

interface OutlineSectionProps {
  activeDocId: string | null;
}

export default function OutlineSection({ activeDocId }: OutlineSectionProps) {
  const [scrollPct, setScrollPct] = useState(0);

  const docData = useSelector((state) => {
    if (!activeDocId) return undefined;
    const doc = documentsSelectors.selectById(state, activeDocId);
    return doc?.local?.data;
  });

  const headings = extractHeadings(docData);
  const wordCount = countWords(docData);
  const readMinutes = Math.max(1, Math.ceil(wordCount / WORDS_PER_MIN));

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
    <RailSection
      title="Outline"
      count={headings.length || undefined}
      icon={<Table size={18} />}
      iconLabel="Outline"
      defaultOpen={true}
    >
      {wordCount > 0 && (
        <>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mb: 0.5,
            }}
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
                  fontSize: h.level === 2 ? "0.78rem" : "0.72rem",
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
    </RailSection>
  );
}
