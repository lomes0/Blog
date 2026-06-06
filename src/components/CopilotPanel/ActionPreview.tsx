"use client";
import { Box, Typography } from "@mui/material";
import { AlertTriangle } from "lucide-react";

interface ActionPreviewProps {
  /** Tool name, e.g. "insert_heading". */
  type: string;
  /** Raw tool input arguments. */
  input: Record<string, unknown>;
  /** Render against a colored (user) bubble — flips text colors. */
  onColoredBg?: boolean;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const TABLE_LABEL = (input: Record<string, unknown>): string => {
  const rows = typeof input.rows === "number" ? input.rows : "?";
  const cols = typeof input.cols === "number" ? input.cols : "?";
  return `${rows} × ${cols} table`;
};

/**
 * Renders a human-readable preview of a pending Copilot edit so the user can
 * see *what* will be inserted before accepting — not just the tool name.
 */
const ActionPreview: React.FC<ActionPreviewProps> = (
  { type, input, onColoredBg },
) => {
  const labelColor = onColoredBg ? "primary.contrastText" : "text.secondary";
  const bodyColor = onColoredBg ? "primary.contrastText" : "text.primary";

  const label = (text: string, destructive = false) => (
    <Typography
      variant="overline"
      sx={{
        display: "block",
        lineHeight: 1.6,
        color: destructive && !onColoredBg ? "warning.main" : labelColor,
      }}
    >
      {destructive && (
        <AlertTriangle
          size={11}
          style={{ marginRight: 4, verticalAlign: "-1px" }}
        />
      )}
      {text}
    </Typography>
  );

  const snippet = (text: string, mono = false) => (
    <Typography
      variant="body2"
      sx={{
        color: bodyColor,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        ...(mono && {
          fontFamily: "monospace",
          fontSize: "0.75rem",
          maxHeight: 96,
          overflow: "hidden",
        }),
        // Clamp long prose to a few lines.
        display: "-webkit-box",
        WebkitLineClamp: mono ? 5 : 4,
        WebkitBoxOrient: "vertical",
      }}
    >
      {text}
    </Typography>
  );

  switch (type) {
    case "insert_heading": {
      const level = typeof input.level === "number" ? input.level : 1;
      return (
        <Box>
          {label(`Heading H${level}`)}
          {snippet(asString(input.text))}
        </Box>
      );
    }

    case "insert_paragraph":
      return (
        <Box>
          {label("New paragraph")}
          {snippet(asString(input.text))}
        </Box>
      );

    case "insert_list": {
      const items = Array.isArray(input.items)
        ? (input.items as unknown[]).map(asString).filter(Boolean)
        : [];
      const shown = items.slice(0, 3);
      const extra = items.length - shown.length;
      const kind = input.type === "numbered" ? "Numbered" : "Bullet";
      return (
        <Box>
          {label(`${kind} list`)}
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {shown.map((item, i) => (
              <Typography
                key={i}
                component="li"
                variant="body2"
                sx={{ color: bodyColor, overflowWrap: "anywhere" }}
              >
                {item}
              </Typography>
            ))}
          </Box>
          {extra > 0 && label(`+${extra} more`)}
        </Box>
      );
    }

    case "insert_table":
      return (
        <Box>
          {label(TABLE_LABEL(input))}
          {Array.isArray(input.headers) && input.headers.length > 0 &&
            snippet((input.headers as unknown[]).map(asString).join(" · "))}
        </Box>
      );

    case "insert_code_block":
      return (
        <Box>
          {label(
            `Code${input.language ? ` · ${asString(input.language)}` : ""}`,
          )}
          {snippet(asString(input.code), true)}
        </Box>
      );

    case "insert_math":
      return (
        <Box>
          {label("Math equation")}
          {snippet(asString(input.latex), true)}
        </Box>
      );

    case "insert_horizontal_rule":
      return label("Horizontal divider");

    case "replace_selection":
      return (
        <Box>
          {label("Replace selected text with")}
          {snippet(asString(input.newText))}
        </Box>
      );

    case "replace_text":
      return (
        <Box>
          {label("Reword this block")}
          {snippet(asString(input.newText))}
        </Box>
      );

    case "remove_node":
      return label("Remove this block", true);

    default:
      return label(type.replace(/_/g, " "));
  }
};

export default ActionPreview;
