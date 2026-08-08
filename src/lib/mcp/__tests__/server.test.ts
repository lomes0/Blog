/**
 * The MCP server's one invariant, exercised over a real client.
 *
 * `mcp/` had no test environment at all while the server was a process: the
 * tools were registered on a module-level singleton bound to `MCP_AUTHOR_ID`,
 * so there was nothing to construct and nothing to point somewhere else.
 * `createContentServer` makes the transport optional, and `InMemoryTransport`
 * then gives a client on the other end without a database, a socket or a
 * subprocess — which is what these specs are for.
 *
 * What they assert is the claim the whole remote plan rests on
 * (docs/plans/mcp_support.md §1, §7 check 6): **the author a tool queries with
 * comes from the injected resolver and from nowhere else.** Under stdio that is
 * one env var and the question looks academic; the moment two requests with two
 * tokens share a process it is the only thing standing between one author's
 * posts and another's, so it is worth a test now rather than then.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const revisionFindMany = vi.fn();
const proposeOps = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findMany: (...args: unknown[]) => findMany(...args) },
    series: { findMany: () => Promise.resolve([]) },
    revision: {
      findMany: (...args: unknown[]) => revisionFindMany(...args),
      findUnique: () => Promise.resolve(null),
    },
  },
}));

vi.mock("@/lib/agentWrites", () => ({
  readAgentState: () => Promise.resolve(null),
  proposeOps: (...args: unknown[]) => proposeOps(...args),
  proposeNewPost: () => Promise.resolve({ ok: false, reason: "invalid-blocks", message: "stub" }),
}));

const { createContentServer } = await import("../server");

/** A client wired straight to a server built for `authorId`. */
async function connect(
  resolveAuthorId: () => Promise<string>,
  scopes?: readonly ("read" | "propose")[],
  checkRate?: (kind: "read" | "write") => {
    allowed: boolean;
    retryAfterSeconds: number;
    remaining: number;
  },
) {
  const server = createContentServer({ resolveAuthorId, scopes, checkRate });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
  revisionFindMany.mockResolvedValue([]);
  proposeOps.mockResolvedValue({
    ok: false,
    reason: "not-found",
    message: "stub",
  });
});

describe("createContentServer", () => {
  it("registers the eight tools", async () => {
    const client = await connect(async () => "author-a");
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "apply_ops",
      "create_post",
      "list_posts",
      "list_series",
      "outline",
      "read_blocks",
      "read_post",
      "search",
    ]);
  });

  it("scopes a listing to the resolved author", async () => {
    const client = await connect(async () => "author-a");
    await client.callTool({ name: "list_posts", arguments: {} });

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      authorId: "author-a",
    });
  });

  it("gives two servers two different authors", async () => {
    // The property that matters once one process serves more than one caller:
    // nothing about the author is module state, so a second server cannot see
    // or inherit the first's.
    const a = await connect(async () => "author-a");
    const b = await connect(async () => "author-b");

    await a.callTool({ name: "list_posts", arguments: {} });
    await b.callTool({ name: "list_posts", arguments: {} });

    expect(findMany.mock.calls.map((call) => call[0].where.authorId))
      .toEqual(["author-a", "author-b"]);
  });

  it("passes the resolved author as the write's authorization", async () => {
    // `ownedBy` is what makes another author's document simply not found, so a
    // write that resolved the author and then failed to pass it along would be
    // an authorization hole rather than a bug in a query.
    const client = await connect(async () => "author-a");
    await client.callTool({
      name: "apply_ops",
      arguments: {
        id: "doc-1",
        stateHash: "h_0",
        ops: [{ op: "delete_block", id: "b1" }],
      },
    });

    expect(proposeOps).toHaveBeenCalledOnce();
    expect(proposeOps.mock.calls[0][0]).toMatchObject({
      authorId: "author-a",
      ownedBy: "author-a",
      documentId: "doc-1",
    });
  });

  it("hides the write tools from a read-only server", async () => {
    const client = await connect(async () => "author-a", ["read"]);
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).not.toContain("apply_ops");
    expect(names).not.toContain("create_post");
    // The reads are all still there — a read-only token is not a crippled one.
    expect(names).toContain("outline");
    expect(names).toContain("search");
  });

  it("writes nothing when a read-only server is asked to", async () => {
    // The refusal that matters is not the error message, it is that no proposal
    // was written. A tool the server never registered cannot reach proposeOps
    // at all, which is the point of gating at registration.
    const client = await connect(async () => "author-a", ["read"]);

    const result = await client.callTool({
      name: "apply_ops",
      arguments: { id: "doc-1", stateHash: "h_0", ops: [] },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not found/i);
    expect(proposeOps).not.toHaveBeenCalled();
  });

  it("counts reads and writes against separate budgets", async () => {
    const checkRate = vi.fn((_kind: "read" | "write") => ({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 5,
    }));
    const client = await connect(async () => "author-a", undefined, checkRate);

    await client.callTool({ name: "list_posts", arguments: {} });
    await client.callTool({
      name: "apply_ops",
      arguments: { id: "d", stateHash: "h", ops: [{ op: "delete_block", id: "b1" }] },
    });

    expect(checkRate.mock.calls.map((call) => call[0])).toEqual(["read", "write"]);
  });

  it("does no work at all when the budget is spent", async () => {
    // The point of metering before the handler: a refused call must not cost a
    // query. A limiter that fired after the read would bound the response rate
    // and nothing else.
    const client = await connect(async () => "author-a", undefined, () => ({
      allowed: false,
      retryAfterSeconds: 7,
      remaining: 0,
    }));

    const result = await client.callTool({ name: "list_posts", arguments: {} });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/7s/);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is unmetered when no budget is supplied", async () => {
    // What the stdio process gets: its caller is already inside the machine.
    const client = await connect(async () => "author-a");
    await client.callTool({ name: "list_posts", arguments: {} });
    expect(findMany).toHaveBeenCalledOnce();
  });

  it("resolves the author lazily, and at most once", async () => {
    // Listing tools reads nothing, so it must not cost a user lookup — that is
    // the difference between a per-request server being cheap and being a query
    // per handshake. Two calls afterwards share one resolution.
    const resolve = vi.fn(async () => "author-a");
    const client = await connect(resolve);

    await client.listTools();
    expect(resolve).not.toHaveBeenCalled();

    await client.callTool({ name: "list_posts", arguments: {} });
    await client.callTool({ name: "list_posts", arguments: {} });
    expect(resolve).toHaveBeenCalledOnce();
  });
});
