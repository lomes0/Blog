// End-to-end smoke test: spawn the MCP server (as .mcp.json would) and exercise
// the tools against the live DB. Read-only unless RUN_WRITE=1.
//
// The write path, when enabled, creates a post and edits it by block — it never
// touches content you already had.
//
// Run: npm run mcp:smoke
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface ToolResult {
  content?: Array<{ text?: string }>;
  isError?: boolean;
}

const textOf = (r: unknown): string =>
  (r as ToolResult).content?.map((c) => c.text ?? "").join("\n") ?? "";

const hashIn = (s: string): string => /stateHash:\s*(\S+)/.exec(s)?.[1] ?? "";

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
      const skeleton = textOf(await call("outline", { id: newId }));
      console.log("\n=== outline of the new post ===");
      console.log(skeleton);

      console.log("\n=== apply_ops (edit b2) ===");
      console.log(
        textOf(
          await call("apply_ops", {
            id: newId,
            stateHash: hashIn(skeleton),
            ops: [{ op: "set_text", id: "b2", text: "Rewritten by ==apply_ops==." }],
          }),
        ),
      );

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
    }
  }

  await client.close();
  console.log("\nOK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
