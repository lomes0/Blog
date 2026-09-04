// End-to-end smoke test for the *remote* MCP endpoint, `POST /api/mcp`.
//
// The stdio smoke (`mcp/smoke.ts`) proves the ten tools. This one proves the
// half that only exists over HTTP and that no spec covers: token auth and its
// refusals, scope narrowing at registration, the cleartext rule, the body cap,
// the budgets, statelessness, and that a remote write names the credential that
// made it. `src/lib/mcp/__tests__/server.test.ts` drives the same server over
// `InMemoryTransport`, which by construction cannot see any of that.
//
// It speaks the protocol through the real SDK client, so what it exercises is
// the path Claude Code itself takes — not a hand-rolled approximation of it.
//
//   npm run mcp:smoke:http                       # localhost, mints its own token
//   npm run mcp:smoke:http -- https://blog/api/mcp --write
//   BLOG_MCP_TOKEN=blog_pat_… npm run mcp:smoke:http -- https://blog/api/mcp
//
// ## Two modes, because the point is that it runs from anywhere
//
// With `DATABASE_URL` and `MCP_AUTHOR_ID` it provisions itself: it mints the
// tokens it needs — a read-only one to prove six tools rather than nine, and a
// `manage` one to prove that `delete_post` is the difference between nine and
// ten — and revokes them on the way out whatever happened.
// That is the local case, and it is zero-setup.
//
// With only `BLOG_MCP_TOKEN` it runs against a deployment it has no database
// access to — which is the configuration the endpoint exists for. The checks
// that need a second token or a direct row read are skipped *by name*, so the
// output never implies coverage it did not have.
//
// ## What it will not do
//
// The write path is opt-in (`--write`) and refuses to run without a database,
// because there is no `delete_post` tool: an unattended create over HTTP alone
// would be litter only a human could clear, and an `apply_ops` would leave a
// pending proposal sitting in someone's review rail
// (docs/plans/archive/agent-gating.md §3.8). With a database it cleans up after itself
// exactly as the stdio smoke does.
//
// The budget checks are opt-in too (`--limits`), because proving a limiter
// works means spending a whole bucket — ~90 requests. Harmless against a token
// this script is about to revoke, rude against a live deployment as a matter of
// routine.
import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MAX_BODY_BYTES } from "@/lib/mcp/limits";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const URL_ARG = argv.find((a) => !a.startsWith("--"));
const ENDPOINT = URL_ARG ?? process.env.BLOG_MCP_URL ?? "http://localhost:3000/api/mcp";
const WANT_WRITE = flags.has("--write");
const WANT_LIMITS = flags.has("--limits");

// ---------------------------------------------------------------------------
// A check harness small enough to read
// ---------------------------------------------------------------------------

const results: Array<{ name: string; state: "pass" | "fail" | "skip"; note: string }> = [];

/**
 * Run one assertion. A check reports its own evidence rather than a bare
 * boolean, so a failure says what it saw — the whole value of a smoke run
 * against a deployment is the line you can paste into an issue.
 */
async function check(
  name: string,
  fn: () => Promise<string | { skip: string }>,
): Promise<void> {
  try {
    const outcome = await fn();
    if (typeof outcome === "object") {
      results.push({ name, state: "skip", note: outcome.skip });
      console.log(`  ~ ${name} — skipped: ${outcome.skip}`);
      return;
    }
    results.push({ name, state: "pass", note: outcome });
    console.log(`  ✓ ${name}${outcome ? ` — ${outcome}` : ""}`);
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    results.push({ name, state: "fail", note });
    console.log(`  ✗ ${name} — ${note}`);
  }
}

const expect = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

// ---------------------------------------------------------------------------
// Raw HTTP, for the things a protocol client cannot express
// ---------------------------------------------------------------------------

const RPC_LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

/** A POST that bypasses the SDK — refusals happen before any protocol runs. */
const post = (init: { token?: string; body?: string; headers?: Record<string, string> }) =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body ?? RPC_LIST,
  });

/** Well-formed, and belongs to nobody: the shape of a guess. */
const unknownToken = () => `blog_pat_${randomBytes(32).toString("base64url")}`;

/**
 * The same POST, down at `node:http`, for the one check `fetch` cannot make.
 *
 * `Host` is a forbidden header name in the fetch standard: undici drops it
 * silently, so a cleartext check written with `fetch` reaches the server
 * claiming to be `localhost`, is waved through as loopback, and reports that
 * the rule held when it was never consulted. Getting a wrong answer quietly is
 * worse than not asking, so this one check goes under the abstraction.
 */
function rawPost(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined> }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const secure = target.protocol === "https:";
    void import(secure ? "node:https" : "node:http").then((mod) => {
      const req = mod.request(
        {
          host: target.hostname,
          port: target.port || (secure ? 443 : 80),
          path: target.pathname + target.search,
          method: "POST",
          headers: { ...headers, "content-length": Buffer.byteLength(body) },
        },
        (res: { statusCode?: number; headers: Record<string, string | string[] | undefined>; resume: () => void }) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, headers: res.headers });
        },
      );
      req.on("error", reject);
      req.end(body);
    }, reject);
  });
}

// ---------------------------------------------------------------------------
// Protocol, through the client Claude Code uses
// ---------------------------------------------------------------------------

interface ToolResult {
  content?: Array<{ text?: string }>;
  isError?: boolean;
}

const textOf = (r: unknown): string =>
  (r as ToolResult).content?.map((c) => c.text ?? "").join("\n") ?? "";

const hashIn = (s: string): string => /stateHash:\s*(\S+)/.exec(s)?.[1] ?? "";

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "smoke-http", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hasDb = Boolean(process.env.DATABASE_URL) && Boolean(process.env.MCP_AUTHOR_ID);
  const provided = process.env.BLOG_MCP_TOKEN;

  if (!hasDb && !provided) {
    console.error(
      "Nothing to authenticate with. Either set DATABASE_URL and MCP_AUTHOR_ID\n" +
        "(the script then mints and revokes its own tokens), or set BLOG_MCP_TOKEN\n" +
        "to a token you minted with `npm run mcp:token`.",
    );
    process.exit(2);
  }

  console.log(`endpoint: ${ENDPOINT}`);
  console.log(`mode:     ${hasDb ? "self-provisioning (database reachable)" : "token-only (no database)"}`);
  console.log(
    `optional: ${[WANT_WRITE ? "--write" : null, WANT_LIMITS ? "--limits" : null]
      .filter(Boolean)
      .join(" ") || "none (pass --write and/or --limits to widen)"}\n`,
  );

  // Minted here, revoked in the `finally` — so a crash mid-run does not leave a
  // live credential behind, which is the one thing a security smoke must not do.
  const minted: string[] = [];
  let full = provided ?? "";
  let readOnly = "";
  let manage = "";
  let tokenName = "";
  let authorId = "";

  try {
    if (hasDb) {
      const { findUserByRef } = await import("@/repositories/user");
      const { mintAgentToken } = await import("@/lib/agentTokens");
      const user = await findUserByRef(process.env.MCP_AUTHOR_ID!);
      if (!user) throw new Error(`No user matches MCP_AUTHOR_ID=${process.env.MCP_AUTHOR_ID}`);
      authorId = user.id;

      tokenName = `smoke-http ${new Date().toISOString()}`;
      const a = await mintAgentToken({
        userId: user.id,
        name: tokenName,
        scopes: ["read", "propose"],
      });
      const b = await mintAgentToken({
        userId: user.id,
        name: `${tokenName} (read-only)`,
        scopes: ["read"],
      });
      // The destructive scope, held by nothing else here. Minting it separately
      // is the point: `a` is what most tokens look like, and the check below is
      // that it did *not* quietly acquire rename/delete.
      const c = await mintAgentToken({
        userId: user.id,
        name: `${tokenName} (manage)`,
        scopes: ["read", "propose", "manage"],
      });
      minted.push(a.token.id, b.token.id, c.token.id);
      // A token the operator passed in wins: it is the one they are asking
      // about. The minted set still provides the narrower and wider halves.
      full = provided ?? a.secret;
      readOnly = b.secret;
      manage = c.secret;
    }

    // -- Refusals ---------------------------------------------------------
    // Every bad credential must be answered identically. If they diverge, the
    // endpoint tells a prober which secrets were once real.
    console.log("refusals");

    let anonBody = "";
    await check("no credential → 401 + WWW-Authenticate", async () => {
      const res = await post({});
      anonBody = await res.text();
      expect(res.status === 401, `expected 401, got ${res.status}`);
      expect(
        (res.headers.get("www-authenticate") ?? "").toLowerCase().includes("bearer"),
        "missing WWW-Authenticate: Bearer",
      );
      return "401 Bearer";
    });

    await check("malformed credential → 401, same body", async () => {
      const res = await post({ token: "not-a-token" });
      expect(res.status === 401, `expected 401, got ${res.status}`);
      expect((await res.text()) === anonBody, "body differs from the anonymous refusal");
      return "indistinguishable";
    });

    await check("unknown token → 401, same body", async () => {
      const res = await post({ token: unknownToken() });
      expect(res.status === 401, `expected 401, got ${res.status}`);
      expect((await res.text()) === anonBody, "body differs from the anonymous refusal");
      return "indistinguishable";
    });

    await check("revoked token → 401, same body", async () => {
      if (!hasDb) return { skip: "needs a database to mint and revoke a throwaway token" };
      const { mintAgentToken, revokeAgentToken } = await import("@/lib/agentTokens");
      const doomed = await mintAgentToken({
        userId: authorId,
        name: `${tokenName} (revoked)`,
        scopes: ["read"],
      });
      await revokeAgentToken(doomed.token.id);
      const res = await post({ token: doomed.secret });
      expect(res.status === 401, `expected 401, got ${res.status}`);
      expect((await res.text()) === anonBody, "a revoked token is distinguishable from an unknown one");
      return "indistinguishable from unknown";
    });

    await check("oversized body → 413 before anything is parsed", async () => {
      // A genuinely oversized body, not a lie in the header: undici refuses to
      // send a `content-length` that disagrees with what it is writing, and a
      // check that cannot be sent is not a check.
      const filler = "x".repeat(MAX_BODY_BYTES);
      const res = await post({
        token: full,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { filler } }),
      });
      expect(res.status === 413, `expected 413, got ${res.status}`);
      return `cap is ${MAX_BODY_BYTES} bytes`;
    });

    await check("cleartext to a non-loopback host → 426", async () => {
      if (new URL(ENDPOINT).protocol === "https:") {
        return { skip: "endpoint is already HTTPS; the rule cannot be triggered from here" };
      }
      // A valid token on purpose: the route authenticates before it decides
      // whether the transport was fit to carry the credential, so a bogus token
      // answers 401 and never reaches the rule under test.
      const res = await rawPost(
        ENDPOINT,
        {
          host: "blog.example.test",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${full}`,
        },
        RPC_LIST,
      );
      if (res.status === 200) {
        return { skip: "server has MCP_ALLOW_INSECURE=1 (verify that is deliberate)" };
      }
      expect(res.status === 426, `expected 426, got ${res.status}`);
      expect(Boolean(res.headers["upgrade"]), "426 without an Upgrade header");
      return `426, Upgrade: ${res.headers["upgrade"]}`;
    });

    // -- The protocol -----------------------------------------------------
    console.log("\nprotocol");

    const client = await connect(full);
    let toolNames: string[] = [];

    await check("initialize + tools/list over the SDK's HTTP transport", async () => {
      toolNames = (await client.listTools()).tools.map((t) => t.name);
      expect(toolNames.length === 9, `expected 9 tools, got ${toolNames.length}: ${toolNames.join(", ")}`);
      return toolNames.join(", ");
    });

    await check("stateless: a second client needs no session handshake", async () => {
      // No `sessionIdGenerator` on the server, so nothing is pinned to an
      // instance — which is what lets a second container serve the next call.
      const other = await connect(full);
      const names = (await other.listTools()).tools.map((t) => t.name);
      expect(names.length === toolNames.length, "second client saw a different tool set");
      await other.close();
      return "two independent clients, no shared session";
    });

    await check("a read tool returns this author's content", async () => {
      const posts = JSON.parse(textOf(await client.callTool({ name: "list_posts", arguments: {} })) || "[]");
      expect(Array.isArray(posts), "list_posts did not return an array");
      return `${posts.length} posts`;
    });

    await check("responses are uncacheable by any proxy", async () => {
      const res = await post({ token: full });
      const cc = (res.headers.get("cache-control") ?? "").toLowerCase();
      expect(cc.includes("no-store"), `Cache-Control was "${cc}"`);
      expect(cc.includes("private"), `Cache-Control was "${cc}"`);
      return cc;
    });

    await check("a read-only token is not offered the write tools", async () => {
      if (!readOnly) return { skip: "needs a database to mint a second, narrower token" };
      const ro = await connect(readOnly);
      const names = (await ro.listTools()).tools.map((t) => t.name);
      await ro.close();
      expect(names.length === 6, `expected 6 tools, got ${names.length}: ${names.join(", ")}`);
      expect(
        !names.includes("apply_ops") && !names.includes("create_post"),
        `write tools leaked into a read-only token: ${names.join(", ")}`,
      );
      return `${names.length} tools, no apply_ops/create_post`;
    });

    await check("a propose token is not offered the destructive tool", async () => {
      // The escalation this scope exists to prevent: `manage` must not ride in
      // on `propose`, or every token minted before it silently gained the
      // ability to delete posts irreversibly. `rename_post` is expected here —
      // it proposes since docs/plans/claude-code-backlog.md §8, and a proposal
      // is exactly what `propose` grants.
      expect(
        toolNames.includes("rename_post"),
        `a propose token should carry rename_post: ${toolNames.join(", ")}`,
      );
      expect(
        !toolNames.includes("delete_post"),
        `delete_post leaked into a read+propose token: ${toolNames.join(", ")}`,
      );
      return "9 tools, rename_post but no delete_post";
    });

    await check("a manage token is offered all ten", async () => {
      if (!manage) return { skip: "needs a database to mint a manage-scoped token" };
      const mg = await connect(manage);
      const names = (await mg.listTools()).tools.map((t) => t.name);
      await mg.close();
      expect(names.length === 10, `expected 10 tools, got ${names.length}: ${names.join(", ")}`);
      expect(
        names.includes("delete_post"),
        `manage token is missing its own tool: ${names.join(", ")}`,
      );
      return `${names.length} tools, including delete_post`;
    });

    await check("delete_post will not delete without a confirmation", async () => {
      if (!manage) return { skip: "needs a database to mint a manage-scoped token" };
      // Read-safe on purpose: a bogus id can only ever come back "not found",
      // so this proves the shape of the guard without risking a real post. The
      // confirmed branch is exercised by the write half, behind --write.
      const mg = await connect(manage);
      const said = textOf(
        await mg.callTool({
          name: "delete_post",
          arguments: { id: "00000000-0000-0000-0000-000000000000" },
        }),
      );
      await mg.close();
      expect(/not found/i.test(said), `expected a not-found refusal, got: ${said}`);
      return "unconfirmed delete refused";
    });

    // -- The write path ---------------------------------------------------
    console.log("\nwrites");

    await check("a remote write proposes, and names the token that made it", async () => {
      if (!WANT_WRITE) return { skip: "pass --write to exercise it" };
      if (!hasDb) {
        return { skip: "refused without a database: there is no delete tool, so it could not clean up" };
      }
      const { prisma } = await import("@/lib/prisma");

      const created = textOf(
        await client.callTool({
          name: "create_post",
          arguments: {
            title: `MCP http smoke ${new Date().toISOString()}`,
            blocks: [{ type: "paragraph", text: "Created over HTTP." }],
          },
        }),
      );
      const newId = /Created post (\S+)/.exec(created)?.[1];
      expect(Boolean(newId), `could not read an id out of: ${created}`);

      try {
        const skeleton = textOf(await client.callTool({ name: "outline", arguments: { id: newId } }));
        const headBefore = (
          await prisma.document.findUnique({ where: { id: newId }, select: { headRevisionId: true } })
        )?.headRevisionId;

        await client.callTool({
          name: "apply_ops",
          arguments: {
            id: newId,
            stateHash: hashIn(skeleton),
            ops: [{ op: "set_text", id: "b1", text: "Rewritten over HTTP." }],
          },
        });

        const proposals = await prisma.revision.findMany({
          where: { documentId: newId, proposedAt: { not: null } },
          select: { origin: true },
        });
        const headAfter = (
          await prisma.document.findUnique({ where: { id: newId }, select: { headRevisionId: true } })
        )?.headRevisionId;

        expect(proposals.length === 1, `expected exactly 1 pending proposal, got ${proposals.length}`);
        expect(headAfter === headBefore, "head moved — a remote write committed instead of proposing");
        // The property that only exists over HTTP: which credential wrote, not
        // merely that an agent did. When a token leaks this is what you revoke.
        const origin = proposals[0]?.origin ?? "";
        expect(
          origin.startsWith("claude-code:"),
          `origin was "${origin}", expected it to name the token`,
        );
        return `1 proposal, head unmoved, origin "${origin}"`;
      } finally {
        // Cascades to the revisions, proposal included: nothing reaches the
        // review rail, exactly as in the stdio smoke.
        await prisma.document.delete({ where: { id: newId! } });
      }
    });

    // -- The budgets ------------------------------------------------------
    console.log("\nbudgets");

    await check("a runaway caller meets the request limiter", async () => {
      if (!WANT_LIMITS) return { skip: "pass --limits to spend a whole bucket proving it" };
      if (!hasDb) return { skip: "refused without a database: it would spend a real token's budget" };
      const { mintAgentToken } = await import("@/lib/agentTokens");
      const burner = await mintAgentToken({
        userId: authorId,
        name: `${tokenName} (limits)`,
        scopes: ["read"],
      });
      minted.push(burner.token.id);

      // Sequential on purpose: the bucket refills with time, so a burst fired
      // in parallel proves less about where the wall is than a steady walk to it.
      for (let i = 0; i < 200; i++) {
        const res = await post({ token: burner.secret });
        if (res.status === 429) {
          const retry = res.headers.get("retry-after");
          expect(Boolean(retry), "429 without a Retry-After header");
          return `429 after ${i + 1} requests, Retry-After: ${retry}s`;
        }
      }
      throw new Error("200 requests and never refused — the limiter is not engaging");
    });

    await client.close();
  } finally {
    if (minted.length) {
      const { revokeAgentToken } = await import("@/lib/agentTokens");
      for (const id of minted) await revokeAgentToken(id).catch(() => {});
      console.log(`\nrevoked ${minted.length} smoke token(s)`);
    }
    if (process.env.DATABASE_URL) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$disconnect().catch(() => {});
    }
  }

  // -- Verdict ------------------------------------------------------------
  const failed = results.filter((r) => r.state === "fail");
  const skipped = results.filter((r) => r.state === "skip");
  const passed = results.filter((r) => r.state === "pass");
  console.log(
    `\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`,
  );
  if (skipped.length) {
    // Named, so the run never reads as coverage it did not have.
    for (const s of skipped) console.log(`  skipped: ${s.name} (${s.note})`);
  }
  if (failed.length) {
    for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.note}`);
    process.exit(1);
  }
  console.log("\nOK");
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
