# Editing blog content from Claude Code

Claude Code can navigate, read, write and create posts in this blog directly,
through an MCP server that exposes the Prisma/Lexical content as tools. Ask it
to "fix the second paragraph of my Kalman filter post" and it does, in the
terminal, with no copy-paste through a browser.

## Which one do you want?

Two ways in. Same tools either way — up to ten, depending on scope — the only
difference is how the process is reached and how it decides who you are.

| | **[Local](#local-stdio)** | **[Remote](#remote-httpapimcp)** |
| --- | --- | --- |
| Use it when | you have this repo checked out | you have a login on a deployed blog and nothing else |
| You need | `.env` with `DATABASE_URL`, a database that is up | the blog's URL and an agent token |
| Reaches | Postgres, directly | `POST /api/mcp` on the running app |
| You are | whoever `MCP_AUTHOR_ID` names | whoever owns the token |
| To set up | edit `.env`, start `claude` in the repo | one `claude mcp add`, no checkout |
| Get a token from | — | whoever runs the blog; **there is no self-serve UI yet** |

If you are reading this because you develop the blog, you want **local**. If you
want to write posts from a laptop that has never seen the source, you want
**remote**, and your first move is to ask for a token — you cannot mint your own
without database access.

### The 30-second version

```bash
# Local — from the repo root
echo 'MCP_AUTHOR_ID="you@example.com"' >> .env   # the email you sign in with
claude                                            # approve blog-content, then /mcp

# Remote — from anywhere
claude mcp add --transport http blog-content https://your-blog.example/api/mcp \
  --header "Authorization: Bearer blog_pat_…"     # NOT --scope project
```

Either way, `/mcp` should then list **blog-content** as connected with ten
tools locally (six for a read-only token, eight for an ordinary remote one). If it doesn't,
[the table at the bottom](#when-it-does-not-connect) has the ways it usually
fails, and what each one means.

**This page is setup and caveats only.** How to drive the tools — block
addressing, the outline → read → write loop, the authorable block types, the
inline markup, what each refusal means — lives in the tool descriptions in
`src/lib/mcp/server.ts`, which are in the agent's context whenever the server is
connected. Documenting it twice here would only give it somewhere to rot. For
_why_ content is addressed by block rather than by Markdown, see
[mcp/README.md](../../mcp/README.md) and
[docs/plans/archive/claude-code-lexical.md](../plans/archive/claude-code-lexical.md); for how
the remote door is built, [docs/plans/archive/mcp-support.md](../plans/archive/mcp-support.md).

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

Everything is scoped to one user. Put `MCP_AUTHOR_ID` in `.env` next to
`DATABASE_URL` — a `User` id, or the email you sign in with:

```bash
MCP_AUTHOR_ID="you@example.com"
```

Find yours with `npx prisma studio` if you are not sure.

**It goes in `.env`, not in `.mcp.json`.** `.mcp.json` is committed, so an author
written there is one person's identity imposed on everyone who clones — and it
was, until the file was emptied of it. `.env` is gitignored, is already the file
you filled in to get the app running, and is loaded by the server's
`--env-file=.env`, so nothing else has to be exported by hand: `npm run
mcp:server`, `npm run mcp:smoke` and `npm run mcp:smoke:http` all pick it up from
there. Registration itself carries no per-machine values at all now:

```jsonc
{
  "mcpServers": {
    "blog-content": {
      "command": "node",
      "args": ["--import", "tsx", "--env-file=.env", "mcp/content-server.ts"]
    }
  }
}
```

The server never reads or writes another author's content: every query is
filtered on `authorId`, and no tool takes an author from its arguments. That is
the whole authorization model here — the process is trusted because starting it
requires `.env` and a shell on the machine.

### 3. Start Claude Code from the repo root

`.mcp.json` is picked up per project directory, so launch `claude` from
`/…/blog-simple`. On first run it asks you to approve the server. Afterwards
`/mcp` should list **blog-content** as connected, with ten tools. If it
doesn't, run the server by hand to see the error — a missing `DATABASE_URL` or
an `MCP_AUTHOR_ID` matching no user both fail at startup, before the transport
connects:

```bash
npm run mcp:server
```

### 4. Verify end to end (optional)

```bash
npm run mcp:smoke              # read-only
RUN_WRITE=1 npm run mcp:smoke  # also creates a throwaway post and edits it
```

The write path only touches the post it just created, and deletes it before
returning. It also exercises the stale-`stateHash` refusal, which is the guard
everything else rests on — it prints the refusal rather than failing on it, so
read the output.

---

## Remote (`POST /api/mcp`)

For a machine that has no checkout and no database access. The endpoint runs
inside the deployed app, so there is nothing to install.

**Step 1 is not something you can do yourself.** Minting a token needs
`DATABASE_URL` and a shell where the app runs — there is no settings screen and
no route that issues one, deliberately for now (see
[the CLI's own header](../../prisma/scripts/agent-token.ts) and
[mcp-support.md §8.5](../plans/archive/mcp-support.md), which asks whether a public
deployment can ship without a management UI). So if the blog is not yours: sign
in to it once through OAuth first — a token is minted against a `User` row, and
signing in is what creates yours — then ask its operator for a token named after
your machine, and skip to [step 2](#2-register-it). If the blog is yours, read
on.

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
  register `apply_ops`, `create_post` or `rename_post` at all, so an agent
  holding it sees six tools rather than nine and plans around the limit instead
  of discovering it through a refusal.
- `--scopes read,propose,manage` is the only way to get `delete_post`, which is
  why it is spelled out rather than defaulted. Every other write an agent can
  make is reviewable — a proposal you decline, a draft you discard, a title you
  approve or refuse. A delete is not: it lands on the live post and takes its
  revision history with it. The default (`read,propose`) is the one to want
  unless you specifically need a terminal that can tidy your library.
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

Then `/mcp` should list **blog-content** with its eight tools (six for
`--scopes read`, ten if you granted `manage`).

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
rather than eight and an ordinary one is *not* offered the two destructive ones,
that cleartext is answered 426, that the body cap and the
budgets engage, and that a write proposes rather than commits under the name of
the token that made it. It exits non-zero on failure, so it works as a
post-deploy check.

```bash
# Locally: mints the tokens it needs and revokes them on the way out.
npm run mcp:smoke:http

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

**Creates land unpublished**; publish from the app.

**`delete_post` is the one write that is not a proposal.** Everything else an
agent does here is reviewable — a proposal you approve or decline, a draft you
accept or discard, a title you approve or refuse. A delete takes effect on the
live post the moment it is called, and it is final: `Document` has no
`deletedAt` and there is no trash table, so the post and its whole revision
history go together. Child tabs survive, promoted to top level; forks survive,
losing the link back.

Two things keep that honest, and neither is a substitute for reading what you
are about to approve:

- It needs the `manage` scope, which no default grants — locally you have it
  (the credential is your operating system); remotely you must have minted the
  token with `--scopes read,propose,manage`.
- `delete_post` refuses unless it is passed the post's exact title as `confirm`.
  Called without one it deletes nothing and reports what would go, so the agent
  has to echo back a title it was shown. That is aimed at the realistic failure —
  reading a list and acting on the id next to the one you meant — not at an
  agent that has decided to be destructive.

**A remote write says which token made it.** The review rail shows
"Claude Code (laptop)" rather than just "Claude Code", so a proposal you did not
expect names the credential to revoke. A local stdio write is just
"Claude Code" — there is no token to name.

---

## When it does not connect

`/mcp` is the first place to look; `claude mcp list` reports a server that
failed to start, and a missing `${VAR}` in a config, by name.

| What you see | What it is |
| --- | --- |
| `blog-content` absent entirely | you started `claude` outside the repo root — `.mcp.json` is per project directory — or you registered remotely and it went to a different project's local scope |
| Fails at startup, local | run `npm run mcp:server` by hand: an absent `DATABASE_URL`, a database that is not up, and an `MCP_AUTHOR_ID` matching no user each print their own error and exit before the transport connects |
| `MCP_AUTHOR_ID is required` | it is unset in `.env` — the server reads it from there via `--env-file=.env`, and no longer from `.mcp.json` |
| 401 on every call, remote | the token is unknown, revoked, or expired. All three are answered identically on purpose, so the endpoint cannot be used to test which secrets were once real — check with `npm run mcp:token -- list you@example.com`, which names the state |
| 426 Upgrade Required | the endpoint was reached over plain HTTP on a non-loopback host. Use HTTPS; see [§3](#3-it-must-be-https) |
| Six tools instead of nine | a `--scopes read` token. `apply_ops`, `create_post` and `rename_post` are not registered at all rather than refusing later |
| No `delete_post` | the token lacks `manage`, which no default grants. Mint one with `--scopes read,propose,manage`, and read [the flag](#2-mint-a-token) before you do |
| 429, or a tool error naming a wait | you hit a [budget](#4-what-it-costs-you). In an ordinary editing session this is a bug — say so |

Beyond that, `npm run mcp:smoke` (local) and `npm run mcp:smoke:http` (remote)
exercise the same paths Claude Code takes and print where they stop.

---

## Where the code is

| Path | What |
| --- | --- |
| `src/lib/mcp/server.ts` | The ten tools, with no transport — one factory both entry points build |
| `mcp/content-server.ts` | The stdio entry: resolve `MCP_AUTHOR_ID`, connect stdio |
| `src/app/api/mcp/route.ts` | The HTTP entry: token auth, budgets, TLS check |
| `src/lib/agentTokens.ts` | Mint, verify, revoke; `prisma/scripts/agent-token.ts` is the CLI |
| `src/lib/content-bridge/` | Addressing, codecs, ops applier, `stateHash` — pure JSON, no DOM |
| `packages/editor/src/utils/copilotAgentExecutors.ts` | The same bridge, driving the in-app Copilot |

The bridge is covered by `src/lib/content-bridge/__tests__/` and needs no
database. The server, the token lifecycle, the route wrapper and the rate
limiter all have specs under `src/lib/**/__tests__/`; `npm run mcp:smoke` is
what covers the stdio path against a real database, and
`npm run mcp:smoke:http` the HTTP one against a running server — see
[verifying an install](#5-verifying-an-install).
