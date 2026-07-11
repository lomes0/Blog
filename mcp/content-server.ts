// MCP server exposing this blog's Prisma/Lexical content to Claude Code.
//
// Run (see .mcp.json):
//   node --import tsx --import ./mcp/bootstrap.mjs mcp/content-server.ts
//
// bootstrap.mjs MUST load first — it installs the DOM/css shims the editor's
// custom nodes need to import headlessly (see ./lexical).
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
  editorStateToMarkdown,
  markdownToEditorState,
  unsupportedNodeTypes,
} from "./lexical";

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
const fail = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
  isError: true,
});

/** Fetch the current editor-state JSON for one of the author's posts. */
async function loadHeadState(id: string, authorId: string) {
  const doc = await prisma.document.findFirst({
    where: { id, authorId, type: DocumentType.DOCUMENT },
    select: { id: true, name: true, head: true },
  });
  if (!doc) return null;
  const rev = doc.head
    ? await prisma.revision.findUnique({
      where: { id: doc.head },
      select: { data: true },
    })
    : await prisma.revision.findFirst({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      select: { data: true },
    });
  return { doc, data: rev?.data ?? null };
}

const server = new McpServer({ name: "blog-content", version: "0.1.0" });

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
    return text(JSON.stringify(docs, null, 2));
  },
);

server.registerTool(
  "read_post",
  {
    description: "Read one post's content as Markdown.",
    inputSchema: { id: z.string().describe("Document id") },
  },
  async ({ id }) => {
    const authorId = await getAuthorId();
    const loaded = await loadHeadState(id, authorId);
    if (!loaded) return fail(`Post ${id} not found (or not yours).`);
    if (!loaded.data) return fail(`Post ${id} has no content yet.`);
    try {
      const md = editorStateToMarkdown(loaded.data);
      return text(`# ${loaded.doc.name}\n\n${md}`);
    } catch (e) {
      return fail(`Could not convert post ${id} to Markdown: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "create_post",
  {
    description:
      "Create a new blog post from Markdown. Returns the new post id. " +
      "Optionally place it in a series.",
    inputSchema: {
      title: z.string().min(1).describe("Post title"),
      markdown: z.string().describe("Post body as Markdown"),
      seriesId: z.string().optional().describe("Series id to add the post to"),
    },
  },
  async ({ title, markdown, seriesId }) => {
    const authorId = await getAuthorId();
    if (seriesId) {
      const series = await prisma.series.findFirst({
        where: { id: seriesId, authorId },
        select: { id: true },
      });
      if (!series) return fail(`Series ${seriesId} not found (or not yours).`);
    }
    let state: object;
    try {
      state = markdownToEditorState(markdown);
    } catch (e) {
      return fail(`Could not parse Markdown: ${(e as Error).message}`);
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
        data: {
          id: revisionId,
          documentId: id,
          authorId,
          data: state as object,
        },
      }),
    ]);
    return text(`Created post ${id} ("${title}").`);
  },
);

server.registerTool(
  "update_post",
  {
    description:
      "Replace a post's entire body with new Markdown (saved as a new revision). " +
      "Refuses if the post contains content that Markdown cannot represent.",
    inputSchema: {
      id: z.string().describe("Document id"),
      markdown: z.string().describe("New full post body as Markdown"),
    },
  },
  async ({ id, markdown }) => {
    const authorId = await getAuthorId();
    const loaded = await loadHeadState(id, authorId);
    if (!loaded) return fail(`Post ${id} not found (or not yours).`);
    if (loaded.data) {
      const unsupported = unsupportedNodeTypes(loaded.data);
      if (unsupported.length) {
        return fail(
          `Refusing to overwrite: this post contains content a Markdown ` +
            `round-trip would drop (${unsupported.join(", ")}). Edit it in the app.`,
        );
      }
    }
    let state: object;
    try {
      state = markdownToEditorState(markdown);
    } catch (e) {
      return fail(`Could not parse Markdown: ${(e as Error).message}`);
    }
    const revisionId = randomUUID();
    await prisma.$transaction([
      prisma.revision.create({
        data: {
          id: revisionId,
          documentId: id,
          authorId,
          data: state as object,
        },
      }),
      prisma.document.update({
        where: { id },
        data: { head: revisionId },
      }),
    ]);
    return text(`Updated post ${id} (new revision ${revisionId}).`);
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
    return text(JSON.stringify(series, null, 2));
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
