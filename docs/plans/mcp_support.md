# Remote MCP support

**Status: phases 1–4 shipped (8 Aug 2026); phases 5–6 proposed.** The endpoint
works and is metered. Before pointing it at the public internet, phase 5 still
owes it TLS enforcement — a bearer token over plain HTTP is the credential in
cleartext. Originally
measured against the tree at `b01e91a5`. Builds on the
content bridge ([claude-code-lexical.md](./claude-code-lexical.md), phases 1–5
shipped) and the proposal gating ([agent-gating.md](./agent-gating.md), phases
1–5 shipped). Nothing in `src/lib/content-bridge/` changes, and none of the
eight tool handlers change.

Today `mcp/content-server.ts` is a stdio process that must run next to the
database, on a machine holding `.env`. This plan makes the same eight tools
reachable over HTTP from any machine, addressed by URL and authenticated by a
token, at production quality — which here means the endpoint can survive being
on the public internet.

## 1. The insight

The server is already written for this. Every one of the eight tools takes its
author from `getAuthorId()` (`mcp/content-server.ts:61`) and filters every query
on it; not one of them reads `process.env` directly, and not one trusts an id
that arrives in its arguments. The authorization model is already "whatever
`getAuthorId()` returns is the only content that exists."

```
today     env MCP_AUTHOR_ID ──► getAuthorId() ──► 8 handlers ──► stdio

remote    Authorization: Bearer ──► getAuthorId() ──► 8 handlers ──► HTTP
                                    (same function, different source)
```

So the work is **not** in the tools. It is in three places the tools never
touch: where the author id comes from, how the process is spoken to, and what
stops a stranger doing it a million times. That is the whole plan.

The single-user scoping is not a limitation to be lifted here. It is the reason
this is tractable: a token names exactly one user, and the blast radius of a
leaked token is that user's own posts, in an app where an agent write is already
a proposal rather than a commit.

## 2. What this is measured against

**Doing nothing already works**, and the plan is only worth executing if it
beats this:

```bash
claude mcp add blog-content -- ssh you@blog 'cd /srv/blog && npm run mcp:server'
```

stdio over ssh, zero code, and the auth boundary is ssh — a stronger one than
anything below. It requires the repo deployed with `node_modules`, key-based
non-interactive ssh, and a shell account per person who wants it.

This plan wins on exactly three things: it works from a machine with no repo and
no shell account; the credential is revocable per-agent without touching
`authorized_keys`; and it is scoped (a read-only token is expressible, an ssh
login is not). If none of those matter to you, stop here and use the ssh line.

## 3. What already exists

| Asset                         | Where                                                                    | What it gives us                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Author-parameterised handlers | all 8 `server.registerTool` calls                                        | The tools need no edit at all                                                                               |
| Web-standard HTTP transport   | `@modelcontextprotocol/sdk` ≥1.30, `server/webStandardStreamableHttp.js` | `Request`→`Response`, which is exactly an App Router handler. No Express adapter                            |
| Stateless mode                | same, `sessionIdGenerator` optional                                      | Omit it and there is no session to pin to an instance                                                       |
| Route wrapper scheme          | `src/lib/api-utils.ts:224` `route()`                                     | One private `route(mode, …)` with an `AuthMode` union — a fourth mode is an enum arm, not a parallel system |
| Wrapper enforcement           | `eslint.config.mjs:95`                                                   | A handler cannot be exported without declaring its auth                                                     |
| Disabled-account refusal      | `requireUser` (`api-utils.ts:49`)                                        | The rule token auth must match                                                                              |
| Write gating                  | `agent-gating.md` phases 1–5                                             | A remote write proposes; it does not become the document                                                    |
| Origin stamping               | `Revision.origin = "claude-code"`                                        | Half an audit trail already                                                                                 |
| Change fan-out                | `changeNotification` (`lib/changes/notify.ts`)                           | Already called by the server; in-process it gets _better_                                                   |

### 3.1 What does not exist

Verified by grep at `b01e91a5`:

- **No token or API-key concept anywhere.** `prisma/schema.prisma` has `Account`
  / `Session` / `VerificationToken`, all NextAuth's; the only user-state levers
  are `role` and `disabled` (`schema.prisma:181,185`).
- **No rate limiting anywhere.**
  `grep -rn "rateLimit\|ratelimit\|rate-limit"
  src/` returns nothing.
- **No security headers.** `src/middleware.ts` is a documented no-op, and its
  matcher excludes `/api` anyway.
- **No test environment for `mcp/`.** CLAUDE.md says so explicitly;
  `mcp/smoke.ts` is a live-database script, not a spec.

Three of those four are on the July production-readiness audit already. This
plan does not get to treat them as somebody else's problem: an MCP endpoint is a
_write_ surface reachable with a static credential, which is strictly worse than
the `/api/completion` exposure that audit called the biggest concrete money
risk.

## 4. The three decisions

### 4.1 Bearer tokens, not OAuth

The MCP specification's remote-server authorization story is OAuth 2.1 —
protected-resource metadata, dynamic client registration, an authorization
server. That is the right answer when **the caller is not the operator**: a
third party's Claude Code talking to their own content on someone else's
deployment.

That is not this. Here the operator, the author and the person holding the
credential are one person. A bearer token they mint for themselves is:

- sufficient — it proves possession of a secret bound to one user, which is all
  OAuth would establish;
- supported — Claude Code passes custom headers on HTTP MCP transports
  (`claude mcp add --transport http … --header`; confirm the current flag
  spelling against `claude mcp add --help` before writing the docs);
- an order of magnitude less code, and no new long-lived trust surface.

**Draw the line explicitly and record it:** the moment the goal becomes "other
people connect their agents to my deployment," this decision is wrong and OAuth
is a separate plan. Do not grow token auth into a multi-tenant scheme by
accretion — a token that can name a user other than its owner is the failure
mode, and §4.3 makes it unrepresentable rather than merely absent.

### 4.2 A fourth route wrapper

The endpoint cannot be a `publicRoute` with a check inside it. CLAUDE.md and
`api-utils.ts:250` both state the invariant that
`grep -rn "publicRoute" src/app/api` is _the complete list of unauthenticated
surfaces_, and the whole value of the scheme is that the list is trustworthy. A
token-authenticated route listed among the public ones corrupts the one thing
the naming buys.

It also cannot be `userRoute`: that resolves a NextAuth session, and a bearer
token has none.

So: a fourth arm on the existing union.

```ts
type AuthMode = "public" | "user" | "optional" | "token";

/**
 * A route authenticated by an agent token rather than a session cookie.
 * `context.user` is the token's owner; the token itself is `context.token`,
 * because scope decisions belong to the handler.
 */
export const tokenRoute = <P = Params>(
  handler: Handler<{ params: P; user: SessionUser; token: AgentTokenInfo }>,
  options?: RouteOptions,
): NextRouteHandler<P> => route("token", handler, options);
```

The mode arm in `route()` (`api-utils.ts:229`) resolves the token, rejects a
disabled owner exactly as `requireUser` does, and 401s with
`WWW-Authenticate: Bearer` rather than the sign-in message shape.

Three ESLint strings must learn the new name or the rule starts lying:
`eslint.config.mjs:71`, `:99` and `:104`. That is part of the phase, not a
follow-up — a rule whose message omits a legal option teaches the wrong thing.

### 4.3 The token model

```prisma
model AgentToken {
  id         String    @id @default(uuid()) @db.Uuid
  userId     String    @db.Uuid
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name       String    // "laptop", "ci" — what shows in the audit trail
  hash       String    @unique   // sha-256 of the presented secret
  scopes     String[]  // "read" | "propose"
  createdAt  DateTime  @default(now())
  lastUsedAt DateTime?
  expiresAt  DateTime?
  revokedAt  DateTime?

  @@index([userId])
}
```

Notes on each choice, because they are the security-relevant part:

- **`hash` is unique and is what we look up by.** Hash the presented secret,
  query `where: { hash }`. One indexed equality, no prefix scan, and no timing
  concern worth engineering around given the secret is 256 bits of CSPRNG. The
  plaintext is shown once at mint and never stored.
- **`userId` is on the token, never in the request.** `getAuthorId()` becomes
  "the owner of the token that authenticated this request." There is no
  argument, header or body field by which a caller can name a different author.
  This is what keeps §4.1's line from eroding.
- **`scopes` from day one, not later.** It costs one array column and one check,
  and it is the difference between a token that can read your blog and one that
  can propose edits to it. `read` covers `list_*`/`outline`/`read_*`/`search`;
  `propose` covers `apply_ops` and `create_post`. Retrofitting scopes onto
  issued tokens is the kind of migration nobody does.
- **`expiresAt` nullable, `revokedAt` set rather than row deleted.** A revoked
  token's `lastUsedAt` is evidence; deleting the row destroys it.
- **`onDelete: Cascade`** so account deletion (an open GDPR item on the audit)
  does not leave live credentials behind.

Format: `blog_pat_` + 32 random bytes base64url. The prefix makes a leaked token
greppable in logs and recognisable by secret scanners.

## 5. Phases

Each phase is independently shippable and leaves the stdio server working.

### Phase 1 — Make the server a factory — **SHIPPED (8 Aug 2026)**

`createContentServer({ resolveAuthorId })` in **`src/lib/mcp/server.ts`**, with
the eight handler bodies moved verbatim and `getAuthorId` becoming the injected
resolver, memoised per server rather than per process. `mcp/content-server.ts`
is now 52 lines: resolve `MCP_AUTHOR_ID`, build one, connect stdio.

Three deviations from what this section originally said, all deliberate:

- **`src/lib/mcp/`, not `mcp/`.** The dependency direction is already
  mcp → src (`@/lib/agentWrites`, `@/lib/content-bridge`, `@/lib/prisma`), so
  the factory belongs on the src side or phase 3's route imports backwards out
  of the Next tree. It also puts the spec where `vitest.config.mts` looks
  (`include: src/**/__tests__/**`).
- **No `scopes` option yet.** It would be a parameter nothing reads until
  phase 3. The options object is the seam; adding the field then is one line.
- **The stdio entry resolves eagerly**, before connecting the transport, so a
  `MCP_AUTHOR_ID` matching no user is a startup error rather than a refusal on
  whichever tool the agent calls first — which is what
  `docs/guides/claude-code-content.md` already claimed happened. The factory's
  own resolver stays lazy, because a per-request server should not pay a lookup
  for a `tools/list` that reads nothing.

Acceptance, run against the container already on 5432: `npm run mcp:smoke` and
`RUN_WRITE=1 npm run mcp:smoke` both pass — create, outline, propose, the stale
hash refused, a second batch squashed into one proposal at version 1, `head`
unmoved, cleanup. (Both need `MCP_AUTHOR_ID` exported; the script passes
`--env-file=.env` to the child, but the value lives in `.mcp.json`. That is
pre-existing, and worth fixing when phase 6 touches the docs.)

**The bonus landed too:** `src/lib/mcp/__tests__/server.test.ts` drives a real
`Client` over `InMemoryTransport` against a stubbed resolver and mocked Prisma —
five specs, no database, no subprocess. `mcp/` had no test environment at all
because the tools hung off a module-level singleton bound to an env var; making
the transport optional is what made them reachable. What they pin is §1's
claim: two servers in one process get two different authors, a write passes its
resolved author as `ownedBy`, and `tools/list` costs no user lookup.

### Phase 2 — Tokens — **SHIPPED (8 Aug 2026)**

`AgentToken` per §4.3 (migration `20260808165956_add_agent_token`, purely
additive — one new table, nothing altered), **many per user** as §8.1 asked.
`src/lib/agentTokens.ts` holds the lifecycle and
`prisma/scripts/agent-token.ts` is a thin CLI over it:

```bash
npm run mcp:token -- mint you@example.com --name laptop
npm run mcp:token -- mint you@example.com --name ci --scopes read --expires 90d
npm run mcp:token -- list you@example.com
npm run mcp:token -- revoke <token-id>
```

Deviations, again deliberate:

- **The whole lifecycle is in the module, not just minting.** Splitting
  `verifyAgentToken` into phase 3 would mean the hash written by one phase and
  read by another, which is the drift the module exists to prevent. Phase 3 now
  only has to write the wrapper.
- **`prisma/scripts/*.ts`, not `scripts/*.mjs`.** `scripts/` holds the
  `check:*` linters, none of which touch the database; `prisma/scripts/` already
  holds `backfill-ranks.ts`, which does. It also gets to import from `src/`.
- **Names are not unique.** Revocation is by id. A uniqueness constraint would
  mean re-minting "laptop" after revoking it needed a different name, because
  revoked rows are kept.
- **`findUserByRef` landed in `repositories/user.ts`**, since the CLI and
  `mcp/content-server.ts` both resolve "an id or an email" and were about to
  hold two copies of it. Distinct from `findUser`, which takes an id or a
  *handle* — that is how a URL names a user, not how an operator does.

`src/lib/__tests__/agentTokens.test.ts` (14 specs) pins the refusal side, which
is the half that fails silently: a malformed secret never reaches the database,
an unknown and a revoked token are indistinguishable from outside, expiry is
inclusive on the boundary, revoked beats expired in the reported state, the
hash never comes back to the caller, and **a valid token whose owner is
`disabled` is refused** — the `requireUser` rule that a credential outliving
its account is the obvious way to miss.

Verified against the live database end to end: mint → list → revoke → list,
plus the five refusal paths (unknown user, unknown scope, missing `--name`,
malformed `--expires`, no command). The test row was deleted afterwards;
`AgentToken` is back to 0 rows.

### Phase 3 — `tokenRoute` and the endpoint — **SHIPPED (8 Aug 2026)**

`tokenRoute` in `api-utils.ts` per §4.2, the three ESLint messages, and:

```
src/app/api/mcp/route.ts
```

```ts
export const runtime = "nodejs"; // Prisma
export const dynamic = "force-dynamic"; // never cached

export const POST = tokenRoute(async (request, { user, token }) => {
  const server = createContentServer({
    resolveAuthorId: async () => user.id,
    scopes: token.scopes,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({});
  await server.connect(transport);
  return transport.handleRequest(request);
}, { errorLabel: "MCP request failed" });
```

**Stateless deliberately** — no `sessionIdGenerator`. A new server per request
costs nothing (the tools are stateless request/response), and it buys immunity
from instance affinity if the deployment ever runs more than one container. What
it gives up is server→client notification and resumable streams; nothing in the
eight tools uses either. Record that trade here so a future session does not
"fix" it by adding sessions.

`GET` and `DELETE` on the same path should 405 rather than 404, so a
spec-conformant client gets a legible answer.

#### Shipped 8 Aug 2026 — how it differs from the sketch above

**Same origin** (§8.2 decided): `/api/mcp` on the blog's own host, sharing its
TLS and deployment. The cost is that the endpoint cannot be taken down
independently of the blog; if that becomes a requirement it is a reverse-proxy
rule, not a rewrite.

- **No `context.user`.** The sketch destructured `{ user, token }`.
  `verifyAgentToken` already applies the one user-level rule that matters — a
  disabled account — so fetching the whole `User` row to satisfy a type would be
  a query per request for something no handler reads. `token.userId` is what the
  server is built from.
- **Scopes gate at registration, not per call.** A server without `propose`
  never registers `apply_ops` or `create_post`, so a read-only agent does not
  see them in `tools/list` and plans around the limit instead of discovering it
  through a refusal — and there is no per-tool check anyone can forget. Unknown
  entries in the token's `scopes` (a free-form `text[]`) are filtered out rather
  than trusted.
- **`enableJsonResponse: true`.** All eight tools are request/response, so there
  is no server-initiated notification to hold a stream open for — and a complete
  `Response` is what lets the transport be closed as soon as it is built.
  Without that close, every call leaks a transport for the life of the
  container.
- **`GET`/`DELETE` are simply not exported.** Next answers an unimplemented
  method with 405 by itself, so the explicit handlers the sketch wanted are
  unnecessary.
- **`ApiError` grew an optional `headers`,** so the 401 can carry
  `WWW-Authenticate: Bearer` as RFC 7235 asks.

Two specs, because this is the auth surface CLAUDE.md warns has no automated
coverage: `src/lib/__tests__/tokenRoute.test.ts` (7) pins that missing,
malformed, unknown, revoked and expired all produce **one byte-identical 401**
with `WWW-Authenticate`, that `disabled` is a distinguishable 403, and that the
handler never runs without a token. `src/lib/mcp/__tests__/server.test.ts` gained
two more: a read-only server hides the write tools, and asking it to write
reaches `proposeOps` not at all.

**§7 verified end to end** against `npm run dev` and the live database, then
cleaned up (post deleted, all three tokens deleted, `AgentToken` back to 0 rows,
the temporarily-disabled test account restored):

| Check | Result |
| --- | --- |
| No header | 401 + `WWW-Authenticate: Bearer` |
| Unknown token | 401, byte-identical to the above |
| Revoked token | 401, byte-identical to the above |
| Disabled owner | 403 `Account Disabled` |
| Read-only token | `tools/list` returns 6, not 8 |
| Read-only calling `apply_ops` | `Tool apply_ops not found`, nothing written |
| **Two tokens, one server** | owner sees 206 posts, second author sees **0** |
| Second author naming a post by id | "not found (or not yours)" |
| Write path | `create_post` → `outline` → `apply_ops` proposes; `head` still points at a committed revision, 1 pending proposal |

The cross-author check is the one §7 said was easiest to skip and hardest to
trust from a single-author database. It ran against the same live server with
two tokens, which is the only form of it worth having.

### Phase 4 — Rate limiting — **SHIPPED (8 Aug 2026)**

The first phase that is about strangers rather than shape. Minimum viable and
honest:

- a limiter behind an interface, keyed on token id, with separate buckets for
  reads and writes (`apply_ops`/`create_post` are the expensive, stateful ones);
- an in-memory token bucket as the first implementation, which is **correct only
  while one instance serves the endpoint** — say so in the module comment and in
  `docs/`, and make the interface the seam a Postgres- or Redis-backed version
  drops into;
- 429 with `Retry-After`.

Also here: a request body cap. `create_post` bodies are unbounded today, and
`next.config.ts` caps server _actions_ at 2MB but that does not cover route
handlers.

#### Shipped 8 Aug 2026

`src/lib/rateLimit.ts` is the app's first rate limiter, written generic because
the audit's next two users are `/api/completion` and `/api/copilot`.
`src/lib/mcp/limits.ts` holds the numbers and says where they came from.

**Three budgets, not one**, because they bound different failures:

| Budget | Capacity / rate | Enforced | Refusal |
| --- | --- | --- | --- |
| Requests | 90 burst, 180/min | in the route, before parsing | HTTP 429 + `Retry-After` |
| Reads | 60 burst, 120/min | per tool call | tool error naming the wait |
| Writes | 10 burst, 20/min | per tool call | tool error naming the wait |

The request budget is in the route because it must cover calls that never reach
a tool — an `initialize` flood, malformed JSON-RPC. The read/write split is per
*tool call* rather than per request because one HTTP request can carry more than
one JSON-RPC message, so counting requests alone would undercount precisely the
caller trying to take more than their share.

Metering happens **before** the handler, wrapped around every registration, so
the metered set is the registered set and a refused call costs no query.

**A token bucket, not a fixed window.** A fixed window lets a caller spend a
full budget at 0:59 and again at 1:00, so the real burst is twice the configured
limit at every boundary. Continuous refill has no boundary to exploit and costs
one subtraction.

§8.3 answered as well as it can be for now: the numbers come from measured
*shape*, not measured load — `npm run mcp:smoke` is ~12 calls end to end and
editing one document is ~5, so a hard session over ten documents is ~50 calls
spread over minutes. Both budgets sit far above that and a `while (true)` hits
them in a second. **Revise from a real transcript once there is one; a
legitimate session tripping a limit is the bug, not the session.**

`MAX_BODY_BYTES` is 1 MiB, checked against `Content-Length` before anything is
parsed → 413.

Nine specs in `src/lib/__tests__/rateLimit.test.ts` (time is injected, so they
are ordinary pure-function tests): burst then refuse, per-key isolation,
continuous refill, never accumulating past capacity however long it idles,
`Retry-After` rounded up and never zero, surviving a clock that goes backwards,
refusing a nonsensical budget at construction, and evicting idle buckets rather
than growing forever. Three more in the server spec: reads and writes hit
separate budgets, a refused call reaches no query, and no budget means unmetered
(what stdio gets).

Verified against a running server:

| Check | Result |
| --- | --- |
| 70 sequential reads (burst 60) | 62 allowed, 8 refused — the 2 extra are refill during the loop |
| 200 requests, 25 at a time | 92 × 200, 108 × 429 |
| The 429 itself | `Retry-After: 1`, `{"error":{"title":"Too Many Requests",…}}` |
| 20 `apply_ops` (burst 10) | exactly 10 through, 10 refused |
| 1 MiB + 500 bytes body | 413, nothing parsed |
| After the burst | next request succeeds — the bucket recovers |

**Still per-process.** Two containers serving one token get a budget each. That
is honest for the single-container deployment
docs/plans/prod-storage-decision.md chose, and wrong the moment the app scales
out; `RateLimiter` is the seam a shared-store implementation drops into.

### Phase 5 — Hardening

- **Refuse a bearer token over plain HTTP** unless an explicit
  `MCP_ALLOW_INSECURE=1` opts local development out. "Give it the IP" means
  cleartext on the wire otherwise, and a static credential is the worst thing to
  put there.
- **Stamp the token name into the audit trail.** `Revision.origin` is already
  `"claude-code"`; make it carry _which_ agent, so the app can say "proposed by
  `laptop`" rather than "proposed by something."
- **`lastUsedAt`** written on use — throttled to, say, one write a minute per
  token, so a chatty agent does not turn every read into a write.
- **Security headers** on the route (`Cache-Control: no-store` at minimum).
  Fixing `src/middleware.ts` wholesale is the audit's item, not this plan's, but
  this route must not wait for it.

### Phase 6 — Docs and registration

Extend `docs/guides/claude-code-content.md` with a remote section — and keep it
to setup and caveats, per the split that landed in `c96a2bc9`. The tool
descriptions still document the tools.

Registration ergonomics: `.mcp.json` is checked in and project-scoped, so a
remote entry there **must not contain the secret**. Either register at user
scope (`claude mcp add --scope user`), or commit an entry that reads
`${BLOG_MCP_TOKEN}` from the environment. State which, and make the guide show
exactly one of them.

## 6. What does not change

Worth listing, because it is most of the system:

- all eight tool handlers, byte for byte;
- `src/lib/content-bridge/` — addressing, codecs, `stateHash`, the escaping;
- the proposal gating: a remote `apply_ops` proposes, squashes and goes stale by
  exactly the rules in `agent-gating.md`;
- `mcp/smoke.ts` against stdio (it gains an HTTP mode, it does not lose the
  stdio one);
- the in-app Copilot, which drives the same bridge client-side.

## 7. How this gets verified

CLAUDE.md's standing warning applies with force: **no automated check covers API
authorization.** For this endpoint that gap is the whole risk surface, so the
verification is explicit rather than assumed. Against a local Postgres:

1. no `Authorization` header → 401, and the body names nothing about the user;
2. a well-formed but unknown token → 401, indistinguishable in timing and shape
   from (1);
3. a revoked token, and an expired one → 401;
4. a token whose owner has `disabled` set → 403, matching `requireUser`;
5. a `read`-scoped token calling `apply_ops` → refused, and **no `Revision` row
   is written** — check the table, not the response;
6. a valid token → `list_posts` returns only its owner's posts, on a database
   holding two users' content;
7. the write path end to end: `outline` → `apply_ops` → the proposal exists,
   `Document.head` has not moved;
8. rate limit trips and recovers.

(6) is the one that matters most and is easiest to skip. The local database has
200 posts under one author (see the `claude-code-mcp` note); seed a second
author before trusting the check.

## 8. Open questions

1. ~~**One token per user, or many?**~~ **Decided 8 Aug 2026: many.** One
   credential per machine or job, each independently revocable — the alternative
   makes revoking the laptop's token also kill CI, which in practice means never
   revoking. `name` is what distinguishes them and is not unique (see phase 2).
2. ~~**Same origin or a subdomain?**~~ **Decided 8 Aug 2026: same origin**,
   `/api/mcp`. It shares the app's TLS and deployment and gives one URL to point
   a client at. Accepted cost: the endpoint cannot be firewalled or taken down
   without taking the blog with it — recoverable later with a reverse-proxy rule
   rather than a rewrite.
3. **Rate limit numbers.** **Provisionally answered 8 Aug 2026** (phase 4):
   90/180 requests, 60/120 reads, 10/20 writes, derived from the measured
   *shape* of a session rather than from load, because there is none yet. Still
   open in the sense that matters — revise from a real transcript, and treat a
   legitimate session tripping a limit as the bug.
4. **Does a token ever need `role: admin` semantics?** Current answer: no, and
   the schema should keep it unrepresentable.
5. **Token management UI.** Deferred to script-only in phase 2. Is that
   acceptable at "production quality," or does a public deployment need
   self-serve revocation? (It probably does, alongside the account deletion the
   audit already wants.)
6. **Third-party OAuth** — the §4.1 line. Not now. Revisit only if the goal
   changes from "my agents, my blog" to "other people's agents."
