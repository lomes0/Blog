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
import { ApiError, tokenRoute } from "@/lib/api-utils";
import { isAgentScope } from "@/lib/agentTokens";
import { AGENT_ORIGIN, createContentServer } from "@/lib/mcp/server";
import {
  MAX_BODY_BYTES,
  readLimiter,
  requestLimiter,
  writeLimiter,
} from "@/lib/mcp/limits";
import { isSecureTransport } from "@/lib/mcp/transportSecurity";
import { agentOrigin } from "@/lib/proposalLabels";

// Prisma, so not the edge runtime; and nothing here is ever cacheable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = tokenRoute(async (request, { token }) => {
  // 426 rather than 403: the request is not forbidden, the protocol is. The
  // token has already been read off the wire by the time we get here, so this
  // does not protect *this* request — it stops the next thousand, and tells the
  // operator plainly rather than quietly accepting a credential in cleartext.
  if (!isSecureTransport(request)) {
    throw new ApiError(
      426,
      "HTTPS Required",
      "An agent token must not be sent over plain HTTP. Put the endpoint " +
        "behind TLS, or set MCP_ALLOW_INSECURE=1 if the transport is already " +
        "private (a tunnel or a private mesh).",
      { headers: { Upgrade: "TLS/1.2, HTTP/1.1", Connection: "Upgrade" } },
    );
  }

  // Before anything is parsed or dispatched. Both of these bound what a caller
  // holding a valid token can cost — authentication already ran, so nobody
  // reaches here anonymously, and neither is a security boundary (see
  // `lib/rateLimit.ts`). They exist because a static credential does not expire
  // when a browser closes, and an agent in a loop is the ordinary failure.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(
      413,
      "Request Too Large",
      `The body may be at most ${MAX_BODY_BYTES} bytes.`,
    );
  }

  const budget = requestLimiter.take(token.id);
  if (!budget.allowed) {
    throw new ApiError(
      429,
      "Too Many Requests",
      `Slow down and retry in ${budget.retryAfterSeconds}s.`,
      { headers: { "Retry-After": String(budget.retryAfterSeconds) } },
    );
  }

  // A server per request, bound to this token's owner. Nothing about the author
  // is module state, so two requests carrying two tokens cannot see each
  // other's — the property `src/lib/mcp/__tests__/server.test.ts` pins.
  const server = createContentServer({
    resolveAuthorId: async () => token.userId,
    // `scopes` is a free-form text[] in the database, so unknown entries are
    // dropped rather than trusted: a scope the code does not implement must not
    // widen anything by being present.
    scopes: token.scopes.filter(isAgentScope),
    // Per tool call rather than per request, and separately for reads and
    // writes — one HTTP request can carry more than one JSON-RPC message, so
    // counting requests alone would undercount exactly the caller trying to get
    // more than their share.
    checkRate: (kind) =>
      (kind === "write" ? writeLimiter : readLimiter).take(token.id),
    // Which credential proposed, not just that something did. When a token
    // leaks, this is the difference between "an agent wrote this" and knowing
    // what to revoke.
    origin: agentOrigin(AGENT_ORIGIN, token.name),
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
    const response = await transport.handleRequest(request);
    // Read the body out before the `finally` closes the transport underneath
    // it. `enableJsonResponse` means this is a complete buffer rather than a
    // stream held open, so it costs one copy of a small payload and removes
    // any question of ordering between the close and the read.
    const body = await response.arrayBuffer();
    // Every response here is one author's private content, keyed to a bearer
    // token. `dynamic = "force-dynamic"` governs Next's own cache; this governs
    // every proxy between here and the agent.
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, private");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } finally {
    // Per-request server, per-request cleanup. Without this every call leaks a
    // transport and its listeners for the life of the container.
    await transport.close();
    await server.close();
  }
}, { errorLabel: "MCP request failed" });
