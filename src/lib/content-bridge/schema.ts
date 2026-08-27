/**
 * The zod mirror of the block IR, and the prose that describes it to a model.
 *
 * Both agent surfaces declare the same block model — `/api/copilot` for the
 * in-app Copilot, `mcp/content-server.ts` for Claude Code — and until now each
 * kept its own hand-written copy. They drifted, silently and in both
 * directions: `attachment.expanded` was authorable over stdio and rejected in
 * the browser, the two agents were told different things about
 * `after`/`before`/`appendTo`, and the route's prose described an `attachment`
 * with no `mimetype` and a kanban task with no `tags` that its own schema
 * accepted. Every block type graduated under
 * docs/plans/archive/claude-code-lexical.md §4.6.1 had to be written twice or it worked
 * on one agent and not the other. See docs/plans/archive/ai-surface-consolidation.md
 * §2.1.
 *
 * This lives beside the codecs rather than under `src/lib/ai/` because
 * `blocks.ts` is what actually accepts or rejects a block; what follows is only
 * a *description* of it, and a description drifting from the behaviour it
 * describes is the whole failure mode. `__tests__/codecs.test.ts` feeds every
 * fully-populated block to both, so graduating a type with only one of the two
 * updated fails there rather than in front of an agent.
 *
 * Deliberately **not** re-exported from `./index`. That barrel is imported by
 * the browser (`editor/utils/copilotAgentExecutors.ts`), which executes tool
 * calls the server has already validated; re-exporting would put a validator
 * into a bundle with nothing to validate. Import this path directly.
 */
import { z } from "zod";

const listItemSchema = z.object({
  text: z.string(),
  checked: z.boolean().optional(),
  // Nesting is recursive, which zod cannot express inside a discriminated
  // union without a lazy schema neither the MCP JSON-Schema conversion nor the
  // AI SDK's would survive. The codec validates the shape: {listType, items:[…]}.
  sublist: z.unknown().optional(),
});

const kanbanTaskSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  stage: z.number().int().min(0).default(0),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  tags: z.array(z.string()).optional(),
});

/**
 * One authorable block. The union's arms are the writable half of `Block` in
 * `types.ts`, minus the fields a read reports and a write cannot set
 * (`readonlyText`, a table's `rowCount`/`columnCount`) — an object schema
 * strips those rather than refusing, so a block handed straight back from a
 * read is still a legal write.
 */
export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string() }),
  z.object({
    type: z.literal("heading"),
    level: z.number().int().min(1).max(6),
    text: z.string(),
  }),
  z.object({ type: z.literal("quote"), text: z.string() }),
  z.object({
    type: z.literal("code"),
    language: z.string().default("plain"),
    code: z.string(),
    filename: z.string().optional(),
  }),
  z.object({
    type: z.literal("code-snippet"),
    active: z.number().int().min(1).optional(),
    // Read-only, and accepted rather than refused so a block handed straight
    // back from a read is still a legal write — the same rule the header gives
    // for `rowCount`.
    filenames: z.array(z.string()).optional(),
    files: z
      .array(z.object({
        type: z.literal("code"),
        language: z.string().default("plain"),
        code: z.string(),
        filename: z.string().optional(),
      }))
      .optional(),
  }),
  z.object({
    type: z.literal("list"),
    listType: z.enum(["bullet", "number", "check"]).default("bullet"),
    items: z.array(listItemSchema),
  }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("summary"), text: z.string() }),
  z.object({
    type: z.literal("attachment"),
    url: z.string(),
    filename: z.string(),
    mimetype: z.string().optional(),
    size: z.number().optional(),
    expanded: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("image"),
    src: z.string(),
    alt: z.string(),
    // Inline markdown, one paragraph per newline. Absent means "leave the
    // caption as it is"; `""` means "empty it".
    caption: z.string().optional(),
    showCaption: z.boolean().optional(),
  }),
  z.object({ type: z.literal("kanban"), tasks: z.array(kanbanTaskSchema) }),
  // Containers nest, so their bodies are typed loosely here and validated by
  // the codec — zod cannot express the recursion inside a discriminated union
  // without a lazy schema the JSON-Schema conversion would not survive.
  z.object({
    type: z.literal("layout"),
    templateColumns: z.string().default("1fr 1fr"),
    columns: z.array(z.array(z.unknown())).optional(),
  }),
  z.object({
    type: z.literal("details"),
    summary: z.string(),
    open: z.boolean().optional(),
    body: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("nested-doc"),
    title: z.string(),
    open: z.boolean().optional(),
    body: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal("table"),
    rows: z
      .array(z.array(z.unknown()))
      .optional()
      .describe(
        "Rows of cells; a cell is a string or {text, header, colSpan, rowSpan}",
      ),
    headerRow: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("cell"),
    text: z.string(),
    header: z.enum(["row", "column", "both"]).optional(),
    colSpan: z.number().int().min(1).optional(),
    rowSpan: z.number().int().min(1).optional(),
  }),
]);

/**
 * Where an insert or a move lands. Spread into both ops that take it, so the
 * three fields cannot be described one way for `insert_blocks` and another for
 * `move_block`. Module-local: it reaches a caller only as part of `opSchema`.
 */
const placement = {
  after: z.string().optional().describe("Place after this block"),
  before: z.string().optional().describe("Place before this block"),
  appendTo: z
    .string()
    .optional()
    .describe('Append inside this container, or "root" for the document'),
};

export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_text"), id: z.string(), text: z.string() }),
  z.object({
    op: z.literal("replace_block"),
    id: z.string(),
    block: blockSchema,
  }),
  z.object({
    op: z.literal("insert_blocks"),
    blocks: z.array(blockSchema).min(1),
    ...placement,
  }),
  z.object({ op: z.literal("delete_block"), id: z.string() }),
  z.object({ op: z.literal("move_block"), id: z.string(), ...placement }),
]);

/**
 * The block model in prose, appended to every tool description that takes
 * blocks.
 *
 * A JSON Schema says which fields exist; it does not say that italic is `__`
 * rather than `*`, that a read hands text back escaped, or that a kanban has no
 * single text field to `set_text`. Those are the things an agent gets wrong, so
 * they are spelled out here — once, for both agents.
 */
export const BLOCK_DOC =
  "Authorable block types: paragraph {text}, heading {level 1-6, text}, " +
  "quote {text}, code {language, code, filename?}, " +
  "list {listType bullet|number|check, " +
  "items[{text, checked?, sublist?}]} where sublist is {listType, items[…]} " +
  "for nesting, divider {}, " +
  "attachment {url, filename, mimetype?, size?, expanded?}, " +
  "image {src, alt, caption?, showCaption?} where caption is inline markdown, " +
  "one paragraph per newline — omitting it keeps the caption already there and " +
  'passing "" empties it, ' +
  "kanban {tasks[{name, description?, stage, priority low|medium|high, tags?}]}, " +
  'layout {templateColumns e.g. "1fr 1fr", columns[[block,…],[block,…]]}, ' +
  "details {summary, open?, body[block,…]}, summary {text}, " +
  '"nested-doc" {title, open?, body[block,…]} — a document inside the ' +
  "document, whose blocks are addressed like any other container's, " +
  '"code-snippet" {active?, files[code,…]} — one code block per file behind a ' +
  "tab strip, each file addressed like any other container's child and named " +
  "by its own `filename`; `active` is 1-based and picks the open tab, " +
  "table {rows[[cell,…],…], headerRow?} where a cell is a plain string or " +
  "{text, header row|column|both, colSpan, rowSpan}, and cell {text, header?}. " +
  "For layout, details, nested-doc, code-snippet and table, " +
  "columns/body/files/rows are required when inserting a new one and optional " +
  "when replacing — omit them to keep the contents already there. " +
  "A code-snippet holds code blocks and nothing else, at its top level, and a " +
  "write that puts anything else in one is refused. " +
  "A nested-doc runs a restricted editor: kanban, attachment, page-break, " +
  "sticky, canvas, code-snippet and another nested-doc cannot go inside one, " +
  "at any depth, " +
  "and a write that tries is refused rather than silently emptying it. " +
  "It has no single text field either — retitle it with replace_block. " +
  "Inline formatting inside `text` uses **bold**, __italic__, `code`, " +
  "~~strike~~, ==highlight==, ++underline++, ^^sup^^, ,,sub,,, [link](url) and " +
  "$latex$. Italic is __, not *, so that no delimiter is a prefix of another. " +
  "Text comes back from a read ESCAPED, and the escapes are part of the text: " +
  "a backslash precedes any literal \\, `, [, ] or $, and any mark character " +
  "that would otherwise open a run — most often a comma straight after a " +
  "formatted run, since ,, is subscript. Carry those backslashes through " +
  "unchanged when you rewrite a block; dropping one does not tidy the text up, " +
  "it changes what the block says. " +
  "A canvas is a board of notes: its notes are addressed like any other " +
  "container's children (b7.2 is the second note) and each note's blocks are " +
  "addressed inside it (b7.2.1). A note itself is read-only — insert into it, " +
  "not over it. A sticky note is the same, one level shallower. " +
  "Node types with no codec (math as a block, graph, sketch, " +
  "iframe) are read-only: they can be read, moved or deleted " +
  "by address, but not rewritten. set_text needs a single text field, so it " +
  "applies only to paragraph, heading, quote, summary, cell and code; a list, " +
  "table, layout, details, nested-doc, code-snippet or kanban is rewritten " +
  "whole with replace_block.";

/**
 * What to do when a write is refused, appended to every tool description that
 * takes ops.
 *
 * A refusal an agent cannot act on is a refusal it retries verbatim, or gives
 * up on and reports as done. The two failures worth separating are the ones
 * where re-reading fixes it and the ones where only rewriting the batch does —
 * so this says which is which by the name that appears in the error, and says
 * plainly that retrying unchanged is never the answer to either.
 *
 * Lives here, beside `BLOCK_DOC`, for the same reason: both agents must be told
 * the same thing, and one string is the only way that stays true.
 */
export const RECOVERY_DOC =
  "WHEN A WRITE IS REFUSED, the whole batch was refused — nothing was " +
  "written, so there is no partial state to repair. Never retry an unchanged " +
  "batch; the same input is refused identically. " +
  "Refused as stale (the stateHash no longer matches): the document moved " +
  "between your read and this write, so your addresses may name different " +
  "blocks now. Read the outline again and rebuild the ops against the new " +
  "addresses — do not reuse the old ones. " +
  "block_not_found: that address does not resolve. Either the block moved or " +
  "the address came from an outdated read. Re-run outline (or search) and " +
  "retry with a current address, rather than guessing a neighbouring one. " +
  "A block removed earlier in the same batch is different — re-reading will " +
  "not help; drop the later op. " +
  "Refused by a codec (\"has no codec\", \"no single text field\", " +
  "\"needs columns\"): the op named a real block but the wrong kind of edit " +
  "for it. Fix the shape — replace_block instead of set_text, or leave a " +
  "read-only block alone — and send the corrected op.";
