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
   * A command's own `preview()` summary, resolved by `CopilotMessage`.
   *
   * Only command tools have one: the content tools' arguments *are* the
   * preview (the old and new text), whereas a command's are ids, which say
   * nothing on their own.
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

const firstLine = (text: string, max = 70): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** One line describing a block the agent wants to write. */
function describeBlock(value: unknown): string {
  const block = value as Record<string, unknown>;
  const type = asString(block?.type) || "block";
  if (typeof block?.text === "string") return `${type}: ${firstLine(block.text)}`;
  if (typeof block?.code === "string") return `${type}: ${firstLine(block.code)}`;
  if (typeof block?.summary === "string") {
    return `${type}: ${firstLine(block.summary)}`;
  }
  if (Array.isArray(block?.items)) return `${type} · ${block.items.length} items`;
  if (Array.isArray(block?.tasks)) return `${type} · ${block.tasks.length} cards`;
  return type;
}

/**
 * One line per operation.
 *
 * The agent names the blocks it changes rather than restating the document, so
 * a whole-body diff would be mostly unchanged text. The addresses are the
 * useful part — and "deletes b7" is what a user most needs to see before
 * accepting.
 */
function describeOp(value: unknown): string {
  const op = value as Record<string, unknown>;
  const target = (): string =>
    asString(op.after) || asString(op.before) || asString(op.appendTo) || "the end";

  switch (asString(op.op)) {
    case "set_text":
      return `${asString(op.id)} → ${firstLine(asString(op.text))}`;
    case "replace_block":
      return `${asString(op.id)} replaced by ${describeBlock(op.block)}`;
    case "insert_blocks": {
      const blocks = Array.isArray(op.blocks) ? op.blocks : [];
      return `insert ${blocks.length} block${
        blocks.length === 1 ? "" : "s"
      } at ${target()}: ${blocks.map(describeBlock).join("; ")}`;
    }
    case "delete_block":
      return `delete ${asString(op.id)}`;
    case "move_block":
      return `move ${asString(op.id)} to ${target()}`;
    default:
      return asString(op.op) || "unknown operation";
  }
}

/**
 * Renders a human-readable preview of a pending Copilot edit so the user can
 * see *what* will be inserted before accepting — not just the tool name.
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

    case "apply_ops": {
      const ops = Array.isArray(input.ops) ? input.ops : [];
      // Say what each op does to which block. The agent names blocks rather
      // than restating the document, so a diff of the whole body would be both
      // huge and mostly unchanged — the addresses are the useful part, and
      // "deletes b7" is the line a user most needs to notice before accepting.
      const destructive = ops.some(
        (op) => (op as { op?: string }).op === "delete_block",
      );
      return (
        <Box>
          {label(
            `Edit ${ops.length} block${ops.length === 1 ? "" : "s"}`,
            destructive,
          )}
          {snippet(ops.map(describeOp).join("\n"))}
        </Box>
      );
    }

    case "create_document": {
      const blocks = Array.isArray(input.blocks) ? input.blocks : [];
      return (
        <Box>
          {label(`New post · ${asString(input.title)}`)}
          {snippet(blocks.map(describeBlock).join("\n"))}
        </Box>
      );
    }

    default:
      return label(type.replace(/_/g, " "));
  }
};

export default ActionPreview;
