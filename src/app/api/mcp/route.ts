// The remote MCP endpoint: the same eight tools the stdio server exposes,
// reached over HTTP with an agent token. See docs/plans/mcp_support.md phase 3.
//
// Same origin as the blog (§8.2, decided 8 Aug 2026): it shares the app's TLS
// and deployment, and there is one thing to point Claude Code at. The cost is
// that the endpoint cannot be firewalled or taken down independently of the
// blog — if that becomes a requirement, it is a reverse-proxy rule rather than
// a rewrite.
//
// Only POST is exported. Next answers an unimplemented method with 405 by
// itself, which is what a spec-conformant client wants for the GET a stateful
// server would use for its notification stream.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { tokenRoute } from "@/lib/api-utils";
import { isAgentScope } from "@/lib/agentTokens";
import { createContentServer } from "@/lib/mcp/server";

// Prisma, so not the edge runtime; and nothing here is ever cacheable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = tokenRoute(async (request, { token }) => {
  // A server per request, bound to this token's owner. Nothing about the author
  // is module state, so two requests carrying two tokens cannot see each
  // other's — the property `src/lib/mcp/__tests__/server.test.ts` pins.
  const server = createContentServer({
    resolveAuthorId: async () => token.userId,
    // `scopes` is a free-form text[] in the database, so unknown entries are
    // dropped rather than trusted: a scope the code does not implement must not
    // widen anything by being present.
    scopes: token.scopes.filter(isAgentScope),
  });

  // Stateless: no `sessionIdGenerator`, so nothing is pinned to one instance
  // and a second container can serve the next request. `enableJsonResponse`
  // because all eight tools are request/response — there is no server-initiated
  // notification to keep a stream open for, and a complete Response is what
  // lets the transport be closed as soon as it is built.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Per-request server, per-request cleanup. Without this every call leaks a
    // transport and its listeners for the life of the container.
    await transport.close();
    await server.close();
  }
}, { errorLabel: "MCP request failed" });
