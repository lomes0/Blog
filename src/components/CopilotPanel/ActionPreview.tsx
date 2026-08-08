"use client";
import { Box, Typography } from "@mui/material";
import { AlertTriangle } from "lucide-react";
import { commandForTool } from "@/lib/ai/commandTools";
import { ICON_SIZE } from "@/theme/icons";

interface ActionPreviewProps {
  /** Tool name, e.g. "insert_heading". */
  type: string;
  /** Raw tool input arguments. */
  input: Record<string, unknown>;
  /**
   * The command's own `preview()` summary, resolved by `CopilotMessage`.
   *
   * A command's arguments are ids, which say nothing on their own — `preview()`
   * is the command's answer to "what would accepting do".
   */
  summary?: string;
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
 * Renders a human-readable preview of a pending Copilot proposal so the user can
 * see *what* accepting would do — not just the tool name.
 *
 * **Command proposals only, since docs/plans/ai-surface-consolidation.md §4.4.**
 * Content writes used to render here as a list of ops; they are now proposed on
 * the tool call and reviewed as a diff against the document, which is a better
 * answer to "what changed" than a restatement of the ops — see
 * `AgentWriteResult`. What is left is the family with no diff to offer, because
 * a pane split is not a document state.
 */
const ActionPreview: React.FC<ActionPreviewProps> = (
  { type, input, summary, onColoredBg },
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
          size={ICON_SIZE.micro}
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
          typography: "dense",
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

  // Command proposals render from the registry, not from a case per tool —
  // that is the whole point of generating the tool surface. The command's title
  // names the action; its `preview()` says what accepting would do.
  const command = commandForTool(type);
  if (command) {
    return (
      <Box>
        {label(command.title)}
        {snippet(summary ?? command.description ?? command.title)}
      </Box>
    );
  }

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
