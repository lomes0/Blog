"use client";
import { useMemo, useState } from "react";
import { Avatar, Box, Chip, Link, Typography } from "@mui/material";
import { Cloud, Smartphone } from "lucide-react";
import { createSelector } from "@reduxjs/toolkit";
import { postsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { Revision, RevisionMeta } from "@/types";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import { ICON_SIZE } from "@/theme/icons";
import { railChipSx } from "./railChrome";

const COLLAPSE_AT = 3;

/** Stable identity so the memoised selector below doesn't recompute forever. */
const EMPTY_TAB_IDS: string[] = [];

interface RevisionsSectionProps {
  rootId: string;
  activeDocId: string | null;
  isEditMode: boolean;
}

export default function RevisionsSection({
  rootId,
  activeDocId,
  isEditMode,
}: RevisionsSectionProps) {
  const [tabFilter, setTabFilter] = useState<"this" | "all">("this");
  const [showAll, setShowAll] = useState(false);

  const rootIdArray = useMemo(() => [rootId], [rootId]);

  const selectRevisions = useMemo(
    () =>
      createSelector(
        (state: RootState) =>
          isEditMode
            ? selectFocusedPane(state)?.tabIds ?? EMPTY_TAB_IDS
            : rootIdArray,
        (state: RootState) => state.posts.entities,
        (state: RootState) =>
          activeDocId
            ? postsSelectors.selectById(state, activeDocId)
            : undefined,
        (tabIds, entities, activeDoc) => {
          const sort = (
            list: (RevisionMeta | Revision)[],
          ) =>
            [...list].sort(
              (a, b) => new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );

          const all: (RevisionMeta | Revision)[] = [];
          for (const id of tabIds) {
            const doc = entities[id];
            if (doc?.revisions) all.push(...doc.revisions);
          }

          const thisTab: (RevisionMeta | Revision)[] = [
            ...(activeDoc?.revisions ?? []),
          ];

          return {
            tabRevisions: sort(thisTab),
            allRevisions: sort(all),
          };
        },
      ),
    [isEditMode, rootIdArray, activeDocId],
  );

  const { tabRevisions, allRevisions } = useSelector(selectRevisions);

  const revisions = useMemo(
    () => (tabFilter === "this" ? tabRevisions : allRevisions),
    [tabFilter, tabRevisions, allRevisions],
  );

  const visible = showAll ? revisions : revisions.slice(0, COLLAPSE_AT);
  const hiddenCount = revisions.length - COLLAPSE_AT;

  return (
    <>
      {isEditMode && (
        <Box sx={{ display: "flex", gap: 0.5, mb: 1 }}>
          <Chip
            label="This tab"
            size="small"
            variant={tabFilter === "this" ? "filled" : "outlined"}
            onClick={() => setTabFilter("this")}
            sx={{ ...railChipSx, cursor: "pointer" }}
          />
          <Chip
            label="All tabs"
            size="small"
            variant={tabFilter === "all" ? "filled" : "outlined"}
            onClick={() => setTabFilter("all")}
            sx={{ ...railChipSx, cursor: "pointer" }}
          />
        </Box>
      )}

      {revisions.length === 0
        ? (
          <Typography variant="caption" color="text.disabled">
            No revisions yet
          </Typography>
        )
        : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {visible.map((rev) => {
              const author = "author" in rev && rev.author
                ? rev.author
                : undefined;
              const isCloud = "author" in rev && !!rev.author;

              return (
                <Box
                  key={rev.id}
                  sx={{
                    display: "flex",
                    gap: 0.75,
                    alignItems: "center",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    p: 0.75,
                    bgcolor: "background.paper",
                  }}
                >
                  <Avatar
                    src={author?.image ?? undefined}
                    alt={author?.name ?? "Local"}
                    sx={{ width: 22, height: 22, flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      sx={{ display: "block", fontWeight: 600 }}
                      noWrap
                    >
                      {author?.name ?? "Local"}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ typography: "micro" }}
                    >
                      <DateDisplay date={rev.createdAt} variant="full" />
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    icon={isCloud
                      ? <Cloud size={ICON_SIZE.micro} />
                      : <Smartphone size={ICON_SIZE.micro} />}
                    label={isCloud ? "Cloud" : "Local"}
                    sx={railChipSx}
                  />
                </Box>
              );
            })}

            {!showAll && hiddenCount > 0 && (
              <Link
                component="button"
                variant="caption"
                underline="hover"
                onClick={() => setShowAll(true)}
                sx={{ textAlign: "center", mt: 0.25 }}
              >
                show {hiddenCount} more ▾
              </Link>
            )}
          </Box>
        )}
    </>
  );
}
