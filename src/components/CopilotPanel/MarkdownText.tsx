"use client";
import { Fragment, type ReactNode } from "react";
import { Box, Link, Typography } from "@mui/material";

/**
 * Minimal Markdown → MUI renderer for short Copilot replies. Intentionally
 * scoped to the subset assistants actually emit: headings, bullet/numbered
 * lists, blockquotes, fenced + inline code, bold, italic, and links. Anything
 * unrecognized falls through as plain text. No external dependency — styling
 * stays on MUI tokens per DESIGN.md.
 */

interface MarkdownTextProps {
  children: string;
}

const INLINE_PATTERNS: { type: string; re: RegExp }[] = [
  { type: "code", re: /`([^`]+)`/ },
  { type: "bold", re: /\*\*([^*]+)\*\*/ },
  { type: "italic", re: /\*([^*]+)\*|_([^_]+)_/ },
  { type: "link", re: /\[([^\]]+)\]\(([^)\s]+)\)/ },
];

/** Render inline emphasis/code/links within a single line of text. */
function renderInline(text: string, keyPrefix: string): ReactNode {
  let earliest: { type: string; index: number; match: RegExpExecArray } | null =
    null;
  for (const { type, re } of INLINE_PATTERNS) {
    const m = re.exec(text);
    if (m && (earliest === null || m.index < earliest.index)) {
      earliest = { type, index: m.index, match: m };
    }
  }

  if (!earliest) return text;

  const { type, index, match } = earliest;
  const before = text.slice(0, index);
  const after = text.slice(index + match[0].length);
  const afterNode = renderInline(after, `${keyPrefix}a`);
  const key = `${keyPrefix}-${index}`;

  let node: ReactNode;
  switch (type) {
    case "code":
      node = (
        <Box
          key={key}
          component="code"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.85em",
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            bgcolor: "action.hover",
          }}
        >
          {match[1]}
        </Box>
      );
      break;
    case "bold":
      node = (
        <strong key={key}>{renderInline(match[1], `${keyPrefix}b`)}</strong>
      );
      break;
    case "italic":
      node = (
        <em key={key}>
          {renderInline(match[1] ?? match[2], `${keyPrefix}i`)}
        </em>
      );
      break;
    case "link":
      node = (
        <Link
          key={key}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: "inherit", textDecorationColor: "currentColor" }}
        >
          {match[1]}
        </Link>
      );
      break;
    default:
      node = match[0];
  }

  return (
    <Fragment key={`${keyPrefix}f`}>
      {before}
      {node}
      {afterNode}
    </Fragment>
  );
}

const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+\.\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

const MarkdownText: React.FC<MarkdownTextProps> = ({ children }) => {
  const lines = children.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <Box
          key={k++}
          component="pre"
          sx={{
            m: 0,
            my: 0.5,
            p: 1,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {code.join("\n")}
        </Box>,
      );
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push(
        <Typography
          key={k++}
          variant="subtitle2"
          sx={{ fontWeight: 700, mt: 0.5 }}
        >
          {renderInline(heading[2], `h${k}`)}
        </Typography>,
      );
      i++;
      continue;
    }

    // Blockquote (consecutive)
    if (QUOTE_RE.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quote.push(QUOTE_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push(
        <Box
          key={k++}
          sx={{
            borderLeft: 2,
            borderColor: "divider",
            pl: 1,
            my: 0.5,
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">
            {renderInline(quote.join(" "), `q${k}`)}
          </Typography>
        </Box>,
      );
      continue;
    }

    // Lists (consecutive bullet or numbered)
    if (BULLET_RE.test(line) || NUMBERED_RE.test(line)) {
      const numbered = NUMBERED_RE.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = numbered ? NUMBERED_RE.exec(lines[i]) : BULLET_RE.exec(
          lines[i],
        );
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push(
        <Box
          key={k++}
          component={numbered ? "ol" : "ul"}
          sx={{ m: 0, my: 0.5, pl: 2.5 }}
        >
          {items.map((item, idx) => (
            <Typography key={idx} component="li" variant="body2">
              {renderInline(item, `li${k}-${idx}`)}
            </Typography>
          ))}
        </Box>,
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (consecutive plain lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !NUMBERED_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <Typography key={k++} variant="body2" sx={{ "&:not(:first-of-type)": { mt: 0.5 } }}>
        {para.map((p, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(p, `p${k}-${idx}`)}
          </Fragment>
        ))}
      </Typography>,
    );
  }

  return <>{blocks}</>;
};

export default MarkdownText;
