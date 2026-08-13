# Editing blog content from Claude Code

Claude Code can navigate, read, write and create posts in this blog directly,
through an MCP server that exposes the Prisma/Lexical content as tools. There
are two ways to reach it:

- **[Local](#local-stdio)** — a stdio process next to the database. Needs the
  repo and `.env`. This is the one to use on the machine you develop on.
- **[Remote](#remote-httpapimcp)** — `POST /api/mcp` on the deployed blog,
  authenticated by an agent token. Needs nothing but a URL and a secret.

Same eight tools either way; the difference is only how the process is reached
and who it decides you are.

**This page is setup and caveats only.** How to drive the tools — block
addressing, the outline → read → write loop, the authorable block types, the
inline markup, what each refusal means — lives in the tool descriptions in
`src/lib/mcp/server.ts`, which are in the agent's context whenever the server is
connected. Documenting it twice here would only give it somewhere to rot. For
_why_ content is addressed by block rather than by Markdown, see
[mcp/README.md](../../mcp/README.md) and
[docs/plans/claude-code-lexical.md](../plans/claude-code-lexical.md); for how
the remote door is built, [docs/plans/mcp_support.md](../plans/mcp_support.md).

---

## Local (stdio)

### 1. A working database

The server talks straight to Postgres — no dev server, no HTTP API. You need
`DATABASE_URL` in `.env` and a database that is actually up. Check what is
already on 5432 before starting anything (see CLAUDE.md):

```bash
docker ps
pg_isready -h localhost -p 5432
```

### 2. Name the author

Everything is scoped to one user. Set `MCP_AUTHOR_ID` in `.mcp.json` at the repo
root — a `User` id or an email:

```jsonc
{
  "mcpServers": {
    "blog-content": {
      "command": "node",
      "args": ["--import", "tsx", "--env-file=.env", "mcp/content-server.ts"],
      "env": { "MCP_AUTHOR_ID": "you@example.com" }
    }
  }
}
```

Find yours with `npx prisma studio` if you are not sure.

The server never reads or writes another author's content: every query is
filtered on `authorId`, and no tool takes an author from its arguments. That is
the whole authorization model here — the process is trusted because starting it
requires `.env` and a shell on the machine.

### 3. Start Claude Code from the repo root

`.mcp.json` is picked up per project directory, so launch `claude` from
`/…/blog-simple`. On first run it asks you to approve the server. Afterwards
`/mcp` should list **blog-content** as connected, with eight tools. If it
doesn't, run the server by hand to see the error — a missing `DATABASE_URL` or
an `MCP_AUTHOR_ID` matching no user both fail at startup, before the transport
connects:

```bash
npm run mcp:server
```

### 4. Verify end to end (optional)

```bash
export MCP_AUTHOR_ID=you@example.com   # lives in .mcp.json, not .env
npm run mcp:smoke                      # read-only
RUN_WRITE=1 npm run mcp:smoke          # also creates a throwaway post and edits it
```

The write path only touches the post it just created, and deletes it before
returning. It also exercises the stale-`stateHash` refusal, which is the guard
everything else rests on — it prints the refusal rather than failing on it, so
read the output.

---

## Remote (`POST /api/mcp`)

For a machine that has no checkout and no database access. The endpoint runs
inside the deployed app, so there is nothing to install.

### 1. Mint a token

On the server, or anywhere with `DATABASE_URL`:

```bash
npm run mcp:token -- mint you@example.com --name laptop
```

The secret prints **once** and is not recoverable — only its SHA-256 is stored.
Mint one per machine or job (`laptop`, `ci`): they are independently revocable,
which is the point of having more than one.

Two flags worth knowing:

- `--scopes read` mints a token that cannot write. The server then does not
  register `apply_ops` or `create_post` at all, so an agent holding it sees six
  tools rather than eight and plans around the limit instead of discovering it
  through a refusal.
- `--expires 90d` (also `12h`, `30m`). Omit for a token that does not expire.

`list` and `revoke` are the other two subcommands:

```bash
npm run mcp:token -- list you@example.com
npm run mcp:token -- revoke <token-id>
```

Revoking keeps the row. Its last-used time is the evidence of what a leaked
credential did, and deleting destroys that.

### 2. Register it

```bash
claude mcp add --transport http blog-content https://your-blog.example/api/mcp \
  --header "Authorization: Bearer blog_pat_…"
```

**Do not pass `--scope project`.** That writes `.mcp.json` in the repo, which is
committed — the secret would go with it. The default (`local`) stores the entry
in your own config, and `--scope user` does the same across every project.

Then `/mcp` should list **blog-content** with its eight (or six) tools.

### 3. It must be HTTPS

The endpoint answers **426 Upgrade Required** to a token sent over plain HTTP to
anything but a loopback address. A bearer token is replayed on every request and
does not expire when a browser closes, so cleartext hands it to anything on the
path.

If your transport is already private in a way the server cannot see — an ssh
tunnel, Tailscale, a proxy that forwards under a header it does not know — set
`MCP_ALLOW_INSECURE=1` on the server. Do not set it on a public deployment;
that publishes the credential.

### 4. What it costs you

Each token has three budgets, and they refill continuously:

| | Burst | Sustained |
| --- | --- | --- |
| Requests | 90 | 180/min |
| Reads | 60 | 120/min |
| Writes | 10 | 20/min |

An ordinary editing session is nowhere near these — the numbers are set to be
invisible to real use and immediate for a loop. Exceeding the request budget is
an HTTP 429 with `Retry-After`; exceeding a read or write budget is a tool error
naming the wait. Bodies are capped at 1 MiB.

**If a legitimate session ever trips a limit, that is a bug** — say so, and the
numbers get revised (see `src/lib/mcp/limits.ts`).

### 5. Verifying an install

`npm run mcp:smoke:http` drives the endpoint through the same SDK client Claude
Code uses, and checks the half that only exists over HTTP: that every bad
credential is refused identically, that a read-only token is offered six tools
rather than eight, that cleartext is answered 426, that the body cap and the
budgets engage, and that a write proposes rather than commits under the name of
the token that made it. It exits non-zero on failure, so it works as a
post-deploy check.

```bash
# Locally: mints the tokens it needs and revokes them on the way out.
MCP_AUTHOR_ID=you@example.com npm run mcp:smoke:http

# Against a deployment you have no database access to.
BLOG_MCP_TOKEN=blog_pat_… npm run mcp:smoke:http -- https://your-blog/api/mcp
```

Checks it could not make are listed by name at the end rather than passed over,
so the summary never reads as coverage it did not have. Without a database it
skips the two that need to mint a second token; `--write` and `--limits` are
opt-in, the first because there is no delete tool to clean up with (it refuses
without a database for that reason) and the second because proving a limiter
works costs a whole bucket of requests.

---

## Caveats the tools cannot state themselves

**Only cloud content is visible.** The server reads Postgres. Documents living
in browser IndexedDB — anything created while signed out — never reach it. Those
are reachable only from the in-app Copilot, which runs the same bridge
client-side.

**Careful with a post open in the editor.** `apply_ops` writes a pending
proposal, and the `stateHash` guard covers only the state the agent read — it
cannot see a browser tab holding older content, which can autosave over the
document and leave the proposal unapprovable. Reload the editor after an agent
edit rather than leaving both live.

**Attachments cannot be uploaded.** An `attachment` block can only reference a
URL that already exists.

**Posts can be created but not deleted**, by design — one you regret has to be
removed from the app. Creates land unpublished; publish from the app.

**A remote write says which token made it.** The review rail shows
"Claude Code (laptop)" rather than just "Claude Code", so a proposal you did not
expect names the credential to revoke. A local stdio write is just
"Claude Code" — there is no token to name.

---

## Where the code is

| Path | What |
| --- | --- |
| `src/lib/mcp/server.ts` | The eight tools, with no transport — one factory both entry points build |
| `mcp/content-server.ts` | The stdio entry: resolve `MCP_AUTHOR_ID`, connect stdio |
| `src/app/api/mcp/route.ts` | The HTTP entry: token auth, budgets, TLS check |
| `src/lib/agentTokens.ts` | Mint, verify, revoke; `prisma/scripts/agent-token.ts` is the CLI |
| `src/lib/content-bridge/` | Addressing, codecs, ops applier, `stateHash` — pure JSON, no DOM |
| `src/editor/utils/copilotAgentExecutors.ts` | The same bridge, driving the in-app Copilot |

The bridge is covered by `src/lib/content-bridge/__tests__/` and needs no
database. The server, the token lifecycle, the route wrapper and the rate
limiter all have specs under `src/lib/**/__tests__/`; `npm run mcp:smoke` is
what covers the stdio path against a real database, and
`npm run mcp:smoke:http` the HTTP one against a running server — see
[verifying an install](#5-verifying-an-install).
