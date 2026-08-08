// stdio entry point for the blog-content MCP server.
//
// Run (see .mcp.json):
//   node --import tsx --env-file=.env mcp/content-server.ts
//
// The eight tools live in `src/lib/mcp/server.ts`, which knows nothing about
// transports or the environment. This file is the whole of what makes that
// server *this process*: it resolves MCP_AUTHOR_ID to a user and speaks stdio.
// An HTTP door onto the same factory is docs/plans/mcp_support.md phase 3.
//
// Auth: single-user, personal use. All operations are scoped to the user named
// by MCP_AUTHOR_ID (a User id or email); the server never reads or writes other
// authors' content. Requires DATABASE_URL.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { prisma } from "@/lib/prisma";
import { createContentServer } from "@/lib/mcp/server";

const AUTHOR_REF = process.env.MCP_AUTHOR_ID;
if (!AUTHOR_REF) {
  console.error("MCP_AUTHOR_ID is required (a User id or email).");
  process.exit(1);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve MCP_AUTHOR_ID (id or email) to a User id. */
async function resolveAuthorId(): Promise<string> {
  const where = UUID_RE.test(AUTHOR_REF!)
    ? { id: AUTHOR_REF! }
    : { email: AUTHOR_REF! };
  const user = await prisma.user.findUnique({ where, select: { id: true } });
  if (!user) throw new Error(`No user matches MCP_AUTHOR_ID=${AUTHOR_REF}`);
  return user.id;
}

async function main() {
  // Eagerly, before the transport is connected: a misconfigured author is a
  // startup error here, not a refusal on whichever tool the agent happens to
  // call first. (The factory keeps its resolver lazy, because a per-request
  // server should not pay a lookup for a `tools/list` that reads nothing.)
  const authorId = await resolveAuthorId();
  const server = createContentServer({ resolveAuthorId: async () => authorId });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("blog-content MCP server ready.");
}

main().catch((err) => {
  console.error("blog-content MCP server failed:", err);
  process.exit(1);
});
