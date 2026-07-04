"use client";
import { useMemo, useState } from "react";
import { Avatar, Box, Chip, Link, Typography } from "@mui/material";
import { Cloud, History, Smartphone } from "lucide-react";
import { createSelector } from "@reduxjs/toolkit";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { DateDisplay } from "@/components/shared/DateDisplay";
import type { DocumentRevision, EditorDocumentRevision } from "@/types";
import RailSection from "./RailSection";
import { ICON_SIZE } from "@/theme/icons";

const COLLAPSE_AT = 3;

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
        (state: RootState) => isEditMode ? state.ui.tabs.tabIds : rootIdArray,
        (state: RootState) => state.documents.entities,
        (state: RootState) =>
          activeDocId
            ? documentsSelectors.selectById(state, activeDocId)
            : undefined,
        (tabIds, entities, activeDoc) => {
          const sort = (
            list: (DocumentRevision | EditorDocumentRevision)[],
          ) =>
            [...list].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            );

          const all: (DocumentRevision | EditorDocumentRevision)[] = [];
          for (const id of tabIds) {
            const doc = entities[id];
            if (!doc) continue;
            const cloud = doc.cloud?.revisions ?? [];
            const local = (doc.local?.revisions ?? []).filter(
              (lr) => !cloud.some((cr) => cr.id === lr.id),
            );
            all.push(...cloud, ...local);
          }

          const thisTab: (DocumentRevision | EditorDocumentRevision)[] = [];
          if (activeDoc) {
            const cloud = activeDoc.cloud?.revisions ?? [];
            const local = (activeDoc.local?.revisions ?? []).filter(
              (lr) => !cloud.some((cr) => cr.id === lr.id),
            );
            thisTab.push(...cloud, ...local);
          }

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
    <RailSection
      title="Revisions"
      count={revisions.length || undefined}
      icon={<History size={ICON_SIZE.dense} />}
      iconLabel="Revisions"
      defaultOpen={true}
    >
      {isEditMode && (
        <Box sx={{ display: "flex", gap: 0.5, mb: 1 }}>
          <Chip
            label="This tab"
            size="small"
            variant={tabFilter === "this" ? "filled" : "outlined"}
            onClick={() => setTabFilter("this")}
            sx={{ height: 20, typography: "micro", cursor: "pointer" }}
          />
          <Chip
            label="All tabs"
            size="small"
            variant={tabFilter === "all" ? "filled" : "outlined"}
            onClick={() => setTabFilter("all")}
            sx={{ height: 20, typography: "micro", cursor: "pointer" }}
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
                      ? <Cloud size={11} />
                      : <Smartphone size={11} />}
                    label={isCloud ? "Cloud" : "Local"}
                    sx={{
                      height: 16,
                      typography: "micro",
                      "& .MuiChip-label": { px: 0.5 },
                    }}
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
    </RailSection>
  );
}
