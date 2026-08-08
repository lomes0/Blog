// MCP server exposing this blog's Prisma/Lexical content to Claude Code.
//
// Run (see .mcp.json):
//   node --import tsx mcp/content-server.ts
//
// Documents are addressed by BLOCK, not round-tripped through Markdown — see
// docs/plans/claude-code-lexical.md. Reads hand out addresses (`b3`, `b4.2`)
// and a `stateHash`; writes name blocks and carry that hash back. Only the
// nodes an op names are touched, so a kanban board nobody mentioned comes out
// byte-identical, and blocks with no codec are visible and movable rather than
// silently absent as they were under the Markdown transport.
//
// The bridge is pure JSON, so this process needs no DOM shim and no editor node
// classes — which is why `mcp/bootstrap.mjs` and `mcp/lexical.ts` are gone.
//
// Auth: single-user, personal use. All operations are scoped to the user named
// by MCP_AUTHOR_ID (a User id or email); the server never reads or writes other
// authors' content. Requires DATABASE_URL.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rankForAppend } from "@/repositories/ordering";
import {
  findPendingProposal,
  type ProposalRecord,
  upsertProposal,
} from "@/repositories/revision";
import { isProposalStale, selectAgentRead } from "@/lib/proposals";
import { changeNotification } from "@/lib/changes/notify";
import {
  applyOps,
  emptyState,
  formatOutline,
  outline,
  readAll,
  readBlocks,
  stateFromBlocks,
  stateHash,
  walkBlocks,
  blockText,
  nodeToBlock,
  type Op,
  type StoredState,
  type WritableBlock,
} from "@/lib/content-bridge";

const AUTHOR_REF = process.env.MCP_AUTHOR_ID;
if (!AUTHOR_REF) {
  console.error("MCP_AUTHOR_ID is required (a User id or email).");
  process.exit(1);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve MCP_AUTHOR_ID (id or email) to a User id, once.
let authorIdPromise: Promise<string> | undefined;
function getAuthorId(): Promise<string> {
  if (!authorIdPromise) {
    authorIdPromise = (async () => {
      const where = UUID_RE.test(AUTHOR_REF!)
        ? { id: AUTHOR_REF! }
        : { email: AUTHOR_REF! };
      const user = await prisma.user.findUnique({ where, select: { id: true } });
      if (!user) throw new Error(`No user matches MCP_AUTHOR_ID=${AUTHOR_REF}`);
      return user.id;
    })();
  }
  return authorIdPromise;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));
const fail = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
  isError: true,
});

// ---------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------

/** Where a write from this process says it came from (`Revision.origin`). */
const AGENT_ORIGIN = "claude-code";

interface Loaded {
  id: string;
  name: string;
  state: StoredState;
  /**
   * `Document.head` as it was when this state was read — the **base** a
   * proposal records, not a precondition anything checks here.
   *
   * It used to be both: `saveRevision` moved `head` conditionally on it, and a
   * miss meant an editor tab had saved underneath. Gating removed that write, so
   * nothing in this process guards anything any more. The value's one job now is
   * to be stored as `baseRevisionId` when the proposal is *created*, where it
   * becomes `expectedHead` for approval's compare-and-set (§3.4) — which is why
   * it is head rather than whatever row `state` was actually read from. Once a
   * proposal exists those two differ, and a squash ignores this field entirely
   * (§3.2).
   */
  base: string | null;
  /**
   * Which state was read: the committed document, or the document's pending
   * proposal. Every read tool says so, because "the outline you are looking at
   * is not what the blog is serving" is a fact the agent has to carry into what
   * it tells the user.
   */
  source: "proposal" | "committed" | "empty";
  /**
   * True when this post has a pending proposal that was skipped because it went
   * stale — the author saved after it was written, so it can no longer be
   * approved (§3.6). What follows is the live document, and the next write
   * replaces that proposal rather than folding into it.
   */
  staleProposal: boolean;
}

/**
 * Fetch one of the author's posts as an editor state.
 *
 * **The pending proposal wins over `head`.** If a batch rewrote block 2, the
 * next `outline` has to show that rewrite, or its addresses describe a document
 * that no longer exists and the fold silently drops the earlier batch (§3.2).
 * `selectAgentRead` makes that choice, and keeps it apart from the `base` a
 * write records.
 *
 * **Unless the proposal has gone stale**, in which case the document wins — see
 * below, and §3.6.
 */
async function loadPost(id: string, authorId: string): Promise<Loaded | null> {
  const doc = await prisma.document.findFirst({
    where: { id, authorId, type: DocumentType.DOCUMENT },
    select: { id: true, name: true, head: true },
  });
  if (!doc) return null;

  const pending = await findPendingProposal(doc.id);

  // A *stale* proposal loses to the document (§3.6): the author has saved since
  // it was written, so its content is built on a base that is no longer head and
  // approval will refuse it. Reading it anyway would produce a second batch
  // addressing blocks the author has already moved past, equally unapprovable —
  // the "ask Claude again against current content" of §3.6 has to start with the
  // agent reading the current content. `selectAgentRead` makes the same call
  // from the same function; this one only decides whether the committed state is
  // worth fetching, since it is the whole document state.
  const usePending = !!pending && !isProposalStale(pending, doc.head);

  // Only looked up when there is no proposal to read instead. Both arms filter
  // `proposedAt: null`: the no-head fallback in particular used to be a bare
  // "newest revision", and under gating the newest revision is usually the
  // proposal — which would make this branch resolve it by accident, in the one
  // case where the accident is indistinguishable from the decision until it is
  // wrong.
  const committed = usePending
    ? null
    : doc.head
    ? await prisma.revision.findFirst({
      where: { id: doc.head, proposedAt: null },
      select: { id: true, data: true },
    })
    : await prisma.revision.findFirst({
      where: { documentId: doc.id, proposedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, data: true },
    });

  const read = selectAgentRead({ head: doc.head, pending, committed });

  // A post with no revision yet is an empty document, not an error — it can be
  // written to like any other.
  const data = read.revision?.data;
  return {
    id: doc.id,
    name: doc.name,
    state: (data as StoredState | undefined) ?? emptyState(),
    base: read.base,
    source: read.source,
    staleProposal: read.staleProposal,
  };
}

/**
 * Write the edited state as a **proposal**, leaving `Document.head` alone.
 *
 * This is the whole of the gate (§1): the write and the commit were already two
 * operations, and gating is a matter of not doing the second. The row goes to
 * storage with `proposedAt` set, where the app can show it and nothing that
 * serves the document will reach it; approval moves the pointer, rejection
 * deletes it.
 *
 * Successive batches squash into that one row rather than accumulating — see
 * `upsertProposal`, which does the `version` compare-and-set and re-folds on a
 * miss. `base` is used only if there is no proposal yet: on a squash the
 * original base is carried through untouched, which is the one invariant in this
 * design with no database constraint behind it (§3.2, §9).
 *
 * There is deliberately no guard here. The conditional `head` write this
 * replaced was what detected an editor tab saving underneath; that
 * compare-and-set has moved to approval time, where a human can resolve the
 * conflict (§3.8). The tool text must not claim otherwise.
 */
/**
 * The one line a read tool adds about which state it is showing.
 *
 * Three answers, and the third is the one worth spelling out: an agent that is
 * told only "this is the live document" will happily report its earlier work as
 * still pending, when in fact the author has edited underneath it and that work
 * can no longer be approved (§3.6).
 */
const sourceNote = (post: Loaded): string => {
  if (post.source === "proposal") {
    return "\n(showing this post's pending proposal, not the live document)";
  }
  if (post.staleProposal) {
    return "\n(your earlier proposal for this post is out of date — the author " +
      "saved after it was written, so it can no longer be approved. This is " +
      "the live document. Editing now discards that proposal and starts a new " +
      "one against this content; tell the user their earlier proposal was " +
      "superseded.)";
  }
  return "";
};

async function proposeRevision(
  documentId: string,
  authorId: string,
  state: StoredState,
  ops: readonly unknown[],
  base: string | null,
): Promise<ProposalRecord> {
  return upsertProposal({
    documentId,
    authorId,
    data: state,
    ops,
    origin: AGENT_ORIGIN,
    base,
  });
}

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const listItemSchema = z.object({
  text: z.string(),
  checked: z.boolean().optional(),
  // Nesting is recursive, which zod cannot express inside a discriminated
  // union without a lazy schema the JSON-Schema conversion would not survive.
  // The codec validates the shape: {listType, items:[…]}.
  sublist: z.unknown().optional(),
});

const kanbanTaskSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  stage: z.number().int().min(0).default(0),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  tags: z.array(z.string()).optional(),
});

const blockSchema = z.discriminatedUnion("type", [
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
    type: z.literal("kanban"),
    tasks: z.array(kanbanTaskSchema),
  }),
  // Containers nest, so their bodies are typed loosely here and validated by
  // the codec. Zod cannot express the recursion inside a discriminated union
  // without a lazy schema the MCP JSON-Schema conversion would not survive.
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
    type: z.literal("table"),
    rows: z
      .array(z.array(z.unknown()))
      .optional()
      .describe('Rows of cells; a cell is a string or {text, header, colSpan, rowSpan}'),
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

const placement = {
  after: z.string().optional().describe("Place after this block"),
  before: z.string().optional().describe("Place before this block"),
  appendTo: z
    .string()
    .optional()
    .describe('Append inside this container, or "root" for the document'),
};

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_text"), id: z.string(), text: z.string() }),
  z.object({ op: z.literal("replace_block"), id: z.string(), block: blockSchema }),
  z.object({
    op: z.literal("insert_blocks"),
    blocks: z.array(blockSchema).min(1),
    ...placement,
  }),
  z.object({ op: z.literal("delete_block"), id: z.string() }),
  z.object({ op: z.literal("move_block"), id: z.string(), ...placement }),
]);

const BLOCK_DOC =
  "Authorable block types: paragraph {text}, heading {level 1-6, text}, " +
  "quote {text}, code {language, code}, list {listType bullet|number|check, " +
  "items[{text, checked?, sublist?}]} where sublist is {listType, items[…]} " +
  "for nesting, divider {}, " +
  "attachment {url, filename, mimetype?, size?}, " +
  "kanban {tasks[{name, description?, stage, priority low|medium|high, tags?}]}, " +
  "layout {templateColumns e.g. \"1fr 1fr\", columns[[block,…],[block,…]]}, " +
  "details {summary, open?, body[block,…]}, summary {text}, " +
  "table {rows[[cell,…],…], headerRow?} where a cell is a plain string or " +
  "{text, header row|column|both, colSpan, rowSpan}, and cell {text, header?}. " +
  "For layout, details and table, columns/body/rows are required when " +
  "inserting a new one and optional when replacing — omit them to keep the " +
  "contents already there. " +
  "Inline formatting inside `text` uses **bold**, __italic__, `code`, " +
  "~~strike~~, ==highlight==, ++underline++, ^^sup^^, ,,sub,,, [link](url) and " +
  "$latex$. Node types with no codec (math as a block, image, graph, sketch, " +
  "iframe, canvas, sticky) are read-only: they can be read, moved or deleted " +
  "by address, but not rewritten. set_text needs a single text field, so it " +
  "applies only to paragraph, heading, quote, summary, cell and code; a list, " +
  "table, layout, details or kanban is rewritten whole with replace_block.";

const server = new McpServer({ name: "blog-content", version: "0.2.0" });

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

server.registerTool(
  "list_posts",
  {
    description:
      "List the author's blog posts (id, title, handle, series, published, updated).",
    inputSchema: {},
  },
  async () => {
    const authorId = await getAuthorId();
    const docs = await prisma.document.findMany({
      where: { authorId, type: DocumentType.DOCUMENT },
      select: {
        id: true,
        name: true,
        handle: true,
        published: true,
        seriesId: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });
    return json(docs);
  },
);

server.registerTool(
  "list_series",
  {
    description: "List the author's series (id, title, description).",
    inputSchema: {},
  },
  async () => {
    const authorId = await getAuthorId();
    const series = await prisma.series.findMany({
      where: { authorId },
      select: { id: true, title: true, description: true },
      orderBy: { rank: "asc" },
    });
    return json(series);
  },
);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

server.registerTool(
  "outline",
  {
    description:
      "Skeleton of a post: one line per block with its address, kind and a " +
      "preview. Start here — it is far cheaper than reading a whole post, and " +
      "the addresses it returns are what every other tool takes. Blocks marked " +
      "[read-only] can be moved or deleted but not rewritten. Returns a " +
      "stateHash that apply_ops requires.",
    inputSchema: { id: z.string().describe("Document id") },
  },
  async ({ id }) => {
    const authorId = await getAuthorId();
    const post = await loadPost(id, authorId);
    if (!post) return fail(`Post ${id} not found (or not yours).`);

    const result = outline(post.state);
    // Every read resolves the pending proposal in preference to the live
    // document (§3.2), unless it has gone stale (§3.6). Saying so is the
    // difference between the agent reporting "the post now says X" and "the
    // proposal I have pending says X".
    const note = sourceNote(post);
    if (result.blocks.length === 0) {
      return text(
        `"${post.name}" is empty.${note}\nstateHash: ${result.stateHash}`,
      );
    }
    return text(
      `"${post.name}"${note}\nstateHash: ${result.stateHash}\n\n${
        formatOutline(result)
      }`,
    );
  },
);

server.registerTool(
  "read_blocks",
  {
    description:
      "Full content of specific blocks, by address from `outline`. Prefer this " +
      "over read_post: it is how you read a long article without paying for all " +
      "of it.",
    inputSchema: {
      id: z.string().describe("Document id"),
      blocks: z.array(z.string()).min(1).describe('Block addresses, e.g. ["b2","b4.1"]'),
    },
  },
  async ({ id, blocks }) => {
    const authorId = await getAuthorId();
    const post = await loadPost(id, authorId);
    if (!post) return fail(`Post ${id} not found (or not yours).`);

    const result = readBlocks(post.state, blocks);
    if (result.blocks.length === 0) {
      return fail(`No blocks matched ${result.missing.join(", ")} in post ${id}.`);
    }
    return json({
      ...result,
      pendingProposal: post.source === "proposal",
      ...(post.staleProposal ? { staleProposal: sourceNote(post).trim() } : {}),
    });
  },
);

server.registerTool(
  "read_post",
  {
    description:
      "The whole post as nested blocks. Use for short documents; for anything " +
      "long, use outline then read_blocks.",
    inputSchema: { id: z.string().describe("Document id") },
  },
  async ({ id }) => {
    const authorId = await getAuthorId();
    const post = await loadPost(id, authorId);
    if (!post) return fail(`Post ${id} not found (or not yours).`);
    return json({
      title: post.name,
      // True when what follows is the post's pending proposal rather than the
      // live document — see `loadPost`.
      pendingProposal: post.source === "proposal",
      ...(post.staleProposal ? { staleProposal: sourceNote(post).trim() } : {}),
      ...readAll(post.state),
    });
  },
);

server.registerTool(
  "search",
  {
    description:
      "Find text across the author's posts. Returns block-level hits, so you " +
      "can jump straight to an address rather than reading whole documents.",
    inputSchema: {
      query: z.string().min(1).describe("Text to look for (case-insensitive)"),
      id: z.string().optional().describe("Restrict to one post"),
      limit: z.number().int().min(1).max(200).default(40),
    },
  },
  async ({ query, id, limit }) => {
    const authorId = await getAuthorId();
    const docs = await prisma.document.findMany({
      where: {
        authorId,
        type: DocumentType.DOCUMENT,
        ...(id ? { id } : {}),
      },
      select: { id: true, name: true, head: true },
      orderBy: { updatedAt: "desc" },
    });

    const needle = query.toLowerCase();
    const hits: Array<{
      postId: string;
      title: string;
      blockId: string;
      kind: string;
      preview: string;
    }> = [];

    // Pending proposals shadow head here for the same reason they do in
    // `loadPost`: a hit hands back a block address, and an address that came
    // from the live document does not name the same block in the proposal that
    // `apply_ops` would edit. One query rather than one per document.
    const proposed = new Map(
      (await prisma.revision.findMany({
        where: {
          documentId: { in: docs.map((doc) => doc.id) },
          proposedAt: { not: null },
        },
        select: { documentId: true, data: true },
      })).map((row) => [row.documentId, row.data]),
    );

    // Walks every post's current state. Fine at one author's scale; if this
    // ever gets slow, prefilter in SQL on the revision JSON before walking.
    for (const doc of docs) {
      if (hits.length >= limit) break;
      const data = proposed.get(doc.id) ??
        (doc.head
          ? (await prisma.revision.findUnique({
            where: { id: doc.head },
            select: { data: true },
          }))?.data
          : null);
      if (!data) continue;

      for (const { address, node } of walkBlocks(data as StoredState)) {
        if (hits.length >= limit) break;
        const block = nodeToBlock(node);
        const haystack = blockText(block);
        if (!haystack.toLowerCase().includes(needle)) continue;

        const at = haystack.toLowerCase().indexOf(needle);
        hits.push({
          postId: doc.id,
          title: doc.name,
          blockId: address,
          kind: block.type === "opaque" ? block.nodeType : block.type,
          preview: haystack
            .slice(Math.max(0, at - 40), at + needle.length + 40)
            .replace(/\s+/g, " ")
            .trim(),
        });
      }
    }

    if (hits.length === 0) return text(`No matches for "${query}".`);
    return json({ hits, truncated: hits.length >= limit });
  },
);

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

server.registerTool(
  "apply_ops",
  {
    description:
      "PROPOSE a block-level edit to a post. The change is stored, but it does " +
      "not become the document: it lands as a pending proposal for the author " +
      "to approve or reject in the app. Report it as proposed, never as done. " +
      "Successive calls on the same post squash into that one proposal, and " +
      "every read of the post then returns the proposed content, so you can " +
      "keep editing against your own work. If the author saves in the app " +
      "meanwhile, that proposal goes out of date and can no longer be " +
      "approved: reads return the live document again, and the next call " +
      "REPLACES the stale proposal rather than folding into it — say so, " +
      "because the earlier change is then no longer pending. " +
      "Every op names a block address from a read, and the batch carries that " +
      "read's stateHash — if the state you read has moved on, the whole batch " +
      "is refused and you re-read. That guard covers the state you read; it " +
      "does NOT detect the author saving in an editor tab, which is checked " +
      "only when the proposal is approved. " +
      "Ops apply all-or-nothing, and blocks you do not name are left exactly " +
      "as they were. " +
      "Ops: set_text{id,text}, replace_block{id,block}, " +
      "insert_blocks{blocks,after|before|appendTo}, delete_block{id}, " +
      "move_block{id,after|before|appendTo}. " +
      BLOCK_DOC,
    inputSchema: {
      id: z.string().describe("Document id"),
      stateHash: z.string().describe("The stateHash from the read these addresses came from"),
      ops: z.array(opSchema).min(1),
    },
  },
  async ({ id, stateHash: expected, ops }) => {
    const authorId = await getAuthorId();
    const post = await loadPost(id, authorId);
    if (!post) return fail(`Post ${id} not found (or not yours).`);

    let result;
    try {
      result = applyOps(post.state, expected, ops as Op[]);
    } catch (error) {
      return fail((error as Error).message);
    }

    const proposal = await proposeRevision(
      post.id,
      authorId,
      result.state,
      ops,
      post.base,
    );

    const after = outline(result.state);
    // `version` counts folds, so 0 means this call created the proposal.
    const squashed = proposal.version > 0;
    // The author saved after the earlier proposal was written, so that proposal
    // could never have been approved and this batch started over against the
    // current document (§3.6). Say it plainly: the earlier work is gone, and
    // reporting it as still pending would be a lie about the blog's state.
    const replaced = proposal.replaced
      ? `\nYour earlier proposal (${proposal.replaced}) was out of date — the ` +
        `author edited this post after it was written — so it has been ` +
        `replaced rather than added to. Only the change above is pending; tell ` +
        `the user, and re-apply anything from the earlier proposal that still ` +
        `matters.`
      : "";
    return text(
      `Proposed ${result.changed} block change` +
        `${result.changed === 1 ? "" : "s"} to "${post.name}". Nothing is ` +
        `live: the document is unchanged, and this is ` +
        (squashed
          ? `folded into the pending proposal ${proposal.id} ` +
            `(batch ${proposal.version + 1})`
          : `pending proposal ${proposal.id}`) +
        `, awaiting the author's approval in the app.${replaced}\n` +
        `Further edits to this post fold into the same proposal, and reads of ` +
        `it now return the proposed content rather than the live document.\n` +
        `stateHash: ${after.stateHash}\n\n${formatOutline(after)}`,
    );
  },
);

server.registerTool(
  "create_post",
  {
    description:
      "Create a post from blocks. Produces real Lexical content — proper code " +
      "nodes with highlighting, real headings and lists — not fenced Markdown. " +
      "Unlike apply_ops, a create lands normally rather than as a proposal — " +
      "there is nothing to overwrite — but it is flagged agent-created: it " +
      "arrives in the author's library as an unpublished draft awaiting their " +
      "accept or discard, and nobody else can read it until it is published. " +
      BLOCK_DOC,
    inputSchema: {
      title: z.string().min(1).describe("Post title"),
      blocks: z.array(blockSchema).min(1).describe("Body, in order"),
      seriesId: z.string().optional().describe("Series id to file it under"),
    },
  },
  async ({ title, blocks, seriesId }) => {
    const authorId = await getAuthorId();
    if (seriesId) {
      const series = await prisma.series.findFirst({
        where: { id: seriesId, authorId },
        select: { id: true },
      });
      if (!series) return fail(`Series ${seriesId} not found (or not yours).`);
    }

    let state: StoredState;
    try {
      state = stateFromBlocks(blocks as WritableBlock[]);
    } catch (error) {
      return fail(`Could not build the document: ${(error as Error).message}`);
    }

    const id = randomUUID();
    const revisionId = randomUUID();
    const rank = await rankForAppend(prisma, {
      authorId,
      seriesId: seriesId ?? null,
      parentId: null,
    });
    // The one write in this codebase that does not go through a repository, so
    // it is the one hand-placed notify (docs/plans/changes_detection.md §2.1) —
    // everything else the MCP server does reaches Postgres through
    // `src/repositories/*`, which emits on its own. Inside the transaction, so
    // the browser only hears about a post that actually committed. `null` means
    // the payload could not be built; the create then goes ahead unannounced
    // rather than failing, and §3's catch-up picks the post up.
    const notification = changeNotification({
      kind: "document.created",
      id,
      authorId,
      origin: AGENT_ORIGIN,
    });
    await prisma.$transaction([
      prisma.document.create({
        data: {
          id,
          name: title,
          authorId,
          type: DocumentType.DOCUMENT,
          rank,
          seriesId: seriesId ?? null,
          head: revisionId,
          // A create has no head to withhold and overwrites nothing, so it
          // lands — flagged, not gated (§3.7). The flag is what puts it in the
          // author's accept-or-discard list; `published` already defaults to
          // false, so "lands normally" is not "goes live".
          agentCreatedAt: new Date(),
          agentOrigin: AGENT_ORIGIN,
        },
      }),
      prisma.revision.create({
        data: { id: revisionId, documentId: id, authorId, data: state as object },
      }),
      ...(notification ? [notification] : []),
    ]);

    return text(
      `Created post ${id} ("${title}") with ${blocks.length} block` +
        `${blocks.length === 1 ? "" : "s"} — an unpublished draft, flagged ` +
        `agent-created and awaiting the author's accept or discard. Nobody ` +
        `else can read it until they publish it.\nstateHash: ${
          stateHash(state)
        }`,
    );
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("blog-content MCP server ready.");
}

main().catch((err) => {
  console.error("blog-content MCP server failed:", err);
  process.exit(1);
});
