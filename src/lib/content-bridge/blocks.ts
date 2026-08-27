/**
 * Block IR <-> Lexical nodes (plan §4.6).
 *
 * Phase 1 gives codecs to paragraph, heading, quote, list and code. Everything
 * else is **opaque**: readable, addressable, movable, deletable — never
 * rewritten. Per §4.1 that costs nothing, because an untouched node is
 * preserved by not being touched, so graduating a type later is additive and
 * has no correctness deadline.
 *
 * ### Carry-through (§4.6.1)
 *
 * A clean IR is the hazard: `{ type: "code", language, code }` says nothing
 * about the app's `width` or `wrap`, so building a node from the IR alone would
 * strip them. Every write therefore takes the node it is replacing and spreads
 * it, so fields the IR does not model survive by default and a codec has to opt
 * *out* of preserving something rather than opt in.
 */
import type {
  AttachmentBlock,
  Block,
  CellHeader,
  CodeBlock,
  CodeSnippetBlock,
  DetailsBlock,
  HeadingBlock,
  ImageBlock,
  KanbanTask,
  ListBlock,
  ListItem,
  ListType,
  NestedDocBlock,
  ParagraphBlock,
  QuoteBlock,
  SerializedNode,
  SummaryBlock,
  TableCellBlock,
  WritableBlock,
} from "./types";
import { parseInline, renderInline } from "./inline";
import {
  captionChildrenOf,
  childrenOf,
  ensureCaptionChildren,
  findUnregisterable,
  typeOf,
} from "./containers";

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

/**
 * Plain text of a subtree — the read-only fallback when inline is unspellable.
 *
 * A node carrying neither text nor children (a canvas embedded mid-paragraph,
 * say) contributes a descriptor rather than nothing. Otherwise a paragraph
 * wrapping one reads back as empty, and the outline says a block is there and
 * read-only without ever saying what it is.
 */
function plainText(nodes: readonly SerializedNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "linebreak") out += "\n";
    else if (typeof node.text === "string") out += node.text;
    else if (node.children) out += plainText(childrenOf(node));
    else out += `[${describeNode(node)}]`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Opaque descriptors
// ---------------------------------------------------------------------------

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * A one-line summary of a block with no codec.
 *
 * This is **shape, not content** (plan §4.4): it says the block is there and
 * roughly what it is. Where a cheap read-only text extraction exists it is
 * included, because that closes most of the gap at no write-path risk.
 */
export function describeNode(node: SerializedNode): string {
  const kids = childrenOf(node);
  switch (typeOf(node)) {
    case "kanban": {
      const tasks = Array.isArray(node.tasks) ? node.tasks : [];
      const lanes = new Set(
        tasks.map((t) => (t as { stage?: unknown }).stage ?? 0),
      ).size;
      return `${plural(lanes, "lane")} · ${plural(tasks.length, "card")}`;
    }
    case "layout-item":
      return `column · ${plural(kids.length, "block")}`;
    case "details-content":
      return plural(kids.length, "block");
    case "math":
      return str(node.value);
    case "graph":
      return `geogebra${str(node.altText) ? ` · ${str(node.altText)}` : ""}`;
    case "sketch":
      return "excalidraw drawing";
    case "image":
      return str(node.altText) || str(node.src);
    case "iframe":
      return str(node.src);
    case "sticky":
      return "sticky note";
    // Attachments live *inside* paragraphs in real content, so they are reached
    // as inline nodes rather than as blocks. The block codec below still builds
    // one, but this is the path that describes the ones already stored.
    case "attachment":
      return `${str(node.filename)}${
        typeof node.size === "number" ? ` · ${node.size} bytes` : ""
      }`;
    case "canvas": {
      const notes = Array.isArray(node.notes) ? node.notes.length : 0;
      return plural(notes, "note");
    }
    // A note has no `type` of its own — `typeOf` gives it one, and this is what
    // an outline shows for the row between the board and the note's blocks. Its
    // colour is the only thing distinguishing two otherwise identical notes at
    // a glance, so it is worth the word.
    case "canvas-note": {
      const color = str(node.color);
      return `${color ? `${color} ` : ""}note · ${plural(kids.length, "block")}`;
    }
    case "horizontalrule":
      return "divider";
    // `PageBreakNode.getType()` is `"page-break"`, and always has been — the
    // unhyphenated arm was describing nothing, so every stored page break fell
    // through to `default` and read back as its own type string. Both spellings
    // are answered for the same reason `TABLE_TYPES` is a set: a descriptor is
    // a read path, and the cost of keeping a spelling readable is one line.
    case "page-break":
    case "pagebreak":
      return "page break";
    case "tablerow": {
      const cells = kids
        .map((cell) => (cellText(cell) ?? plainText(childrenOf(cell))).trim())
        .filter(Boolean);
      return cells.length > 0 ? cells.join(" | ") : plural(kids.length, "cell");
    }
    default:
      return node.type;
  }
}

// ---------------------------------------------------------------------------
// Read: node -> Block
// ---------------------------------------------------------------------------

const headingLevel = (tag: string): HeadingBlock["level"] => {
  const level = Number(tag.replace(/^h/i, ""));
  return level >= 1 && level <= 6 ? (level as HeadingBlock["level"]) : 1;
};

const asListType = (value: unknown): ListType => {
  const listType = str(value, "bullet");
  return listType === "number" || listType === "check" ? listType : "bullet";
};

/**
 * Read a list's items, following nesting.
 *
 * A nested list is a `list` inside a `listitem`. Across every stored list here
 * an item has at most one, and it always comes after whatever inline content
 * the item carries — so anything else is treated as unreadable rather than
 * guessed at, and the list goes read-only with its content intact.
 */
function readListItems(node: SerializedNode): {
  items: ListItem[];
  readonlyText: boolean;
} {
  let readonlyText = false;

  const items = childrenOf(node)
    .filter((item) => item.type === "listitem")
    .map((item) => {
      const kids = childrenOf(item);
      const sublists = kids.filter((child) => child.type === "list");
      const inline = kids.filter((child) => child.type !== "list");
      const firstList = kids.findIndex((child) => child.type === "list");

      // More than one nested list, or content after one, is a shape this IR
      // cannot put back the way it found it.
      const unreadable = sublists.length > 1 ||
        (firstList !== -1 && firstList < kids.length - 1 &&
          kids.slice(firstList + 1).some((child) => child.type !== "list"));

      const text = unreadable ? null : renderInline(inline);
      if (text === null) readonlyText = true;

      const listItem: ListItem = { text: text ?? plainText(kids) };
      if (typeof item.checked === "boolean") listItem.checked = item.checked;

      if (!unreadable && sublists[0]) {
        const nested = readListItems(sublists[0]);
        if (nested.readonlyText) readonlyText = true;
        listItem.sublist = {
          listType: asListType(sublists[0].listType),
          items: nested.items,
        };
      }
      return listItem;
    });

  return { items, readonlyText };
}

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * The table `type` strings.
 *
 * These are hardcoded rather than read from `TableNode.getType()` on purpose:
 * importing a node class here would drag the editor's browser-only
 * dependencies into a module that has to run in a bare Node process (see
 * `types.ts`). They are sets rather than constants because these are the
 * spellings *read* out of stored revisions, and a `type` that ever ships has
 * to keep being readable — adding one here is how a rename stays survivable.
 */
export const TABLE_TYPES: ReadonlySet<string> = new Set(["blog-table"]);
export const TABLE_CELL_TYPES: ReadonlySet<string> = new Set([
  "blog-tablecell",
]);
const TABLE_TYPE = "blog-table";
const TABLE_CELL_TYPE = "blog-tablecell";
const TABLE_ROW_TYPE = "tablerow";

// @lexical/table's TableCellHeaderStates: NO_STATUS 0, ROW 1, COLUMN 2, BOTH 3.
const HEADER_STATE: Record<CellHeader, number> = { row: 1, column: 2, both: 3 };
const headerFromState = (state: unknown): CellHeader | undefined => {
  switch (num(state, 0)) {
    case 1:
      return "row";
    case 2:
      return "column";
    case 3:
      return "both";
    default:
      return undefined;
  }
};

/**
 * A cell's text, or null when it holds something a single `text` cannot carry.
 *
 * 97.4% of stored cells hold exactly one paragraph, which is why a cell is
 * text-bearing at all. The rest keep their content and go read-only rather than
 * being flattened into it.
 */
function cellText(node: SerializedNode): string | null {
  const kids = childrenOf(node);
  if (kids.length !== 1 || kids[0].type !== "paragraph") return null;
  return renderInline(childrenOf(kids[0]));
}

/** Read the label out of a details container's summary child. */
/**
 * An image's caption as one inline string, or "" when it has none.
 *
 * Joined across the caption's paragraphs rather than taking the first: a
 * caption typed with a line break is two of them, and reporting only the first
 * would show an agent a truncated caption it would then write back whole.
 */
function captionText(node: SerializedNode): string {
  return captionChildrenOf(node)
    .map((block) => renderInline(childrenOf(block)) ?? plainText(childrenOf(block)))
    .filter((line) => line.length > 0)
    .join("\n");
}

const summaryTextOf = (node: SerializedNode): string => {
  const summary = childrenOf(node).find((k) => k.type === "details-summary");
  if (!summary) return "";
  return renderInline(childrenOf(summary)) ?? plainText(childrenOf(summary));
};

function readKanbanTasks(node: SerializedNode): KanbanTask[] {
  const tasks = Array.isArray(node.tasks) ? node.tasks : [];
  return tasks.map((raw) => {
    const task = raw as Record<string, unknown>;
    const priority = str(task.priority, "medium");
    return {
      id: str(task.id),
      name: str(task.name),
      ...(task.description === undefined
        ? {}
        : { description: str(task.description) }),
      stage: num(task.stage, 0),
      priority:
        priority === "low" || priority === "high" || priority === "medium"
          ? priority
          : "medium",
      tags: Array.isArray(task.tags) ? task.tags.map((t) => String(t)) : [],
      createdAt: str(task.createdAt),
      updatedAt: str(task.updatedAt),
    };
  });
}

/** Read one node as a block. Never throws: an unknown type reads as opaque. */
export function nodeToBlock(node: SerializedNode): Block {
  const kids = childrenOf(node);

  switch (typeOf(node)) {
    case "horizontalrule":
      return { type: "divider" };

    case "layout-container":
      return { type: "layout", templateColumns: str(node.templateColumns) };

    case "details-container": {
      const block: DetailsBlock = {
        type: "details",
        summary: summaryTextOf(node),
      };
      if (typeof node.open === "boolean") block.open = node.open;
      return block;
    }

    case "details-summary": {
      const text = renderInline(kids);
      const block: SummaryBlock = {
        type: "summary",
        text: text ?? plainText(kids),
      };
      if (text === null) block.readonlyText = true;
      return block;
    }

    case "nested-doc": {
      // Wrapper only. The interior is addressed block by block through
      // `containers.ts`, so reading it here would give the same content two
      // spellings — the same rule `layout` and `details` follow.
      const block: NestedDocBlock = {
        type: "nested-doc",
        title: str(node.title),
      };
      if (typeof node.open === "boolean") block.open = node.open;
      return block;
    }

    case "kanban":
      return { type: "kanban", tasks: readKanbanTasks(node) };

    case "attachment": {
      const block: AttachmentBlock = {
        type: "attachment",
        url: str(node.url),
        filename: str(node.filename),
      };
      if (node.mimetype !== undefined) block.mimetype = str(node.mimetype);
      if (typeof node.size === "number") block.size = node.size;
      if (typeof node.expanded === "boolean") block.expanded = node.expanded;
      return block;
    }

    case "image": {
      const block: ImageBlock = {
        type: "image",
        src: str(node.src),
        alt: str(node.altText),
      };
      const caption = captionText(node);
      if (caption) block.caption = caption;
      if (typeof node.showCaption === "boolean") {
        block.showCaption = node.showCaption;
      }
      return block;
    }

    case "paragraph":
    case "quote": {
      const text = renderInline(kids);
      const block = {
        type: node.type,
        text: text ?? plainText(kids),
      } as ParagraphBlock | QuoteBlock;
      if (text === null) block.readonlyText = true;
      return block;
    }
    case "heading": {
      const text = renderInline(kids);
      const block: HeadingBlock = {
        type: "heading",
        level: headingLevel(str(node.tag, "h1")),
        text: text ?? plainText(kids),
      };
      if (text === null) block.readonlyText = true;
      return block;
    }
    case "code": {
      const block: CodeBlock = {
        type: "code",
        language: str(node.language),
        code: plainText(kids),
      };
      // Only when the block has one, so a code block that is not a snippet
      // file reads back exactly as it did before phase 5.
      if (typeof node.filename === "string" && node.filename) {
        block.filename = node.filename;
      }
      return block;
    }

    case "code-snippet": {
      // Wrapper only. Each file is addressed and edited in its own right
      // through the *default* accessor in `containers.ts` — the point of the
      // node (docs/plans/archive/haklex-reprise.md §6.2). `filenames` is
      // read-only, and is here because the wrapper node holds no names: without
      // it an outline could say a snippet is there and never what is in it.
      const block: CodeSnippetBlock = {
        type: "code-snippet",
        filenames: kids.map((child) => str(child.filename)),
      };
      const active = num(node.active, 0);
      if (active > 0) block.active = active + 1;
      return block;
    }
    case "list": {
      const { items, readonlyText } = readListItems(node);
      const block: ListBlock = {
        type: "list",
        listType: asListType(node.listType),
        items,
      };
      if (readonlyText) block.readonlyText = true;
      return block;
    }
    default:
      break;
  }

  if (TABLE_TYPES.has(node.type)) {
    const rows = kids.filter((k) => k.type === TABLE_ROW_TYPE);
    return {
      type: "table",
      rowCount: rows.length,
      columnCount: rows[0] ? childrenOf(rows[0]).length : 0,
    };
  }

  if (TABLE_CELL_TYPES.has(node.type)) {
    const text = cellText(node);
    const block: TableCellBlock = {
      type: "cell",
      text: text ?? plainText(kids),
    };
    if (text === null) block.readonlyText = true;
    const header = headerFromState(node.headerState);
    if (header) block.header = header;
    if (num(node.colSpan, 1) > 1) block.colSpan = num(node.colSpan, 1);
    if (num(node.rowSpan, 1) > 1) block.rowSpan = num(node.rowSpan, 1);
    return block;
  }

  return {
    type: "opaque",
    // `typeOf`, not `node.type` — a canvas note has none, and an opaque block
    // naming `undefined` is the one that tells an agent nothing at all.
    nodeType: typeOf(node),
    summary: describeNode(node),
  };
}

// ---------------------------------------------------------------------------
// Write: Block -> node
// ---------------------------------------------------------------------------

/** Defaults every element node needs; a `previous` node overrides all of them. */
const ELEMENT_DEFAULTS = {
  version: 1,
  direction: null,
  format: "",
  indent: 0,
} as const;

const LIST_TYPE_TAG = { bullet: "ul", number: "ol", check: "ul" } as const;

/** A plain text leaf — code bodies are re-tokenized by the editor on load. */
const textLeaf = (text: string): SerializedNode => ({
  type: "text",
  version: 1,
  text,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
});

/** Block type -> node type, where they differ. */
const NODE_TYPE_OF: Readonly<Record<string, string>> = {
  table: TABLE_TYPE,
  cell: TABLE_CELL_TYPE,
  divider: "horizontalrule",
  layout: "layout-container",
  details: "details-container",
  summary: "details-summary",
};

const blockTypeToNodeType = (block: WritableBlock): string =>
  NODE_TYPE_OF[block.type] ?? block.type;

/**
 * Ids and timestamps for a freshly authored kanban card.
 *
 * This is the one impure corner of the codecs: a `Task` the app will read needs
 * an id and timestamps, and a caller composing a board from prose has none to
 * give. Supply them explicitly to keep a rebuild deterministic — the round-trip
 * spec does.
 */
const mintId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
    `t_${Math.floor(Math.random() * 1e12).toString(36)}`;

function kanbanTaskNode(task: KanbanTask): Record<string, unknown> {
  const stamp = task.updatedAt || task.createdAt || new Date().toISOString();
  return {
    id: task.id || mintId(),
    name: task.name ?? "",
    ...(task.description === undefined
      ? {}
      : { description: task.description }),
    stage: Number.isInteger(task.stage) ? task.stage : 0,
    priority: task.priority ?? "medium",
    tags: task.tags ?? [],
    createdAt: task.createdAt || stamp,
    updatedAt: task.updatedAt || stamp,
  };
}

/** Build a table cell, carrying through anything the IR does not model. */
function cellNode(
  block: TableCellBlock,
  previous?: SerializedNode,
  headerDefault?: CellHeader,
): SerializedNode {
  const carried = previous && TABLE_CELL_TYPES.has(previous.type)
    ? previous
    : undefined;
  const header = block.header ?? headerDefault;
  return {
    ...ELEMENT_DEFAULTS,
    ...carried,
    type: TABLE_CELL_TYPE,
    headerState: header ? HEADER_STATE[header] : num(carried?.headerState, 0),
    colSpan: block.colSpan ?? num(carried?.colSpan, 1),
    rowSpan: block.rowSpan ?? num(carried?.rowSpan, 1),
    children: [
      {
        ...ELEMENT_DEFAULTS,
        type: "paragraph",
        children: parseInline(block.text ?? ""),
      },
    ],
  };
}

const elementNode = (
  type: string,
  children: SerializedNode[],
  extra: Record<string, unknown> = {},
): SerializedNode => ({ ...ELEMENT_DEFAULTS, type, ...extra, children });

/**
 * Replace an image's caption with `text`, one paragraph per line.
 *
 * `ensureCaptionChildren` mints the whole `caption.editorState.root` path when
 * the image has none, so an image that never had a caption can be given one —
 * and the path is minted by `containers.ts` rather than spelled here, because a
 * write that builds a *different* path than the read walks is the failure this
 * whole seam is arranged to make impossible.
 *
 * The array is emptied in place rather than reassigned, for the live-array rule
 * at the head of `containers.ts`.
 */
function writeCaption(node: SerializedNode, text: string): void {
  const children = ensureCaptionChildren(node);
  children.length = 0;
  for (const line of text.split("\n")) {
    children.push(elementNode("paragraph", parseInline(line)));
  }
}

/**
 * Build a list item, and the list nested under it.
 *
 * `depth` is where `indent` comes from: it is the nesting level, not something
 * a caller supplies, so the two can never disagree.
 */
function listItemNode(
  item: ListItem,
  index: number,
  depth: number,
): SerializedNode {
  const children = parseInline(item.text ?? "");
  if (item.sublist) {
    children.push(
      listNode(item.sublist.listType, item.sublist.items, depth + 1),
    );
  }
  const node: SerializedNode = {
    ...ELEMENT_DEFAULTS,
    type: "listitem",
    value: index + 1,
    indent: depth,
    children,
  };
  if (typeof item.checked === "boolean") node.checked = item.checked;
  return node;
}

function listNode(
  listType: ListType,
  items: readonly ListItem[],
  depth: number,
): SerializedNode {
  return {
    ...ELEMENT_DEFAULTS,
    type: "list",
    listType,
    start: 1,
    tag: LIST_TYPE_TAG[listType],
    children: items.map((item, index) => listItemNode(item, index, depth)),
  };
}

/**
 * Build a node from a block.
 *
 * `previous` is the node being replaced, if any. Spreading it first is the
 * §4.6.1 carry-through rule in one line: anything the IR does not model —
 * `width` and `wrap` on a code node, element alignment, indent — survives,
 * and a codec has to overwrite a field deliberately to lose it.
 */
export function blockToNode(
  block: WritableBlock,
  previous?: SerializedNode,
): SerializedNode {
  // Only carry through from a node of the same kind; a paragraph's leftovers
  // have no business on a code block.
  const carried = previous && previous.type === blockTypeToNodeType(block)
    ? previous
    : undefined;
  const base = { ...ELEMENT_DEFAULTS, ...carried };

  switch (block.type) {
    case "paragraph":
      return {
        ...base,
        type: "paragraph",
        children: parseInline(block.text ?? ""),
      };
    case "quote":
      return {
        ...base,
        type: "quote",
        children: parseInline(block.text ?? ""),
      };
    case "heading": {
      const level = block.level;
      if (!Number.isInteger(level) || level < 1 || level > 6) {
        throw new Error(`heading level must be 1-6, got ${String(level)}`);
      }
      return {
        ...base,
        type: "heading",
        tag: `h${level}`,
        children: parseInline(block.text ?? ""),
      };
    }
    case "code":
      return {
        ...base,
        type: "code",
        language: str(block.language, "plain"),
        // Absent means "leave whatever is there": `base` already carries the
        // previous node's name, so a `set_text` on one file of a snippet must
        // not be a way to lose its tab label.
        ...(block.filename === undefined ? {} : { filename: block.filename }),
        children: block.code ? [textLeaf(block.code)] : [],
      };

    case "code-snippet": {
      // `files` absent on a replace keeps the files already there — the same
      // carry-through rule layout, details and table use for their contents.
      const files = block.files?.map((file, index) => {
        const node = blockToNode(file);
        if (node.type !== "code") {
          throw new Error(
            `a code-snippet holds code blocks only; file ${index + 1} is a ` +
              `${file.type}`,
          );
        }
        return node;
      });
      const children = files ?? childrenOf(carried ?? {} as SerializedNode);
      if (children.length === 0) {
        throw new Error(
          'a new code-snippet needs `files`, e.g. [{type:"code",language:"ts",' +
            'code:"…",filename:"main.ts"}]',
        );
      }
      // 1-based in the IR to read like an address, 0-based on the node to be an
      // index into its children. Clamped by `CodeSnippetNode.getActiveIndex`
      // rather than here, because the file it names can be deleted later.
      const active = block.active === undefined
        ? num(carried?.active, 0)
        : Math.max(0, Math.trunc(block.active) - 1);
      return {
        ...base,
        type: "code-snippet",
        active,
        children,
      };
    }
    case "list": {
      const listType = block.listType ?? "bullet";
      if (!(listType in LIST_TYPE_TAG)) {
        throw new Error(
          `list type must be bullet, number or check, got ${String(listType)}`,
        );
      }
      const items = Array.isArray(block.items) ? block.items : [];
      return { ...base, ...listNode(listType, items, 0) };
    }
    case "divider":
      // A decorator leaf: no children, no element chrome. Carry through
      // anything a future version of the node adds.
      return { ...carried, type: "horizontalrule", version: 1 };

    case "kanban":
      return {
        ...carried,
        type: "kanban",
        version: 1,
        style: str(carried?.style),
        tasks: (block.tasks ?? []).map(kanbanTaskNode),
      };

    case "attachment":
      return {
        ...carried,
        type: "attachment",
        version: 1,
        url: str(block.url),
        filename: str(block.filename),
        mimetype: block.mimetype ?? str(carried?.mimetype),
        size: block.size ?? num(carried?.size, 0),
        expanded: block.expanded ?? carried?.expanded ?? false,
        editing: false,
      };

    case "image": {
      const next: SerializedNode = {
        ...carried,
        type: "image",
        version: 1,
        src: str(block.src, str(carried?.src)),
        altText: str(block.alt, str(carried?.altText)),
        showCaption: block.showCaption ?? carried?.showCaption ?? false,
      };
      // Only when the caller said something about it. `caption` absent means
      // "leave the caption alone", which is what carry-through means everywhere
      // else and what stops a `set_text`-shaped edit from silently emptying one.
      if (block.caption !== undefined) writeCaption(next, block.caption);
      return next;
    }

    case "summary":
      return elementNode("details-summary", parseInline(block.text ?? ""), {
        ...carried,
        editable: carried?.editable ?? true,
      });

    case "layout": {
      // Columns absent on a replace means keep the ones already there — the
      // same carry-through rule as any unmodelled field. On an insert there is
      // nothing to keep, so they are required.
      const children = block.columns
        ? block.columns.map((column) =>
          elementNode("layout-item", column.map((child) => blockToNode(child)))
        )
        : childrenOf(carried ?? {} as SerializedNode);
      if (children.length === 0) {
        throw new Error("a new layout needs `columns`, e.g. [[…],[…]]");
      }
      return {
        ...base,
        type: "layout-container",
        templateColumns: block.templateColumns ||
          str(carried?.templateColumns, "1fr 1fr"),
        children,
      };
    }

    case "details": {
      const summary = elementNode(
        "details-summary",
        parseInline(block.summary ?? ""),
        { editable: true },
      );
      const previousContent = childrenOf(carried ?? {} as SerializedNode).find(
        (child) => child.type === "details-content",
      );
      const content = block.body
        ? elementNode(
          "details-content",
          block.body.map((child) => blockToNode(child)),
        )
        : previousContent;
      if (!content) {
        throw new Error("a new details block needs `body`");
      }
      return {
        ...base,
        type: "details-container",
        open: block.open ?? carried?.open ?? true,
        editable: carried?.editable ?? true,
        children: [summary, content],
      };
    }

    case "nested-doc": {
      // `doc` is a whole serialized editor *state*, so the carried node brings
      // the existing interior with it for free — omitting `body` on a replace
      // keeps what is there, exactly as it does for layout and details.
      const body = block.body?.map((child) => blockToNode(child));
      if (body) {
        // The refusal is here as well as in `ops.ts` because this path is also
        // `create_post`'s: `stateFromBlocks` never goes near an op. Empty on the
        // next load is what happens if this is missed — see `containers.ts`.
        const bad = findUnregisterable(["nested-doc"], body);
        if (bad) {
          throw new Error(
            `a ${bad.nodeType} block cannot go inside a nested-doc — its ` +
              `editor cannot register that node type, and the nested ` +
              `document would come back empty the next time it is opened`,
          );
        }
      }
      const doc = body
        ? { root: { ...ELEMENT_DEFAULTS, type: "root", children: body } }
        : carried?.doc;
      if (!doc) {
        throw new Error("a new nested-doc needs `body`");
      }
      return {
        ...carried,
        type: "nested-doc",
        version: 1,
        title: str(block.title),
        open: block.open ?? carried?.open ?? true,
        doc,
      };
    }

    case "cell":
      return cellNode(block, carried);

    case "table": {
      // Rows absent on a replace means keep the grid already there — the same
      // carry-through rule the layout codec uses for its columns.
      const children = block.rows
        ? block.rows.map((row, rowIndex) =>
          elementNode(
            TABLE_ROW_TYPE,
            row.map((cell) =>
              cellNode(
                typeof cell === "string" ? { type: "cell", text: cell } : {
                  type: "cell",
                  text: cell.text ?? "",
                  ...(cell.header ? { header: cell.header } : {}),
                  ...(cell.colSpan ? { colSpan: cell.colSpan } : {}),
                  ...(cell.rowSpan ? { rowSpan: cell.rowSpan } : {}),
                },
                undefined,
                block.headerRow && rowIndex === 0 ? "row" : undefined,
              )
            ),
          )
        )
        : childrenOf(carried ?? {} as SerializedNode);
      if (children.length === 0) {
        throw new Error('a new table needs `rows`, e.g. [["A","B"],["1","2"]]');
      }
      return {
        ...base,
        type: TABLE_TYPE,
        style: str(carried?.style),
        id: str(carried?.id),
        children,
      };
    }

    default: {
      const unreachable = block as { type: string };
      throw new Error(`no codec for block type "${unreachable.type}"`);
    }
  }
}

/** Blocks whose prose lives in a `text` field that `set_text` may replace. */
export const TEXT_BLOCKS: ReadonlySet<string> = new Set([
  "paragraph",
  "heading",
  "quote",
  "summary",
  "cell",
]);

/**
 * Text worth searching, for any block — one definition, so `search` and the
 * outline cannot disagree about what a block "says".
 */
export function blockText(block: Block): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
    case "summary":
      return block.text;
    case "code":
      // The filename is the block's own text as much as the code is: it is what
      // someone searching for "the webpack config" would type.
      return [block.filename, block.code].filter(Boolean).join("\n");
    // The files are searched through their own blocks; these are the only words
    // the wrapper has.
    case "code-snippet":
      return (block.filenames ?? []).join("\n");
    case "list":
      return block.items.map((item) => item.text).join("\n");
    case "details":
      return block.summary;
    // The interior is searched through its own blocks, which carry their own
    // addresses — this is the wrapper's only text.
    case "nested-doc":
      return block.title;
    case "kanban":
      return block.tasks
        .map((task) =>
          [task.name, task.description].filter(Boolean).join(" — ")
        )
        .join("\n");
    case "attachment":
      return `${block.filename} ${block.url}`;
    case "cell":
      return block.text;
    case "opaque":
      return block.summary;
    default:
      return "";
  }
}

/**
 * True when this block's text may be edited in place — see `TextOpacity`.
 *
 * A code block is never text-opaque: its body is literal, so there is no inline
 * formatting to lose. Hence the `in` check rather than a field access.
 */
export const isTextEditable = (block: Block): boolean =>
  block.type !== "opaque" &&
  !("readonlyText" in block && block.readonlyText === true);

/**
 * True when `set_text` will work on this block.
 *
 * Distinct from "can be rewritten at all": a kanban or a layout is perfectly
 * replaceable via `replace_block`, it just has no single text field to set.
 * Conflating the two made the outline advertise a kanban as editable and then
 * refuse the edit. One definition here so the outline and the applier cannot
 * drift apart on it.
 */
export const canSetText = (block: Block): boolean =>
  (TEXT_BLOCKS.has(block.type) || block.type === "code") &&
  isTextEditable(block);
