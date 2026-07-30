"use client";
import { forwardRef } from "react";
import { Box, IconButton, InputBase, Typography } from "@mui/material";
import { Send } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { FOCUS_RING, MOTION } from "@/theme/tokens";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { HOME_COLUMN_W } from "./layout";

interface HomeComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /**
   * Signed-out visitors reach this route through the local (IndexedDB) backend,
   * but both AI routes require a session. Rather than let a submit fail with a
   * 401, the composer says so up front and refuses to send.
   */
  disabledReason?: string;
}

/**
 * The home pane's composer.
 *
 * Deliberately *not* a second AI composer: it collects a prompt and hands it to
 * the Copilot, which owns the conversation, the model picker and the streaming
 * UI. Everything here is the input affordance and nothing else.
 */
const HomeComposer = forwardRef<HTMLTextAreaElement, HomeComposerProps>(
  ({ value, onChange, onSubmit, disabledReason }, ref) => {
    const canSend = value.trim().length > 0 && !disabledReason;

    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Shift+Enter is a newline; Enter sends. Matches the Copilot composer.
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canSend) onSubmit();
      }
    };

    return (
      <Box
        sx={(theme) => ({
          width: HOME_COLUMN_W,
          bgcolor: "background.input",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 3,
          px: 2,
          py: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          transition:
            `border-color ${MOTION.fast}ms, box-shadow ${MOTION.fast}ms`,
          // The whole container reads as the field, so it carries the focus
          // treatment for the textarea nested inside it.
          "&:focus-within": {
            borderColor: "primary.main",
            boxShadow: FOCUS_RING.card(theme),
          },
        })}
      >
        <InputBase
          inputRef={ref}
          multiline
          maxRows={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your posts, or start writing…"
          inputProps={{ "aria-label": "Ask your posts" }}
          sx={{
            p: 0,
            typography: "body2",
            color: "text.primary",
            "& textarea::placeholder": { color: "text.secondary", opacity: 1 },
          }}
        />

        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          {disabledReason
            ? (
              <Typography variant="micro" sx={{ color: "text.secondary" }}>
                {disabledReason}
              </Typography>
            )
            : (
              <Typography
                variant="micro"
                sx={{
                  fontFamily: MONO_FONT,
                  color: "text.secondary",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  px: 1,
                  py: 0.25,
                }}
              >
                ⌘K commands
              </Typography>
            )}

          <Box sx={{ flex: 1 }} />

          <IconButton
            size="small"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Ask Copilot"
            sx={{
              bgcolor: canSend ? "primary.main" : "action.disabledBackground",
              color: canSend ? "primary.contrastText" : "action.disabled",
              borderRadius: 2,
              "&:hover": {
                bgcolor: canSend ? "primary.dark" : "action.disabledBackground",
              },
              "&.Mui-disabled": { color: "action.disabled" },
              transition: `background-color ${MOTION.fast}ms`,
            }}
          >
            <Send size={ICON_SIZE.dense} />
          </IconButton>
        </Box>
      </Box>
    );
  },
);

HomeComposer.displayName = "HomeComposer";

export default HomeComposer;
