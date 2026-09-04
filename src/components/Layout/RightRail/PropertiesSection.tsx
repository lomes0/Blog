"use client";
import { Avatar, Box, Chip, Divider, Link, Typography } from "@mui/material";
import RouterLink from "next/link";
import { postsSelectors, selectSaveTrouble, useSelector } from "@/store";
import { triggerSave } from "@/components/EditDocument/saveRegistry";
import type { RootState } from "@/store";
import { shallowEqual } from "react-redux";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { DocumentStatus } from "@/types";
import { countWords, readingMinutes } from "@/utils/editorContent";
import { seriesPositionOf } from "@/utils/posts/seriesGrouping";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { railChipSx } from "./railChrome";

/** Stable identity — this selector is compared with `shallowEqual`. */
const EMPTY_TAB_IDS: string[] = [];

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
  const { localDoc, cloudDoc, series, tabIds } = useSelector(
    (state: RootState) => {
      const rootUserDoc = postsSelectors.selectById(state, rootId);
      const activeUserDoc = activeDocId
        ? postsSelectors.selectById(state, activeDocId)
        : undefined;
      // The store is empty during SSR and until `load` resolves, so a rootId
      // parsed out of the URL can name a post that isn't in the entity map yet.
      const seriesId = rootUserDoc?.seriesId;
      return {
        localDoc: activeUserDoc ?? rootUserDoc,
        cloudDoc: rootUserDoc,
        series: seriesId
          ? state.series.find((s) => s.id === seriesId)
          : undefined,
        tabIds: selectFocusedPane(state)?.tabIds ?? EMPTY_TAB_IDS,
      };
    },
    shallowEqual,
  );

  const hasMultipleTabs = tabIds.length > 1;
  // Undefined unless a save is retrying or has failed — see `selectSaveTrouble`.
  // Falls back to the pane's root: `activeDocId` is null for the beat between a
  // pane opening and `setPaneTabs` landing, and a save in trouble during that
  // window is exactly when the user needs to be told.
  const saveTrouble = useSelector(selectSaveTrouble(activeDocId ?? rootId));

  const activeLocalDoc = useSelector((state: RootState) =>
    activeDocId ? postsSelectors.selectById(state, activeDocId) : undefined
  );

  const wordCount = countWords(activeLocalDoc?.data);
  const readMin = readingMinutes(wordCount);

  const statusColors: Record<DocumentStatus, string> = {
    [DocumentStatus.ACTIVE]: "info",
    [DocumentStatus.DONE]: "success",
  } as Record<DocumentStatus, string>;

  const status = cloudDoc?.status ?? localDoc?.status;

  return (
    <>
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
            typography: "micro",
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
                color={(status ? statusColors[status] : undefined) as
                  | "info"
                  | "success"
                  | undefined ?? "default"}
                variant="outlined"
                sx={railChipSx}
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

        {series && (() => {
          const position = seriesPositionOf(series, cloudDoc?.id ?? "");
          return (
            <KVRow
              k="Series"
              v={`${series.title}${
                position != null
                  ? ` · ${position}/${series.posts?.length ?? "?"}`
                  : ""
              }`}
            />
          );
        })()}

        {(cloudDoc?.handle || localDoc?.handle) && (
          <KVRow
            k="Slug"
            v={
              <Box
                component="span"
                sx={{ fontFamily: MONO_FONT, typography: "micro" }}
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

        {
          /* Absent while saving works — which is nearly always. A row that said
            "Saved" the rest of the time was reporting the one outcome the user
            already assumes, and flipping it to "Unsaved" on every pause in
            typing made the assumption look wrong when it wasn't.

            It belongs to the *post* section, not the "This tab" one below:
            that block only renders when a pane has more than one tab, so a
            single-tab document — the ordinary case — could never show this,
            and the collapsed-rail badge would light with nothing to explain
            it. See docs/plans/archive/quiet-autosave.md §3.2. */
        }
        {saveTrouble && (
          <KVRow
            k="Save"
            v={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: saveTrouble === "error"
                      ? "error.main"
                      : "warning.main",
                    flexShrink: 0,
                  }}
                />
                <Typography variant="caption" color="text.secondary">
                  {saveTrouble === "error"
                    ? "Couldn't save"
                    : "Reconnecting… saved locally"}
                </Typography>
                {
                  /* Only on a hard error. `retrying` is already on a backoff and
                    re-fires on the `online` event (useSave), so offering a
                    manual retry there is offering to do what is happening
                    anyway. */
                }
                {saveTrouble === "error" && (
                  <Link
                    component="button"
                    type="button"
                    variant="caption"
                    onClick={() => void triggerSave()}
                  >
                    Retry
                  </Link>
                )}
              </Box>
            }
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
              typography: "micro",
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
            {activeLocalDoc?.title && (
              <KVRow k="Title" v={activeLocalDoc.title} />
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
          </Box>
        </>
      )}
    </>
  );
}
