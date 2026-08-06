// End-to-end smoke test: spawn the MCP server (as .mcp.json would) and exercise
// the tools against the live DB. Read-only unless RUN_WRITE=1.
//
// The write path, when enabled, creates a post and edits it by block — it never
// touches content you already had, and it deletes what it made before it
// returns. That last part is not tidiness: under agent gating an `apply_ops`
// leaves a *pending proposal*, which is a row the app is meant to show you and
// ask you about, and there is at most one per document. A smoke run that left
// them behind would fill the review rail with test litter
// (docs/plans/agent-gating.md §3.8).
//
// Run: npm run mcp:smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { prisma } from "@/lib/prisma";

interface ToolResult {
  content?: Array<{ text?: string }>;
  isError?: boolean;
}

const textOf = (r: unknown): string =>
  (r as ToolResult).content?.map((c) => c.text ?? "").join("\n") ?? "";

const hashIn = (s: string): string => /stateHash:\s*(\S+)/.exec(s)?.[1] ?? "";

/** Read `head` directly — the tools deliberately never move it, so assert it. */
const headOf = async (id: string) =>
  (await prisma.document.findUnique({ where: { id }, select: { head: true } }))
    ?.head ?? null;

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--import", "tsx", "--env-file=.env", "mcp/content-server.ts"],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const call = (name: string, args: Record<string, unknown> = {}) =>
    client.callTool({ name, arguments: args });

  console.log("=== tools ===");
  console.log((await client.listTools()).tools.map((t) => t.name).join(", "));

  console.log("\n=== list_posts ===");
  const list = JSON.parse(textOf(await call("list_posts")) || "[]");
  console.log(`count: ${list.length}`);

  if (list[0]) {
    console.log("\n=== outline (most recent) ===");
    const skeleton = textOf(await call("outline", { id: list[0].id }));
    console.log(skeleton.slice(0, 1200));

    const first = /^(b[\d.]+)\s/m.exec(skeleton)?.[1];
    if (first) {
      console.log(`\n=== read_blocks (${first}) ===`);
      console.log(textOf(await call("read_blocks", { id: list[0].id, blocks: [first] })).slice(0, 600));
    }
  }

  console.log("\n=== search ===");
  console.log(textOf(await call("search", { query: "the", limit: 3 })).slice(0, 600));

  if (process.env.RUN_WRITE === "1") {
    console.log("\n=== create_post (write) ===");
    const created = textOf(
      await call("create_post", {
        title: `MCP smoke ${new Date().toISOString()}`,
        blocks: [
          { type: "heading", level: 1, text: "Smoke test" },
          { type: "paragraph", text: "Created with **bold** and __italic__ and `code`." },
          { type: "code", language: "ts", code: "const x = 1;" },
          { type: "list", listType: "check", items: [{ text: "first", checked: true }] },
        ],
      }),
    );
    console.log(created);

    const newId = /Created post (\S+)/.exec(created)?.[1];
    if (newId) {
      try {
        const skeleton = textOf(await call("outline", { id: newId }));
        console.log("\n=== outline of the new post ===");
        console.log(skeleton);

        const headBefore = await headOf(newId);

        console.log("\n=== apply_ops (edit b2) — proposes, does not save ===");
        const first = textOf(
          await call("apply_ops", {
            id: newId,
            stateHash: hashIn(skeleton),
            ops: [{ op: "set_text", id: "b2", text: "Rewritten by ==apply_ops==." }],
          }),
        );
        console.log(first);

        console.log("\n=== apply_ops with a stale hash (must refuse) ===");
        console.log(
          textOf(
            await call("apply_ops", {
              id: newId,
              stateHash: hashIn(skeleton),
              ops: [{ op: "set_text", id: "b2", text: "should not apply" }],
            }),
          ),
        );

        // The squash: a second batch reads the *proposal* (so its hash is the
        // one the first batch returned) and folds into the same row.
        console.log("\n=== apply_ops again — squashes into the same proposal ===");
        console.log(
          textOf(
            await call("apply_ops", {
              id: newId,
              stateHash: hashIn(first),
              ops: [{ op: "set_text", id: "b1", text: "Smoke test, rewritten" }],
            }),
          ),
        );

        console.log("\n=== what is in storage ===");
        const proposals = await prisma.revision.findMany({
          where: { documentId: newId, proposedAt: { not: null } },
          select: { id: true, baseRevisionId: true, version: true, ops: true },
        });
        console.log(
          `pending proposals: ${proposals.length} ` +
            `(version ${proposals[0]?.version}, ` +
            `${(proposals[0]?.ops as unknown[] | null)?.length ?? 0} ops folded)`,
        );
        console.log(
          `head: ${await headOf(newId)} — was ${headBefore}` +
            `${(await headOf(newId)) === headBefore ? " (unmoved)" : " (MOVED!)"}`,
        );
        console.log(
          `baseRevisionId: ${proposals[0]?.baseRevisionId} — ` +
            `${proposals[0]?.baseRevisionId === headBefore ? "the head the first batch read" : "WRONG"}`,
        );
      } finally {
        // Whatever happened above, take it back out. Deleting the document
        // cascades to its revisions, proposal included — nothing is left in the
        // review rail, and nothing is left flagged agent-created.
        await prisma.document.delete({ where: { id: newId } });
        console.log(`\ncleaned up post ${newId}`);
      }
    }
  }

  await client.close();
  await prisma.$disconnect();
  console.log("\nOK");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
