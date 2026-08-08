/**
 * Mint, list and revoke agent tokens — the credentials that will let an agent
 * reach one user's content over HTTP (docs/plans/mcp_support.md phase 2).
 *
 *   npm run mcp:token -- mint you@example.com --name laptop
 *   npm run mcp:token -- mint you@example.com --name ci --scopes read --expires 90d
 *   npm run mcp:token -- list you@example.com
 *   npm run mcp:token -- revoke <token-id>
 *
 * A script rather than a UI, deliberately and for now: the admin story for this
 * app is already psql-only (no route sets `role` or `disabled` either), and a
 * management screen is a phase of its own — see mcp_support.md §8.5, which asks
 * whether a public deployment can ship without one. It cannot ship without
 * *revocation*, which is why that is here from the start rather than left until
 * a token leaks.
 *
 * The secret prints once. There is no command to show it again, because only
 * its hash is stored.
 */
import {
  AGENT_SCOPES,
  type AgentScope,
  isAgentScope,
  listAgentTokens,
  mintAgentToken,
  revokeAgentToken,
  tokenState,
} from "../../src/lib/agentTokens.ts";
import { findUserByRef } from "../../src/repositories/user.ts";

const die = (message: string): never => {
  console.error(message);
  process.exit(1);
};

/** `--name laptop` / `--scopes read,propose` / `--expires 90d`. */
function flag(argv: string[], name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

/** `90d`, `12h`, `30m` — or nothing, for a token that does not expire. */
function parseDuration(spec: string): Date {
  const match = /^(\d+)([mhd])$/.exec(spec);
  if (!match) die(`--expires wants something like 90d, 12h or 30m; got "${spec}"`);
  const [, amount, unit] = match!;
  const ms = { m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]! * Number(amount);
  return new Date(Date.now() + ms);
}

async function userIdFor(ref: string | undefined): Promise<string> {
  if (!ref) die("Name a user: an id or an email.");
  const user = await findUserByRef(ref!);
  if (!user) die(`No user matches "${ref}".`);
  return user!.id;
}

async function mint(argv: string[]) {
  const userId = await userIdFor(argv[0]);
  const name = flag(argv, "name");
  if (!name) die("--name is required: what is this token for? e.g. --name laptop");

  const scopeSpec = flag(argv, "scopes") ?? "read,propose";
  const scopes = scopeSpec.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = scopes.filter((s) => !isAgentScope(s));
  if (bad.length) {
    die(`Unknown scope(s): ${bad.join(", ")}. Known: ${AGENT_SCOPES.join(", ")}`);
  }

  const expiresSpec = flag(argv, "expires");
  const expiresAt = expiresSpec ? parseDuration(expiresSpec) : null;

  const { secret, token } = await mintAgentToken({
    userId,
    name: name!,
    scopes: scopes as AgentScope[],
    expiresAt,
  });

  console.log(`\nToken ${token.id} ("${token.name}")`);
  console.log(`scopes:  ${token.scopes.join(", ")}`);
  console.log(`expires: ${token.expiresAt?.toISOString() ?? "never"}`);
  console.log("\nThe secret is shown once and is not recoverable:\n");
  console.log(`  ${secret}\n`);
  console.log("Register it with Claude Code, e.g.");
  console.log(
    `  claude mcp add --transport http blog-content https://your-blog/api/mcp \\\n` +
      `    --header "Authorization: Bearer ${secret}"\n`,
  );
  // A secret in a checked-in .mcp.json is the mistake this whole scheme would
  // be embarrassed by, so say it here rather than only in the guide.
  console.log(
    "Keep it out of the repo's .mcp.json — that file is committed. Use\n" +
      "--scope user, or an ${BLOG_MCP_TOKEN} indirection.\n",
  );
}

async function list(argv: string[]) {
  const userId = await userIdFor(argv[0]);
  const tokens = await listAgentTokens(userId);
  if (!tokens.length) {
    console.log("No tokens.");
    return;
  }
  const now = new Date();
  for (const token of tokens) {
    const state = tokenState(token, now);
    console.log(
      `${token.id}  ${state.padEnd(7)}  ${token.scopes.join("+").padEnd(13)}  ` +
        `last used ${token.lastUsedAt?.toISOString() ?? "never"}  ${token.name}`,
    );
  }
}

async function revoke(argv: string[]) {
  const id = argv[0];
  if (!id) die("Which token? Pass an id from `list`.");
  const token = await revokeAgentToken(id!);
  if (!token) die(`No token with id "${id}".`);
  console.log(
    `Revoked ${token!.id} ("${token!.name}") at ` +
      `${token!.revokedAt?.toISOString()}. The row is kept: its last-used time ` +
      `is the evidence of what the credential did.`,
  );
}

const [command, ...argv] = process.argv.slice(2);
const commands: Record<string, (argv: string[]) => Promise<void>> = {
  mint,
  list,
  revoke,
};

const run = commands[command ?? ""];
if (!run) {
  die(
    `Usage: npm run mcp:token -- <mint|list|revoke> …\n` +
      `  mint <user> --name <label> [--scopes read,propose] [--expires 90d]\n` +
      `  list <user>\n` +
      `  revoke <token-id>`,
  );
}

run!(argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
