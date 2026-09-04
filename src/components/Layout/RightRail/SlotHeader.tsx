"use client";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { Columns2, X } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import type { SlotIndex, ViewId } from "./panelState";
import { VIEWS } from "./views";

interface SlotHeaderProps {
  view: ViewId;
  index: SlotIndex;
  /** Whether this slot takes the next rail click. */
  focused: boolean;
  /** Whether the panel is showing two slots — only then is focus ambiguous. */
  split: boolean;
  count: number | null;
  onSplit: () => void;
  onClose: () => void;
}

/**
 * The bar above a slot's content.
 *
 * It owns the title, the split control and the close button — the chrome each
 * section used to draw for itself through `RailSection`. That is why the
 * sections are now bare content: with one card per section the title *was* the
 * collapse toggle, and with one slot per view there is nothing left to collapse
 * into.
 *
 * The split button is only on the focused slot, because that is the slot the
 * next selection fills; two split buttons would be two different promises about
 * where the next view lands.
 */
export default function SlotHeader({
  view,
  index,
  focused,
  split,
  count,
  onSplit,
  onClose,
}: SlotHeaderProps) {
  const { title, icon: Icon } = VIEWS[view];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.875,
        flexShrink: 0,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box sx={{ color: "text.secondary", display: "flex", flexShrink: 0 }}>
        <Icon size={ICON_SIZE.dense} />
      </Box>
      <Typography
        variant="caption"
        fontWeight={700}
        sx={{ flex: 1, textAlign: "left", lineHeight: 1.2 }}
        // The heading a screen reader lands on when it enters the slot, and the
        // label the slot region points at.
        id={`rail-slot-${index}-title`}
      >
        {title}
        {count !== null && count > 0 && (
          <Box
            component="span"
            sx={{ color: "text.disabled", fontWeight: 600, ml: 0.75 }}
          >
            {count}
          </Box>
        )}
      </Typography>

      {
        /* Only on the focused slot. In single-slot mode it opens the second
          slot; in split mode it closes the other one, so the icon is a toggle
          rather than an "add". */
      }
      {focused && (
        <Tooltip
          title={split ? "Close split (⌘\\)" : "Split panel (⌘\\)"}
          placement="left"
        >
          <IconButton
            size="small"
            onClick={onSplit}
            aria-label={split ? "Close split" : "Split panel"}
            aria-pressed={split}
            sx={{ p: 0.25, color: split ? "accent.main" : "text.secondary" }}
          >
            <Columns2 size={ICON_SIZE.dense} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={`Close ${title}`} placement="left">
        <IconButton
          size="small"
          onClick={onClose}
          aria-label={`Close ${title}`}
          sx={{ p: 0.25, color: "text.secondary" }}
        >
          <X size={ICON_SIZE.dense} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
