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
 * (docs/plans/archive/mcp-support.md §1, §7 check 6): **the author a tool queries with
 * comes from the injected resolver and from nowhere else.** Under stdio that is
 * one env var and the question looks academic; the moment two requests with two
 * tokens share a process it is the only thing standing between one author's
 * posts and another's, so it is worth a test now rather than then.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const seriesFindMany = vi.fn();
const userFindUnique = vi.fn();
const revisionFindMany = vi.fn();
const proposeOps = vi.fn();
const proposeNewPost = vi.fn();
const proposeRenameOwnedDocument = vi.fn();
const deleteOwnedDocument = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findMany: (...args: unknown[]) => findMany(...args) },
    series: { findMany: (...args: unknown[]) => seriesFindMany(...args) },
    // The author's `rootOrder`: series candidates come back in the order the
    // author keeps them in (docs/plans/archive/ordering-simplification.md §2),
    // not in whatever order the rows arrive.
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    revision: {
      findMany: (...args: unknown[]) => revisionFindMany(...args),
      findUnique: () => Promise.resolve(null),
    },
  },
}));

// Both go to the repository rather than through `agentWrites`: a rename is a
// proposal but not a *revision* proposal — it is three columns on the document
// (docs/plans/claude-code-backlog.md §8) — and a delete is not a proposal at all.
vi.mock("@/repositories/document", () => ({
  proposeRenameOwnedDocument: (...args: unknown[]) =>
    proposeRenameOwnedDocument(...args),
  deleteOwnedDocument: (...args: unknown[]) => deleteOwnedDocument(...args),
}));

vi.mock("@/lib/agentWrites", () => ({
  readAgentState: () => Promise.resolve(null),
  proposeOps: (...args: unknown[]) => proposeOps(...args),
  proposeNewPost: (...args: unknown[]) => proposeNewPost(...args),
}));

const { createContentServer } = await import("../server");

/** A client wired straight to a server built for `authorId`. */
async function connect(
  resolveAuthorId: () => Promise<string>,
  scopes?: readonly ("read" | "propose" | "manage")[],
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
  seriesFindMany.mockResolvedValue([]);
  userFindUnique.mockResolvedValue({ rootOrder: [] });
  revisionFindMany.mockResolvedValue([]);
  proposeNewPost.mockResolvedValue({
    ok: true,
    id: "doc-new",
    blockCount: 2,
    stateHash: "h_1",
  });
  proposeOps.mockResolvedValue({
    ok: false,
    reason: "not-found",
    message: "stub",
  });
  proposeRenameOwnedDocument.mockResolvedValue({
    ok: true,
    currentTitle: "Before",
    replaced: null,
    unchanged: false,
  });
  deleteOwnedDocument.mockResolvedValue({
    ok: false,
    reason: "unconfirmed",
    name: "Linux Process Manager",
    revisions: 12,
    published: false,
  });
});

describe("createContentServer", () => {
  it("registers the ten tools", async () => {
    const client = await connect(async () => "author-a");
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "apply_ops",
      "create_post",
      "delete_post",
      "list_posts",
      "list_series",
      "outline",
      "read_blocks",
      "read_post",
      "rename_post",
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

  it("names a recoverable refusal in front of its message", async () => {
    // `block_not_found` is an `invalid` by status and a re-read by recovery.
    // The tool description tells the model what to do about that exact word,
    // so the word has to actually reach it — an unlabelled message reads as
    // the ordinary "you got it wrong, do not retry".
    proposeOps.mockResolvedValue({
      ok: false,
      reason: "invalid",
      code: "block_not_found",
      message: 'op 1: no block at "b99" — the address may come from an ' +
        "outdated read; re-run outline or search and retry with a current " +
        "address",
    });
    const client = await connect(async () => "author-a");

    const result = await client.callTool({
      name: "apply_ops",
      arguments: {
        id: "doc-1",
        stateHash: "h_0",
        ops: [{ op: "set_text", id: "b99", text: "nowhere" }],
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0].text;
    expect(text.startsWith("block_not_found: ")).toBe(true);
  });

  it("leaves an unrecoverable refusal unprefixed", async () => {
    proposeOps.mockResolvedValue({
      ok: false,
      reason: "invalid",
      message: "op 1: heading level must be 1-6",
    });
    const client = await connect(async () => "author-a");

    const result = await client.callTool({
      name: "apply_ops",
      arguments: {
        id: "doc-1",
        stateHash: "h_0",
        ops: [{ op: "delete_block", id: "b1" }],
      },
    });

    const text = (result.content as { text: string }[])[0].text;
    expect(text).not.toMatch(/^block_not_found/);
    expect(text).toMatch(/heading level must be 1-6/);
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

  // -------------------------------------------------------------------------
  // The `manage` scope
  //
  // `manage` and `propose` are independent, and the tools they gate differ in
  // kind: a proposal can be declined, a delete cannot be undone. Both halves of
  // that independence are pinned, because the obvious way to write the guard —
  // hanging `manage` off the `propose` early return — passes every other test
  // in this file while silently disarming one of the two tokens.
  // -------------------------------------------------------------------------

  it("gives a propose-only server every reviewable write and no delete", async () => {
    const client = await connect(async () => "author-a", ["read", "propose"]);
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toContain("apply_ops");
    expect(names).toContain("create_post");
    // A rename proposes since §8 of the backlog, so it belongs to the scope
    // whose contract is "everything here can be declined" — and the delete,
    // which cannot be, must not have come with it.
    expect(names).toContain("rename_post");
    expect(names).not.toContain("delete_post");
  });

  it("gives a manage-only server the delete without the proposal ones", async () => {
    const client = await connect(async () => "author-a", ["read", "manage"]);
    const names = (await client.listTools()).tools.map((tool) => tool.name);

    expect(names).toContain("delete_post");
    expect(names).not.toContain("apply_ops");
    expect(names).not.toContain("create_post");
    expect(names).not.toContain("rename_post");
  });

  it("deletes nothing when a read-only server is asked to", async () => {
    const client = await connect(async () => "author-a", ["read"]);

    const result = await client.callTool({
      name: "delete_post",
      arguments: { id: "doc-1", confirm: "Anything" },
    });

    expect(result.isError).toBe(true);
    expect(deleteOwnedDocument).not.toHaveBeenCalled();
  });

  it("passes the resolved author as the write tools' authorization", async () => {
    const client = await connect(
      async () => "author-a",
      ["read", "propose", "manage"],
    );

    await client.callTool({
      name: "rename_post",
      arguments: { id: "doc-1", title: "After" },
    });
    await client.callTool({
      name: "delete_post",
      arguments: { id: "doc-1", confirm: "Whatever" },
    });

    // Neither tool takes an author from its arguments — same invariant as the
    // reads, and the only thing keeping one token off another author's posts.
    expect(proposeRenameOwnedDocument.mock.calls[0][0]).toMatchObject({
      id: "doc-1",
      ownedBy: "author-a",
      title: "After",
    });
    expect(deleteOwnedDocument.mock.calls[0][0]).toMatchObject({
      id: "doc-1",
      ownedBy: "author-a",
    });
  });

  // ── Renames propose (docs/plans/claude-code-backlog.md §8) ────────────────
  //
  // The wording is the tested part, and it is not decoration: an agent that
  // reports a rename as done has told the author their post is called something
  // it is not, and nothing downstream can correct that. Same class of claim as
  // `apply_ops` reporting "proposed" rather than "saved".

  it("reports a rename as proposed and the post as still named what it was", async () => {
    const client = await connect(async () => "author-a", ["read", "propose"]);

    const result = await client.callTool({
      name: "rename_post",
      arguments: { id: "doc-1", title: "After" },
    });

    expect(result.isError).toBeFalsy();
    const said = JSON.stringify(result.content);
    expect(said).toMatch(/Proposed renaming/);
    // The quotes around the title are escaped twice over by the transport and
    // then by `JSON.stringify`, so the assertion is on the words either side.
    expect(said).toMatch(/still titled \\"Before/);
    expect(said).not.toMatch(/Renamed "/);
  });

  it("names the pending title a second rename displaced", async () => {
    proposeRenameOwnedDocument.mockResolvedValue({
      ok: true,
      currentTitle: "Before",
      replaced: "First guess",
      unchanged: false,
    });
    const client = await connect(async () => "author-a", ["read", "propose"]);

    const result = await client.callTool({
      name: "rename_post",
      arguments: { id: "doc-1", title: "Second guess" },
    });

    expect(JSON.stringify(result.content)).toMatch(/First guess/);
  });

  it("says nothing was proposed when the post already has that title", async () => {
    proposeRenameOwnedDocument.mockResolvedValue({
      ok: true,
      currentTitle: "Before",
      replaced: null,
      unchanged: true,
    });
    const client = await connect(async () => "author-a", ["read", "propose"]);

    const result = await client.callTool({
      name: "rename_post",
      arguments: { id: "doc-1", title: "Before" },
    });

    const said = JSON.stringify(result.content);
    expect(said).toMatch(/already titled/);
    expect(said).toMatch(/Nothing was proposed/);
  });

  it("previews a delete without confirming it on the caller's behalf", async () => {
    // The guard is only worth anything if the server never supplies the title
    // it was just told. A single call, carrying no confirmation, that reports
    // what would go — and reports it as an error, so an agent cannot read it as
    // "done".
    const client = await connect(async () => "author-a", ["read", "manage"]);

    const result = await client.callTool({
      name: "delete_post",
      arguments: { id: "doc-1" },
    });

    expect(deleteOwnedDocument).toHaveBeenCalledOnce();
    expect(deleteOwnedDocument.mock.calls[0][0].confirmName).toBeUndefined();
    expect(result.isError).toBe(true);
    const said = JSON.stringify(result.content);
    expect(said).toMatch(/Nothing was deleted/);
    expect(said).toMatch(/Linux Process Manager/);
    expect(said).toMatch(/12 revisions/);
  });

  it("reports a mismatched confirmation as a stop, not a retry", async () => {
    const client = await connect(async () => "author-a", ["read", "manage"]);

    const result = await client.callTool({
      name: "delete_post",
      arguments: { id: "doc-1", confirm: "Linux Process Manger" },
    });

    expect(result.isError).toBe(true);
    const said = JSON.stringify(result.content);
    expect(said).toMatch(/Refused/);
    expect(said).toMatch(/right id/);
  });

  it("counts a rename and a delete against the write budget", async () => {
    const checkRate = vi.fn((_kind: "read" | "write") => ({
      allowed: true,
      retryAfterSeconds: 0,
      remaining: 1,
    }));
    const client = await connect(
      async () => "author-a",
      ["read", "propose", "manage"],
      checkRate,
    );

    await client.callTool({
      name: "rename_post",
      arguments: { id: "doc-1", title: "After" },
    });
    await client.callTool({ name: "delete_post", arguments: { id: "doc-1" } });

    expect(checkRate.mock.calls.map(([kind]) => kind)).toEqual([
      "write",
      "write",
    ]);
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

/**
 * Series placement on create (docs/plans/claude-code-backlog.md §6).
 *
 * The decision is "agent proposes, does not decide": a create with no series
 * lands at root and carries the candidates back so the suggestion is not lost,
 * and a create that named one is left alone. Both halves are asserted, because
 * the failure that matters is not a missing suggestion — it is a placement the
 * author did not ask for, or a response a model reads as one.
 */
describe("create_post series placement", () => {
  const created = async (args: Record<string, unknown>) => {
    const client = await connect(async () => "author-a");
    const result = await client.callTool({ name: "create_post", arguments: args });
    return (result.content as { text: string }[])[0].text;
  };

  const body = {
    title: "On ranks",
    blocks: [{ type: "paragraph", text: "hello" }],
  };

  it("files nothing, and offers the author's series as candidates", async () => {
    seriesFindMany.mockResolvedValue([
      { id: "ser-1", title: "Fractional indexing", description: "ranks" },
      { id: "ser-2", title: "Postgres notes", description: null },
    ]);

    const text = await created(body);

    // Nothing was placed: the argument the write got is the one it was given.
    expect(proposeNewPost.mock.calls[0][0].seriesId).toBeUndefined();
    expect(text).toMatch(/Not filed/);
    expect(text).toMatch(/ser-1 — Fractional indexing: ranks/);
    expect(text).toMatch(/ser-2 — Postgres notes/);
    // Advice, and said to be: a model must not read this as a placement.
    expect(text).toMatch(/let them file it/);
  });

  it("reads candidates scoped to the resolved author", async () => {
    // The suggestion is built from a query like any other, so it is subject to
    // the same rule as every read here: another author's series is not a
    // candidate, because it is not visible.
    await created(body);

    expect(seriesFindMany).toHaveBeenCalledOnce();
    expect(seriesFindMany.mock.calls[0][0].where).toEqual({
      authorId: "author-a",
    });
  });

  it("suggests nothing when the caller named a series", async () => {
    const text = await created({ ...body, seriesId: "ser-1" });

    expect(proposeNewPost.mock.calls[0][0].seriesId).toBe("ser-1");
    expect(seriesFindMany).not.toHaveBeenCalled();
    expect(text).toMatch(/Filed under series ser-1/);
    expect(text).not.toMatch(/Candidate series/);
  });

  it("says so when there is nothing to suggest", async () => {
    const text = await created(body);

    expect(text).toMatch(/no series/);
    expect(text).not.toMatch(/Candidate series/);
  });

  it("defers to list_series past the cap rather than pasting the library", async () => {
    seriesFindMany.mockResolvedValue(
      Array.from({ length: 23 }, (_, i) => ({
        id: `ser-${i}`,
        title: `Series ${i}`,
        description: null,
      })),
    );
    // In the author's own order, which is what decides *which* twenty the cap
    // keeps — so the array is what the assertion below is really about.
    userFindUnique.mockResolvedValue({
      rootOrder: Array.from({ length: 23 }, (_, i) => `ser-${i}`),
    });

    const text = await created(body);

    expect(text).toMatch(/ser-19 — Series 19/);
    expect(text).not.toMatch(/ser-20 — Series 20/);
    expect(text).toMatch(/…and 3 more \(list_series\)/);
  });

  it("suggests nothing when the create failed", async () => {
    proposeNewPost.mockResolvedValue({
      ok: false,
      reason: "invalid-blocks",
      message: "unknown block type",
    });

    const client = await connect(async () => "author-a");
    const result = await client.callTool({ name: "create_post", arguments: body });

    expect(result.isError).toBe(true);
    expect(seriesFindMany).not.toHaveBeenCalled();
  });
});
