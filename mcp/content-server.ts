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

interface Loaded {
  id: string;
  name: string;
  state: StoredState;
}

/** Fetch one of the author's posts as an editor state. */
async function loadPost(id: string, authorId: string): Promise<Loaded | null> {
  const doc = await prisma.document.findFirst({
    where: { id, authorId, type: DocumentType.DOCUMENT },
    select: { id: true, name: true, head: true },
  });
  if (!doc) return null;

  const revision = doc.head
    ? await prisma.revision.findUnique({
      where: { id: doc.head },
      select: { data: true },
    })
    : await prisma.revision.findFirst({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });

  // A post with no revision yet is an empty document, not an error — it can be
  // written to like any other.
  const data = revision?.data;
  return {
    id: doc.id,
    name: doc.name,
    state: (data as StoredState | undefined) ?? emptyState(),
  };
}

/**
 * Save a new state as a new revision and advance head.
 *
 * Always a fresh revision id. The editor deliberately folds a run of autosaves
 * into one revision by re-posting its id (see the plan §2.2); an agent write is
 * a distinct point in history and must not be merged into whatever the editor
 * happens to have open.
 */
async function saveRevision(
  documentId: string,
  authorId: string,
  state: StoredState,
): Promise<string> {
  const revisionId = randomUUID();
  await prisma.$transaction([
    prisma.revision.create({
      data: { id: revisionId, documentId, authorId, data: state as object },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: { head: revisionId },
    }),
  ]);
  return revisionId;
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
  "$latex$. Node types with no codec (math as a block, image, table, graph, " +
  "sketch, canvas, sticky) are read-only: they can be read, moved or deleted " +
  "by address, but not rewritten.";

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
    if (result.blocks.length === 0) {
      return text(`"${post.name}" is empty.\nstateHash: ${result.stateHash}`);
    }
    return text(
      `"${post.name}"\nstateHash: ${result.stateHash}\n\n${formatOutline(result)}`,
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
    return json(result);
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
    return json({ title: post.name, ...readAll(post.state) });
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

    // Walks every post's head revision. Fine at one author's scale; if this
    // ever gets slow, prefilter in SQL on the revision JSON before walking.
    for (const doc of docs) {
      if (hits.length >= limit) break;
      if (!doc.head) continue;
      const revision = await prisma.revision.findUnique({
        where: { id: doc.head },
        select: { data: true },
      });
      if (!revision?.data) continue;

      for (const { address, node } of walkBlocks(revision.data as StoredState)) {
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
      "Edit a post by block. Every op names a block address from a read, and " +
      "the batch carries that read's stateHash — if the document changed since, " +
      "the whole batch is refused and you re-read. Ops apply all-or-nothing, " +
      "and blocks you do not name are left exactly as they were. " +
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

    const revisionId = await saveRevision(post.id, authorId, result.state);
    const after = outline(result.state);
    return text(
      `Updated ${result.changed} block${result.changed === 1 ? "" : "s"} in ` +
        `"${post.name}" (revision ${revisionId}).\n` +
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
      "The post is created unpublished. " +
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
        },
      }),
      prisma.revision.create({
        data: { id: revisionId, documentId: id, authorId, data: state as object },
      }),
    ]);

    return text(
      `Created post ${id} ("${title}") with ${blocks.length} block` +
        `${blocks.length === 1 ? "" : "s"}.\nstateHash: ${stateHash(state)}`,
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
