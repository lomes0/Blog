"use client";

import React, { useMemo, useState } from "react";
import { Box, InputBase, Typography } from "@mui/material";
import { FileText, Search } from "lucide-react";
import { type RootState, useSelector } from "@/store";
import { selectAllPosts } from "@/store/selectors/postsSelectors";
import { selectPaneShowingDoc } from "@/store/selectors/layoutSelectors";
import { ICON_SIZE } from "@/theme/icons";
import { MONO_FONT, SB_FONT, SB_ITEM_RADIUS } from "./constants";
import { SafeNavigationLink } from "./SafeNavigationLink";

interface SearchResult {
  id: string;
  name: string;
  path: string;
}

/**
 * One result row.
 *
 * Its own component so it can ask the store whether the post is open. This used
 * to be `pathname === "/edit/<id>"`, which is a derived copy of `ui.workspace`
 * and can only ever describe one pane — with a split open it left the other
 * pane's document looking closed (docs/plans/archive/workspace-url.md §4.2).
 * `selectPaneShowingDoc` answers for a tab as well as a pane root.
 */
const SearchResultRow: React.FC<{ result: SearchResult }> = ({ result }) => {
  const active = useSelector(
    (state: RootState) => selectPaneShowingDoc(state, result.id) !== null,
  );

  return (
    <Box
      component={SafeNavigationLink}
      href={`/edit/${result.id}`}
      sx={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        px: 1,
        py: 0.625,
        borderRadius: SB_ITEM_RADIUS,
        bgcolor: active ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <FileText
          size={ICON_SIZE.inline}
          style={{
            color: "var(--mui-palette-text-secondary)",
            flexShrink: 0,
          }}
        />
        <Typography
          variant="dense"
          noWrap
          sx={{ fontWeight: 500, color: "text.primary", minWidth: 0 }}
        >
          {result.name}
        </Typography>
      </Box>
      <Typography
        variant="micro"
        component="p"
        noWrap
        sx={{
          pl: "22px",
          fontFamily: MONO_FONT,
          color: "text.disabled",
        }}
      >
        {result.path}
      </Typography>
    </Box>
  );
};

/**
 * Sidebar "Search" view — a flat, title-filtered list of every post across all
 * folders. Each result shows the post title and a monospace `folder/name`
 * path; clicking opens it in the editor.
 */
export const SidebarSearchView: React.FC = () => {
  const [query, setQuery] = useState("");
  const posts = useSelector(selectAllPosts);
  const series = useSelector((state: RootState) => state.series);

  const seriesByPostId = useMemo(() => {
    const map = new Map<string, string>();
    series.forEach((s) => s.posts?.forEach((p) => map.set(p.id, s.title)));
    return map;
  }, [series]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    const rows = posts.map((post) => {
      const doc = post;
      const name = doc?.title || "Untitled";
      const folder = seriesByPostId.get(post.id) ?? "posts";
      return { id: post.id, name, path: `${folder}/${name}` };
    });
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [posts, seriesByPostId, query]);

  return (
    <Box
      sx={{
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Search input */}
      <Box sx={{ px: 1.5, pt: 0.5, pb: 1, flexShrink: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 0.5,
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.input",
            "&:focus-within": { borderColor: "primary.main" },
          }}
        >
          <Search
            size={ICON_SIZE.inline}
            style={{
              color: "var(--mui-palette-text-secondary)",
              flexShrink: 0,
            }}
          />
          <InputBase
            autoFocus
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across posts…"
            sx={{ fontSize: SB_FONT.body, color: "text.primary" }}
          />
        </Box>
        <Typography
          variant="micro"
          component="p"
          sx={{ mt: 0.75, color: "text.secondary" }}
        >
          {results.length} {results.length === 1 ? "result" : "results"}
        </Typography>
      </Box>

      {/* Results */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 0.5, pb: 1 }}>
        {results.length === 0
          ? (
            <Typography
              variant="dense"
              component="p"
              sx={{
                px: 1,
                py: 2,
                color: "text.secondary",
                textAlign: "center",
              }}
            >
              No posts match “{query}”.
            </Typography>
          )
          : (
            results.map((r) => <SearchResultRow key={r.id} result={r} />)
          )}
      </Box>
    </Box>
  );
};
