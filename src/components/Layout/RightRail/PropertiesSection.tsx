"use client";
import { Avatar, Box, Chip, Divider, Typography } from "@mui/material";
import { Info } from "lucide-react";
import RouterLink from "next/link";
import { documentsSelectors, useSelector } from "@/store";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { DocumentStatus } from "@/types";
import { countWords } from "@/utils/editorContent";
import RailSection from "./RailSection";
import { ICON_SIZE } from "@/theme/icons";

interface PropertiesSectionProps {
  rootId: string;
  activeDocId: string | null;
  isEditMode: boolean;
}

const KVRow = ({
  k,
  v,
}: {
  k: string;
  v: React.ReactNode;
}) => (
  <>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ lineHeight: 1.6, whiteSpace: "nowrap" }}
    >
      {k}
    </Typography>
    <Box sx={{ typography: "caption", lineHeight: 1.6 }}>{v}</Box>
  </>
);

export default function PropertiesSection({
  rootId,
  activeDocId,
  isEditMode,
}: PropertiesSectionProps) {
  const { localDoc, cloudDoc, series, tabIds, dirtyTabIds } = useSelector(
    (state: RootState) => {
      const rootUserDoc = documentsSelectors.selectById(state, rootId);
      const activeUserDoc = activeDocId
        ? documentsSelectors.selectById(state, activeDocId)
        : undefined;
      const seriesId = rootUserDoc?.cloud?.seriesId ??
        rootUserDoc?.local?.seriesId;
      return {
        localDoc: activeUserDoc?.local ?? rootUserDoc?.local,
        cloudDoc: rootUserDoc?.cloud,
        series: seriesId
          ? state.series.find((s) => s.id === seriesId)
          : undefined,
        tabIds: state.ui.tabs.tabIds,
        dirtyTabIds: state.ui.tabs.dirtyTabIds,
      };
    },
    shallowEqual,
  );

  const hasMultipleTabs = tabIds.length > 1;
  const isTabDirty = activeDocId ? dirtyTabIds.includes(activeDocId) : false;

  const activeLocalDoc = useSelector((state: RootState) => {
    if (!activeDocId) return undefined;
    const doc = documentsSelectors.selectById(state, activeDocId);
    return doc?.local;
  });

  const wordCount = countWords(activeLocalDoc?.data);
  const readMin = Math.max(1, Math.ceil(wordCount / 200));

  const statusColors: Record<DocumentStatus, string> = {
    [DocumentStatus.ACTIVE]: "info",
    [DocumentStatus.DONE]: "success",
  } as Record<DocumentStatus, string>;

  const status = cloudDoc?.status ?? localDoc?.status;

  return (
    <RailSection
      title="Properties"
      icon={<Info size={ICON_SIZE.dense} />}
      iconLabel="Properties"
      defaultOpen={true}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "2px 10px",
          alignItems: "baseline",
        }}
      >
        {/* --- Post-level properties --- */}
        <Typography
          variant="caption"
          sx={{
            gridColumn: "1 / -1",
            color: "text.disabled",
            fontSize: "0.62rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            mb: 0.25,
            mt: 0.5,
          }}
        >
          Post · shared
        </Typography>

        {status && (
          <KVRow
            k="Status"
            v={
              <Chip
                label={status === DocumentStatus.ACTIVE ? "Active" : "Done"}
                size="small"
                color={(statusColors[status] as "info" | "success") ??
                  "default"}
                variant="outlined"
                sx={{ height: 18, fontSize: "0.65rem" }}
              />
            }
          />
        )}

        {cloudDoc?.author && (
          <KVRow
            k="Author"
            v={
              <Box
                component={RouterLink}
                href={`/user/${cloudDoc.author.handle || cloudDoc.author.id}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: "text.primary",
                  textDecoration: "none",
                  "&:hover": { color: "primary.main" },
                }}
              >
                <Avatar
                  src={cloudDoc.author.image ?? undefined}
                  alt={cloudDoc.author.name}
                  sx={{ width: 16, height: 16 }}
                />
                {cloudDoc.author.name}
              </Box>
            }
          />
        )}

        {series && (
          <KVRow
            k="Series"
            v={`${series.title}${
              cloudDoc?.seriesOrder != null
                ? ` · ${cloudDoc.seriesOrder}/${series.posts?.length ?? "?"}`
                : ""
            }`}
          />
        )}

        {(cloudDoc?.handle || localDoc?.handle) && (
          <KVRow
            k="Slug"
            v={
              <Box
                component="span"
                sx={{ fontFamily: "monospace", fontSize: "0.72rem" }}
              >
                {cloudDoc?.handle ?? localDoc?.handle}
              </Box>
            }
          />
        )}

        {localDoc?.createdAt && (
          <KVRow
            k="Created"
            v={<DateDisplay date={localDoc.createdAt} variant="short" />}
          />
        )}
      </Box>

      {/* --- Tab-level properties --- */}
      {isEditMode && hasMultipleTabs && (
        <>
          <Divider
            sx={{
              my: 1,
              borderStyle: "dashed",
              borderColor: "info.light",
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: "info.main",
              fontSize: "0.62rem",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              display: "block",
              mb: 0.5,
            }}
          >
            ▤ This tab
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "2px 10px",
              alignItems: "baseline",
            }}
          >
            {activeLocalDoc?.name && (
              <KVRow k="Title" v={activeLocalDoc.name} />
            )}
            {activeLocalDoc?.updatedAt && (
              <KVRow
                k="Updated"
                v={
                  <DateDisplay date={activeLocalDoc.updatedAt} variant="full" />
                }
              />
            )}
            {wordCount > 0 && (
              <KVRow
                k="Words"
                v={`${wordCount.toLocaleString()} · ${readMin} min`}
              />
            )}
            <KVRow
              k="Save"
              v={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      bgcolor: isTabDirty ? "warning.main" : "success.main",
                      flexShrink: 0,
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {isTabDirty ? "Unsaved" : "Saved"}
                  </Typography>
                </Box>
              }
            />
          </Box>
        </>
      )}
    </RailSection>
  );
}
