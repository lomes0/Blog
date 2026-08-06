/**
 * Inline runs <-> restricted Markdown (plan §4.5).
 *
 * A block's `text` carries its inline formatting, so editing prose does not
 * flatten it. The vocabulary has to be *this app's*, not Markdown's: the
 * toolbar offers highlight, underline, superscript and subscript alongside the
 * familiar four, and Markdown spells none of them — so a bold/italic/code/
 * strike-only codec would silently destroy an underline on every `set_text`.
 *
 * Anything outside the set — an inline text colour, an inline node type with no
 * spelling here — makes the block **text-opaque**: `renderInline` returns null,
 * and the block is then readable and replaceable whole but not editable as
 * text. That fallback is what makes the rule total instead of aspirational.
 */
import {
  IS_BOLD,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from "lexical";
import type { SerializedNode } from "./types";

/**
 * Wrapping order, outermost first. Fixed so that rendering is deterministic —
 * a round-trip can only be an identity if two marks always nest the same way.
 * `code` is innermost because its content is taken literally.
 *
 * **Every delimiter is two characters, and none is a prefix of another.** The
 * obvious spelling — `*` for italic inside `**` for bold — makes bold+italic
 * render as `***`, which the parser splits the wrong way: it takes `**` first
 * and the stranded `*` decays to literal text, losing the italic. Markdown
 * resolves that with lookahead and flanking rules; a prefix-free set resolves
 * it by construction, and costs only that italic is `__` rather than `*`.
 * The property test found this, and would find it again.
 */
const MARKS: ReadonlyArray<{ bit: number; delim: string }> = [
  { bit: IS_HIGHLIGHT, delim: "==" },
  { bit: IS_BOLD, delim: "**" },
  { bit: IS_ITALIC, delim: "__" },
  { bit: IS_UNDERLINE, delim: "++" },
  { bit: IS_STRIKETHROUGH, delim: "~~" },
  { bit: IS_SUPERSCRIPT, delim: "^^" },
  { bit: IS_SUBSCRIPT, delim: ",," },
];

const ALL_MARK_BITS = MARKS.reduce((all, m) => all | m.bit, 0) | IS_CODE;

/**
 * Characters a single occurrence of which opens or closes something, so a
 * literal one always needs escaping.
 *
 * `]` is here even though nothing starts with it: inside link text it is the
 * terminator, so a literal one would end the link early and the whole link
 * would decay to plain text. The property test caught exactly that.
 */
const ALWAYS_ESCAPE = new Set(["\\", "`", "[", "]", "$"]);

/** The distinct characters the mark delimiters are built from. */
const MARK_CHARS = new Set(MARKS.map((m) => m.delim[0]));

/**
 * Escape a literal run.
 *
 * Because every delimiter is doubled, a lone mark character is harmless and
 * stays as it is — "2 * 3", `snake_case` and "a ^ b" all survive unescaped,
 * which is most of why the vocabulary is worth having. A mark character needs
 * escaping in exactly two places:
 *
 *   - doubled, where it would spell a delimiter outright;
 *   - at either end of the run, where it would merge with the delimiter this
 *     run is about to be wrapped in — the `**text*` → `**text***` case, which
 *     otherwise closes the span one character early.
 */
const escapeText = (text: string): string => {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const atBoundary = i === 0 || i === text.length - 1;
    if (ALWAYS_ESCAPE.has(ch)) out += `\\${ch}`;
    else if (MARK_CHARS.has(ch) && (text[i + 1] === ch || atBoundary)) out += `\\${ch}`;
    else out += ch;
  }
  return out;
};

/** A backtick fence long enough that the content cannot close it early. */
function codeFence(text: string): string {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return "`".repeat(longest + 1);
}

/**
 * Render a code span, padding as CommonMark does when the content touches a
 * backtick at either end — otherwise the content's tick and the fence's run
 * together and the span cannot be closed at all.
 */
function renderCode(text: string): string {
  const fence = codeFence(text);
  const padded = text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

/** Undo `renderCode`'s padding. */
function stripCodePadding(text: string): string {
  return text.length > 1 && text.startsWith(" ") && text.endsWith(" ") && text.trim() !== ""
    ? text.slice(1, -1)
    : text;
}

// LaTeX is full of backslashes, so escaping it wholesale would make it
// unreadable — and unauthorable, which defeats the point. Only `$` is
// ambiguous, so only `$` is escaped.
const escapeMath = (latex: string): string => latex.replace(/\$/g, "\\$");
const unescapeMath = (latex: string): string => latex.replace(/\\\$/g, "$");
const escapeUrl = (url: string): string => url.replace(/([\\)])/g, "\\$1");

const textNode = (text: string, format: number): SerializedNode => ({
  type: "text",
  version: 1,
  text,
  detail: 0,
  format,
  mode: "normal",
  style: "",
});

// ---------------------------------------------------------------------------
// Render: nodes -> Markdown
// ---------------------------------------------------------------------------

/**
 * A text node carries formatting this codec cannot spell if it has an inline
 * style, a non-default mode, or a format bit outside the mark set.
 */
function textIsRepresentable(node: SerializedNode): boolean {
  const style = node.style;
  const mode = node.mode;
  const detail = node.detail;
  const format = typeof node.format === "number" ? node.format : 0;
  if (typeof style === "string" && style !== "") return false;
  if (typeof mode === "string" && mode !== "normal") return false;
  if (typeof detail === "number" && detail !== 0) return false;
  return (format & ~ALL_MARK_BITS) === 0;
}

function wrap(body: string, format: number): string {
  let out = format & IS_CODE ? renderCode(body) : body;
  // Innermost last so the outermost mark ends up outermost in the string.
  for (let i = MARKS.length - 1; i >= 0; i--) {
    const { bit, delim } = MARKS[i];
    if (format & bit) out = `${delim}${out}${delim}`;
  }
  return out;
}

/**
 * Render a node's inline children to Markdown, or null if any of them carries
 * something this vocabulary cannot express.
 */
export function renderInline(children: readonly SerializedNode[]): string | null {
  let out = "";

  for (const child of children) {
    switch (child.type) {
      case "text":
      case "code-highlight": {
        if (!textIsRepresentable(child)) return null;
        const format = typeof child.format === "number" ? child.format : 0;
        const raw = typeof child.text === "string" ? child.text : "";
        // Code content is literal inside its fence, so it is never escaped.
        out += format & IS_CODE ? wrap(raw, format) : wrap(escapeText(raw), format);
        break;
      }
      case "linebreak":
        out += "\n";
        break;
      case "tab":
        out += "\t";
        break;
      case "link":
      case "autolink": {
        const inner = renderInline(child.children ?? []);
        if (inner === null) return null;
        const url = typeof child.url === "string" ? child.url : "";
        out += `[${inner}](${escapeUrl(url)})`;
        break;
      }
      case "math": {
        const value = typeof child.value === "string" ? child.value : "";
        out += `$${escapeMath(value)}$`;
        break;
      }
      default:
        // An inline node with no spelling here. Refusing is the whole point:
        // rendering it as its text content would lose it on the way back.
        return null;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Parse: Markdown -> nodes
// ---------------------------------------------------------------------------

/** Index of the next unescaped occurrence of `delim`, or -1. */
function findClose(md: string, from: number, delim: string): number {
  for (let i = from; i <= md.length - delim.length; i++) {
    if (md[i] === "\\") {
      i++;
      continue;
    }
    if (md.startsWith(delim, i)) return i;
  }
  return -1;
}

/** Unescape a literal run produced by `escapeText`. */
function unescapeText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && i + 1 < text.length) {
      out += text[++i];
      continue;
    }
    out += text[i];
  }
  return out;
}

function parseRuns(md: string, format: number): SerializedNode[] {
  const out: SerializedNode[] = [];
  let literal = "";

  const flush = () => {
    if (literal === "") return;
    out.push(textNode(unescapeText(literal), format));
    literal = "";
  };

  let i = 0;
  while (i < md.length) {
    const ch = md[i];

    if (ch === "\\" && i + 1 < md.length) {
      literal += md[i] + md[i + 1];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      flush();
      out.push({ type: "linebreak", version: 1 });
      i++;
      continue;
    }

    // Code: a run of N backticks closes on the next run of exactly N.
    if (ch === "`") {
      const fence = /^`+/.exec(md.slice(i))![0];
      const close = md.indexOf(fence, i + fence.length);
      if (close !== -1) {
        flush();
        out.push(
          textNode(
            stripCodePadding(md.slice(i + fence.length, close)),
            format | IS_CODE,
          ),
        );
        i = close + fence.length;
        continue;
      }
    }

    if (ch === "$") {
      const close = findClose(md, i + 1, "$");
      if (close !== -1) {
        flush();
        out.push({
          type: "math",
          version: 1,
          value: unescapeMath(md.slice(i + 1, close)),
          style: "",
          id: "",
        });
        i = close + 1;
        continue;
      }
    }

    if (ch === "[") {
      const closeText = findClose(md, i + 1, "]");
      if (closeText !== -1 && md[closeText + 1] === "(") {
        const closeUrl = findClose(md, closeText + 2, ")");
        if (closeUrl !== -1) {
          flush();
          out.push({
            type: "link",
            version: 1,
            url: unescapeText(md.slice(closeText + 2, closeUrl)),
            children: parseRuns(md.slice(i + 1, closeText), format),
            direction: null,
            format: "",
            indent: 0,
            rel: null,
            target: null,
            title: null,
          });
          i = closeUrl + 1;
          continue;
        }
      }
    }

    // Marks, longest delimiter first so `**` wins over `*` and `~~` over `~`.
    const mark = MARKS.find(
      (m) => md.startsWith(m.delim, i) && !(format & m.bit),
    );
    if (mark) {
      const close = findClose(md, i + mark.delim.length, mark.delim);
      if (close !== -1) {
        flush();
        out.push(
          ...parseRuns(md.slice(i + mark.delim.length, close), format | mark.bit),
        );
        i = close + mark.delim.length;
        continue;
      }
    }

    literal += ch;
    i++;
  }

  flush();
  return out;
}

/**
 * Merge adjacent text nodes that agree on formatting.
 *
 * Rendering can split one run across several nodes and parsing can rebuild it
 * as several, so without this the round-trip would be an identity on the text
 * but not on the node array.
 */
export function normalizeInline(
  children: readonly SerializedNode[],
): SerializedNode[] {
  const out: SerializedNode[] = [];
  for (const child of children) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      child.type === "text" &&
      prev.format === child.format &&
      prev.style === child.style &&
      prev.mode === child.mode &&
      prev.detail === child.detail
    ) {
      out[out.length - 1] = { ...prev, text: `${prev.text}${child.text}` };
      continue;
    }
    if (child.type === "link" || child.type === "autolink") {
      out.push({ ...child, children: normalizeInline(child.children ?? []) });
      continue;
    }
    out.push(child);
  }
  return out;
}

/** Parse a block's Markdown text back into inline nodes. */
export function parseInline(markdown: string): SerializedNode[] {
  return normalizeInline(parseRuns(markdown, 0));
}
