"use client";
import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { MarqueeRect } from "./hooks/useNotesSelection";

/**
 * The rubber-band rectangle drawn while dragging on empty board.
 *
 * Rendered inside the scaled board, so its coordinates are the same unscaled
 * units the notes use. `pointerEvents: none` is load-bearing: the drag is
 * tracked by a listener that identifies empty board as
 * `event.target === event.currentTarget`, which a hit-testable overlay would
 * break the moment the pointer passed back over it.
 */
export default function SelectionMarquee({ rect }: { rect: MarqueeRect }) {
  return (
    <Box
      sx={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
        border: "1px solid",
        borderColor: "primary.main",
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
        borderRadius: "2px",
        // Above every note, whatever they have raced their zIndex up to.
        zIndex: 10000,
      }}
    />
  );
}
