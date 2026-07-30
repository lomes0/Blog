"use client";
import { Box, Chip } from "@mui/material";

/**
 * Static starter prompts.
 *
 * The design calls for these to be generated from the user's own series and
 * recent posts. That needs an endpoint and a per-session cache that do not
 * exist yet, so v1 ships the fallback set the generated version would degrade
 * to anyway — phrased to work against any library rather than naming content
 * that may not be there.
 */
const SUGGESTIONS = [
  "What have I been writing about lately?",
  "Find posts that contradict each other",
  "Draft a post from my recent notes",
  "Turn my latest post into an outline",
];

interface SuggestionChipsProps {
  /** Fills the composer — deliberately does not submit, so it stays editable. */
  onSelect: (prompt: string) => void;
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({ onSelect }) => (
  <Box
    sx={{
      display: "flex",
      gap: 1,
      flexWrap: "wrap",
      justifyContent: "center",
      maxWidth: 700,
    }}
  >
    {SUGGESTIONS.map((prompt) => (
      <Chip
        key={prompt}
        label={prompt}
        variant="outlined"
        size="small"
        onClick={() => onSelect(prompt)}
        sx={{ cursor: "pointer", typography: "dense" }}
      />
    ))}
  </Box>
);

export default SuggestionChips;
