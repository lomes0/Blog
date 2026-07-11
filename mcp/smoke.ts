// End-to-end smoke test: spawn the MCP server (as .mcp.json would) and exercise
// the tools against the live DB. Read-only unless RUN_WRITE=1.
// Run: node --import tsx mcp/smoke.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const textOf = (r: any) => r.content?.map((c: any) => c.text).join("\n") ?? "";

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [
      "--import", "tsx",
      "--import", "./mcp/bootstrap.mjs",
      "--env-file=.env",
      "mcp/content-server.ts",
    ],
    env: { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);

  console.log("=== tools ===");
  console.log((await client.listTools()).tools.map((t) => t.name).join(", "));

  console.log("\n=== list_posts ===");
  const posts = await client.callTool({ name: "list_posts", arguments: {} });
  const list = JSON.parse(textOf(posts) || "[]");
  console.log(`count: ${list.length}`);
  console.log(list.slice(0, 3));

  if (list[0]) {
    console.log("\n=== read_post (first) ===");
    const rp = await client.callTool({
      name: "read_post",
      arguments: { id: list[0].id },
    });
    console.log(textOf(rp).slice(0, 500));
  }

  console.log("\n=== list_series ===");
  console.log(textOf(await client.callTool({ name: "list_series", arguments: {} })).slice(0, 400));

  await client.close();
  console.log("\nOK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
