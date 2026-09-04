"use client";
import * as React from "react";
import { Box, Skeleton, Tooltip } from "@mui/material";
import { postsSelectors, selectAnySaveTrouble, useSelector } from "@/store";
import type { RootState } from "@/store";
import {
  selectFocusedDocId,
  selectFocusedDocMode,
} from "@/store/selectors/layoutSelectors";
import { uiCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { countWords, readingMinutes } from "@/utils/editorContent";
import { CHROME_RING } from "@/theme/treeRow";

/** DESIGN.md §17.1 — the status bar's row height. */
const STATUS_BAR_H = 26;

/**
 * Between two readings. Decorative, so it is not read out.
 *
 * Spacing lives on the separators rather than as a `gap` on the row, because
 * the save-trouble field is a live region that must stay mounted while it has
 * nothing to say — and a `gap` would reserve 8px for that empty item forever.
 */
const Sep = () => (
  <Box component="span" aria-hidden sx={{ mx: 1, color: "text.disabled" }}>
    ·
  </Box>
);

const Item: React.FC<React.PropsWithChildren> = ({ children }) => (
  <Box
    component="span"
    sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
  >
    {children}
  </Box>
);

/**
 * The workspace's bottom rail: what is being looked at, and the one thing about
 * it that might have gone wrong.
 *
 * The last item of docs/plans/archive/ide-redesign.md's deferred list. Two of the five
 * fields that plan named are deliberately absent, because later work overtook
 * it:
 *
 * - **No "Saved" / "Saving…".** docs/plans/archive/quiet-autosave.md shipped
 *   after that plan was written and removed eight always-on save-state
 *   surfaces; a ninth here would undo it. What is left is the exception —
 *   `selectAnySaveTrouble`, which is documented as the selector "for
 *   always-visible chrome" and answers `undefined` for both `idle` and
 *   `saving`, so this field renders nothing at all on the happy path.
 * - **No "AI ready".** Since docs/plans/archive/byo-provider-keys.md there is no
 *   deployment API key to be ready: each user brings their own, and whether
 *   one is present is already answered by `RightRail/ProviderKeys.tsx`. A copy
 *   here would be a third surface for one fact.
 *
 * The mode field is the exception to "status bar", and by the same argument
 * that removed the other two: it was already rendering "Read"/"Edit" while
 * `EditorTopBar` carried an eye/pencil button for the same state, so one of the
 * two had to go. This one stayed because it says which mode you are *in*; a
 * lone icon can only show the mode you would switch *to*, which is the standard
 * ambiguity of a single-glyph toggle. It is a button now, and it is the only
 * item in this bar you can act on.
 */
const StatusBar: React.FC = () => {
  const trouble = useSelector(selectAnySaveTrouble);
  const run = useCommandRun();

  /*
   * Global focus is the right coordinate *here*, and it is worth saying why,
   * because the opposite call was made a commit ago and this looks like the
   * same question.
   *
   * `c63de634` moved the editor's attachment path off this selector and onto a
   * per-editor context: an editor in an unfocused pane must act on its own
   * document, not on whichever one has focus. That reasoning is about a
   * component that exists once *per pane*.
   *
   * This bar exists once per *window*. It describes whatever the user is
   * looking at, and "whatever the user is looking at" is precisely what
   * `selectFocusedDocId` means — the same reading the Copilot, the right rail
   * and the breadcrumb already take. Do not convert it to a pane context.
   */
  const docId = useSelector(selectFocusedDocId);
  const mode = useSelector(selectFocusedDocMode);

  const post = useSelector((state: RootState) =>
    docId ? postsSelectors.selectById(state, docId) : undefined
  );

  // `data` is a whole document tree; walking it on every unrelated render of
  // the shell is not free on a long post.
  const words = React.useMemo(() => countWords(post?.data), [post?.data]);

  // `list()` returns metadata without content, so a post can be in the store
  // with no `data` yet — that is "opening", not "empty". An opened document
  // with an empty root is the genuinely empty one.
  const loading = docId !== null && !post?.data;

  const troubleLabel = trouble === "error"
    ? "Couldn't save"
    : "Reconnecting… saved locally";

  return (
    <Box
      component="footer"
      aria-label="Workspace status"
      sx={{
        flexShrink: 0,
        height: STATUS_BAR_H,
        display: "flex",
        alignItems: "center",
        px: 1.5,
        // DESIGN.md §17.1 (surface + top rule) and §17.2 (status-bar items are
        // `micro`).
        bgcolor: "background.sidebar",
        borderTop: "1px solid",
        borderColor: "divider",
        typography: "micro",
        color: "text.secondary",
        whiteSpace: "nowrap",
        overflow: "hidden",
        displayPrint: "none",
      }}
    >
      {
        /* Mounted even when silent, so that a failure appearing later is an
          insertion into a live region rather than a new one — an announcement
          either way, but only this way on the first failure of a session.
          `role="status"` is the polite one: a save that is retrying must not
          interrupt what is being typed, which is the very thing at risk. */
      }
      <Box role="status" sx={{ display: "inline-flex", alignItems: "center" }}>
        {trouble && (
          <>
            <Item>
              <Box
                aria-hidden
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  bgcolor: trouble === "error" ? "error.main" : "warning.main",
                }}
              />
              {
                /* The words carry the state and the dot is the redundant cue —
                  §10's "never by colour alone", satisfied in the direction that
                  also passes contrast. `error.main` / `warning.main` as *text*
                  would not: both are tuned to be read as a 7px fill or a 1px
                  rule, and at 11px on `background.sidebar` neither clears AA in
                  both schemes. `PropertiesSection` colours the same pair the
                  same way. */
              }
              <Box component="span" sx={{ color: "text.primary" }}>
                {troubleLabel}
              </Box>
            </Item>
            <Sep />
          </>
        )}
      </Box>

      {mode && (
        <>
          <Tooltip
            title={mode === "read" ? "Switch to editing" : "Switch to reading"}
          >
            <Box
              component="button"
              type="button"
              aria-label={mode === "read"
                ? "Switch to editing"
                : "Switch to reading"}
              aria-pressed={mode === "read"}
              onClick={() =>
                run(uiCommands.setMode, {
                  mode: mode === "read" ? "write" : "read",
                })}
              sx={{
                // A button that has to disappear into an 11px status rail: no
                // border, no background, and the bar's own type and colour
                // rather than the browser's.
                font: "inherit",
                color: "inherit",
                bgcolor: "transparent",
                border: "none",
                p: 0,
                // Undoes the button's inline-block baseline so the word sits on
                // the same line as the readings either side of it.
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                // Breathing room for the hover fill, taken straight back off
                // again so the resting row is laid out exactly as it was when
                // this field was plain text.
                px: 0.5,
                mx: -0.5,
                borderRadius: 0.5,
                // The affordance is the hover, because at rest this must still
                // read as a report of the current mode rather than as chrome —
                // it is the one item in the bar you can act on, and the bar is
                // otherwise silent by design (quiet-autosave).
                transition: "background-color 0.15s, color 0.15s",
                "&:hover": {
                  color: "text.primary",
                  bgcolor: "action.hover",
                },
                "&:focus-visible": CHROME_RING,
              }}
            >
              {mode === "read" ? "Read" : "Edit"}
            </Box>
          </Tooltip>
          <Sep />
        </>
      )}

      {docId === null ? <Item>No document</Item> : loading
        ? (
          <Skeleton
            variant="rounded"
            width={92}
            height={8}
            sx={{ borderRadius: 1 }}
          />
        )
        : words === 0
        ? <Item>No content yet</Item>
        : (
          <>
            <Item>{words.toLocaleString()} words</Item>
            <Sep />
            <Item>~{readingMinutes(words)} min read</Item>
          </>
        )}
    </Box>
  );
};

export default StatusBar;
