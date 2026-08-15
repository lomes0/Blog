# Bring-your-own provider keys

**Status: phases 1–2 shipped 15 Aug 2026; phases 3–5 open.** Measured against
the tree at `9b839169`. Decided at the outset, so the alternatives below are
recorded for their reasoning rather than as live options: **keys are stored
server-side, encrypted** (§4), and **there is no deployment-key fallback** — a
user with no key for the provider they picked is refused and told to add one
(§4.7).

Phase 1 landed the storage layer; phase 2 put a route and a CLI on top of it, so
a user can now add, replace and remove a key. **The app still resolves keys from
`process.env`** — §5 is deliberately ordered so that the switch to per-user keys
is the *last* phase rather than the first, and nothing a user stores is used for
a completion until phase 4.

Today every signed-in user spends the deployment's AI credits, because
`src/lib/ai/providers.ts` reads `process.env` and there is nowhere else a key
could come from. This plan makes the key a property of the *user* instead of the
*deployment*, without ever letting the plaintext reach a browser.

## 1. The insight

The repo already has a credential lifecycle it likes: `src/lib/agentTokens.ts`
owns mint, verify, revoke and list in one module, precisely so that "how a
secret becomes a row" has a single implementation. The shape of that module is
the shape of this one.

**But the storage mechanism cannot be copied, and this is the whole design
problem.** An `AgentToken` is stored as an unsalted SHA-256 because the server
only ever needs to answer *is this the same string I saw before*. A provider key
has to be replayed verbatim to `api.anthropic.com` on every completion. The
server needs the plaintext back.

```
AgentToken     secret ──► sha256 ──► row        verify: hash(presented) == row
                                                (one-way; a DB leak yields nothing)

Provider key   secret ──► encrypt ──► row       use: decrypt(row) ──► outbound header
                             ▲                  (two-way; a DB leak plus the KEK yields everything)
                            KEK
                          (in env)
```

So the security story is not "we never store it". It is **"the database alone is
not enough"** — the ciphertext is worthless without a key-encryption key that
lives in the environment, and the plaintext never travels back toward the
client. That is a weaker guarantee than `AgentToken`'s, it is the strongest one
available for a credential that must be replayed, and it should be written where
the columns are rather than assumed.

## 2. What this is measured against

Three cheaper things, each of which beats this plan on some axis:

**Doing nothing.** Env keys, shared credits. Works today, costs nothing, and is
fine for a single-author blog. It stops being fine the moment registration is
open — which it is (`CLAUDE.md`: "anyone who completes an OAuth sign-in gets an
account"), and the July audit already named unmetered AI routes as a production
blocker.

**Keep the key in the browser.** `localStorage` beside the existing `llm` entry,
sent as a request header per call. No migration, no KEK, no rotation, perhaps a
day of work. It loses on three counts: the key is per-browser rather than
per-user, any XSS in the app reads it out, and it still crosses the server on
every request — so it buys none of the "we never see it" that would justify the
downgrade. Rejected, but it is the right answer if this plan stalls.

**Quotas instead of keys.** Keep deployment credentials and meter
`/api/completion` and `/api/copilot` per user with the token bucket already in
`src/lib/rateLimit.ts`. This addresses the actual cost exposure at a fraction of
the effort, and it is *not exclusive with this plan* — see §8, where it stays on
the table for the Ollama path and for anyone the deployment chooses to sponsor.

This plan wins on exactly two things: a user's spend is their own, and the
deployment can be handed to strangers without handing over its credits.

## 3. What already exists

| Asset                       | Where                                        | What it gives us                                                            |
| --------------------------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| Credential-module precedent | `src/lib/agentTokens.ts`                     | The module shape: whole lifecycle in one file, pure helpers split out        |
| Per-user credential table   | `AgentToken` in `prisma/schema.prisma:212`   | The columns to imitate — `userId` on the row, cascade delete, `lastUsedAt`   |
| Route wrapper scheme        | `src/lib/api-utils.ts:315` `route()`         | `userRoute` + `parseBody` + `.strict()`; auth cannot be forgotten            |
| Validated bodies            | `parseBody`, the `no-restricted-syntax` rule | A key arriving as an unvalidated cast is already impossible                  |
| Token bucket                | `src/lib/rateLimit.ts`                       | Needed for the validation endpoint (§4.6), which is otherwise an oracle      |
| Provider factory seam       | `src/lib/ai/providers.ts:126`                | One function every caller goes through — the only place that reads env today |
| Two call sites, both authed | `api/completion:97`, `api/copilot:280`       | Both are `userRoute`, so `context.user` is already in scope at resolution    |
| Model registry              | `src/lib/ai/models.ts`                       | Every model already declares its `provider`, so "is this usable" is derivable |
| Client model state          | `src/contexts/AIModelContext.tsx`            | Already falls back when a stored model disappears — extend, don't add        |

### 3.1 What does not exist

Verified by grep at `9b839169`:

- **No encryption anywhere in the app.** `node:crypto` appears in six files and
  every use is a hash or a random id (`agentTokens.ts`, `storage.ts`,
  `agentWrites.ts`, `revision.ts`, and the two attachment routes). There is no
  `createCipheriv`, no KEK, no rotation convention. This plan introduces the
  first reversible secret in the codebase, and that is a category the repo has
  so far avoided.
- **No server-side user preferences.** `AIModelContext` is `localStorage`; the
  only user-scoped settings that survive a browser are columns on `User`. There
  is no settings table to hang this off.
- **No typed refusal for a missing key.** `AIConfigurationError` is thrown in
  six places in `providers.ts` and caught nowhere — `logAndWrap` turns it into
  an opaque 500. Today that is a misconfigured deployment and rare. Under
  BYO-only it becomes the single most common failure in the app, so §4.7 is not
  polish.
- **No provider filtering in the pickers.** `Composer.tsx`, `AITools.tsx`,
  `AIDialog.tsx` and `SettingsPanel.tsx` all render `AI_MODELS` whole. A user
  with only an Anthropic key would be offered Gemini and get a 500.

## 4. The design

### 4.1 The schema

```prisma
/// A user's own API key for one AI provider — see docs/plans/byo-provider-keys.md §4.
///
/// Unlike `AgentToken`, this is **encrypted, not hashed**: the plaintext is
/// replayed to the provider on every completion, so the server must be able to
/// read it back. The security claim is therefore narrower and worth stating
/// plainly: a dump of this table is useless on its own, because the ciphertext
/// is AES-256-GCM under a key that lives in the environment (`AI_CREDENTIAL_KEYS`).
/// A host with both the database and the environment has every user's key.
model ProviderCredential {
  id     String @id @default(uuid()) @db.Uuid
  userId String @db.Uuid
  // Cascade for the same reason AgentToken cascades: deleting an account must
  // not leave live third-party credentials behind.
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// Which provider, by the same string `AIModel.provider` uses. A plain string
  /// rather than an enum, matching `AgentToken.scopes` and `User.role` — the set
  /// grows, and growing it should not be a migration.
  provider String

  /// AES-256-GCM parts. Split into three columns rather than one packed blob so
  /// that a malformed row is a decode failure at a named field instead of an
  /// off-by-one in a parser nobody reads twice.
  ciphertext Bytes
  iv         Bytes
  authTag    Bytes

  /// Which KEK encrypted this row. Present from the first migration because
  /// retrofitting rotation means re-encrypting blind — with this column, a
  /// rotation is "decrypt under the version the row names, re-encrypt under the
  /// current one", and it can be resumed after a crash.
  keyVersion Int @default(1)

  /// Last four characters of the plaintext, for the masked display. Four is what
  /// the providers themselves show; it identifies a key to the person who owns
  /// it without being a meaningful fraction of the secret.
  last4 String

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  /// Last time a completion used it — the evidence for "is this key still live".
  lastUsedAt     DateTime?
  /// Last time it was checked against the provider and worked (§4.6).
  lastVerifiedAt DateTime?

  /// One key per provider per user. Multiple keys for one provider would need a
  /// "which is default" concept for no benefit — a user replacing a key means to
  /// replace it, so the write is an upsert.
  @@unique([userId, provider])
  @@index([userId])
}
```

### 4.2 The crypto

`src/lib/providerCredentials/crypto.ts`, importing nothing but `node:crypto`, so
it can be exercised without a database — the same rule `dragGeometry.ts` and the
content-bridge modules follow.

```ts
const ALGORITHM = "aes-256-gcm";

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function seal(plaintext: string, key: Buffer, aad: string): SealedSecret;
export function open(sealed: SealedSecret, key: Buffer, aad: string): string;
```

Three decisions worth fixing here rather than discovering later:

**GCM, not CBC.** The auth tag is what makes a tampered row a thrown error
rather than a garbage key silently sent to Anthropic.

**The AAD is `${userId}:${provider}:${keyVersion}`.** Without it, a ciphertext is
portable: anyone with write access to the table could move row A's bytes onto
row B and make one user's completions bill another user's key. Binding the
ciphertext to the identity of its row costs one string concatenation and closes
that entirely. It also means the three fields cannot be edited independently — a
row whose `provider` was flipped by hand fails to open rather than decrypting
into the wrong provider's client.

**A fresh 12-byte IV per `seal`, never reused.** GCM's failure under IV reuse is
catastrophic rather than gradual, so the IV is generated inside `seal` and there
is no parameter through which a caller could supply one.

The KEK comes from the environment as a versioned set, because a single
`AI_CREDENTIAL_KEY` makes rotation a flag day:

```bash
# base64, each decoding to exactly 32 bytes. Generate with:
#   node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
AI_CREDENTIAL_KEYS="1:Base64OfV1,2:Base64OfV2"
AI_CREDENTIAL_KEY_VERSION="2"   # which one new writes use
```

A key that does not decode to 32 bytes is a startup error naming the version,
not a runtime failure inside a completion. Rotation is then: append a version,
flip `AI_CREDENTIAL_KEY_VERSION`, run `pnpm ai:rotate` (§5, phase 5), drop the
old version once no row names it.

### 4.3 The module

`src/lib/providerCredentials/index.ts`, mirroring `agentTokens.ts`:

```ts
export interface CredentialSummary {
  provider: string;
  last4: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  lastVerifiedAt: Date | null;
}

/** Upsert. Returns the summary — never the plaintext, which the caller already has. */
export async function saveCredential(input: {
  userId: string; provider: AIProviderType; apiKey: string;
}): Promise<CredentialSummary>;

/** The only function that returns plaintext, and it is server-only by construction. */
export async function resolveApiKey(
  userId: string, provider: AIProviderType,
): Promise<string | null>;

export async function listCredentials(userId: string): Promise<CredentialSummary[]>;
export async function deleteCredential(userId: string, provider: AIProviderType): Promise<boolean>;
export async function touchCredential(userId: string, provider: AIProviderType): Promise<void>;
```

`resolveApiKey` is the whole plaintext surface. Everything else — the route, the
UI, the model pickers — is written against `CredentialSummary`, so returning a
key to a browser requires deliberately calling the one function that could, from
a file that has no reason to.

### 4.4 The resolution seam

`providers.ts` stops reading `process.env` and takes what it needs:

```ts
export interface ProviderCredentials {
  apiKey: string;
  /** Deployment config, never user input — see §4.5. */
  baseURL?: string;
  apiVersion?: string;
}

export const createProvider = (
  providerType: AIProviderType,
  credentials: ProviderCredentials,
): ProviderInstance;
```

Both call sites already have `context.user`, so resolution happens in the route:

```ts
const credentials = await resolveProviderCredentials(user.id, provider);
const providerInstance = createProvider(provider, credentials);
```

Two things follow from moving the env read out. The provider factories become
testable for the first time — today `createAnthropicProvider()` cannot be
exercised without setting a process-wide variable. And `getModelInstance(model)`
in `providers.ts` loses its only argument-free path; it is exported but called
nowhere, so it should be deleted rather than given a credentials parameter it
has no caller to receive one from.

### 4.5 Ollama and Azure are not like the other two

Anthropic and Google are one string each. The other two are not, and both
exceptions are load-bearing:

**Ollama has no key at all** — it is a base URL, and usually a local one. A
BYO-only rule that refuses Ollama because the user has "not added a key" refuses
a provider that has no key to add. So the rule is per-provider:
`providerRequiresKey(provider)` is false for Ollama, which stays entirely
deployment-configured.

**Azure is a key plus a base URL plus an API version.** Only the key becomes
per-user. `AZURE_OPENAI_BASE_URL` and `AZURE_OPENAI_API_VERSION` stay in the
environment.

That split is a security boundary, not a convenience. **A user-supplied base URL
turns the server into an SSRF gadget**: `createProvider` would then fetch any
host the user names, from inside the deployment's network, with the deployment's
egress. `169.254.169.254` is the obvious target and it is not the only one. The
rule is therefore explicit and belongs in a comment at the type: *keys are
per-user, URLs are deployment config*. If per-user endpoints are ever wanted,
they arrive as an allowlist, not as a text field.

### 4.6 The route

`src/app/api/ai/credentials/` — `userRoute` throughout, since a credential
belongs to whoever is signed in and there is no id in the path to authorize:

| Method + path                     | Body                          | Returns                                    |
| --------------------------------- | ----------------------------- | ------------------------------------------ |
| `GET /api/ai/credentials`         | —                             | `CredentialSummary[]` — masked, never keys |
| `PUT /api/ai/credentials/[provider]` | `{ apiKey: string }` `.strict()` | The new `CredentialSummary`             |
| `DELETE /api/ai/credentials/[provider]` | —                        | `204`                                      |

**The key is validated before it is stored.** `PUT` makes one minimal call to
the provider — the cheapest model, one token, no streaming — and refuses with a
400 if the provider rejects it. A typo should fail in the settings dialog, where
the user is looking at the field they mistyped, rather than three screens later
as a stream that dies mid-sentence.

That validation makes the route **a free oracle for testing whether a stolen key
is live**, which is worth naming because it is created by the feature rather than
inherited. It gets its own token bucket from `src/lib/rateLimit.ts` — a handful
of attempts per user per hour is generous for a human typing their own key and
useless for checking a list.

`PUT` is also the one place a secret is in a request body, so: no `console.log`
of the parsed body, and the 400 raised on rejection must quote the provider's
message without echoing the key back.

### 4.7 The refusal

Under BYO-only, "you have no key for this provider" is the most common failure
path in the AI surface, and today it is an untyped 500 (§3.1). It becomes a
first-class response:

```
409 { error: { title: "No Anthropic key", subtitle: "Add one in Settings → AI providers." } }
```

409 rather than 400 — the request is well-formed and the user is authenticated;
it is the account that is not in a state to serve it. The client renders it as an
action, not an error toast: the AI surfaces already know how to show a message,
and this one carries a button that opens the settings section.

**The picker should make this rare rather than merely legible.** `GET
/api/ai/credentials` tells the client which providers are usable; the four
places that render `AI_MODELS` (`Composer.tsx:538`, `AITools.tsx:440`,
`AIDialog.tsx:78`, `SettingsPanel.tsx:232`) disable the models whose provider is
unconfigured and show "Add a key" against them. `AIModelContext` already
falls back to the default when a stored model disappears from the registry
(`AIModelContext.tsx:31`); the same effect extends to a model whose provider the
user has no key for.

## 5. Phases

The ordering has one constraint that is easy to get wrong: **the seam flip is
last.** Phase 4 is the moment AI stops working for anyone without a key, so
every phase that gives users a way to add one ships before it.

**Phase 1 — crypto and schema. SHIPPED 15 Aug 2026.**
`providerCredentials/crypto.ts`, the Prisma model, the migration
(`20260815085643_add_provider_credential`), the module in §4.3, and the specs.
No behaviour change; nothing calls it yet.
*Acceptance, met:* `__tests__/crypto.test.ts` and `__tests__/keyring.test.ts` —
33 tests, split because the keyring is a separate module and its failures are
operator-facing rather than cryptographic. They cover the round trip, a wrong
AAD failing to open, a tampered ciphertext / tag / IV each failing, two seals of
one plaintext differing (IV freshness), and a key of the wrong length being
rejected at load rather than at use. The failure cases are the point — an
encrypt/decrypt round trip passes just as well with the tag unchecked.

Three things the plan did not anticipate, recorded because they cost time:

- **`Buffer` is not assignable to a Prisma `Bytes` column.** Prisma 6 types it
  `Uint8Array<ArrayBuffer>` and `node:crypto` returns `Buffer<ArrayBufferLike>`,
  which may be `SharedArrayBuffer`-backed. `index.ts` has a `bytes()` helper for
  the copy.
- **Node's base64 decoder silently accepts base64url**, so a key pasted through
  a URL-safe encoder decodes to 32 bytes of the wrong key and passes every other
  check. `decodeKey` re-encodes and compares. The same rule refuses *unpadded*
  base64, which is legitimate — that strictness is deliberate (§4.2) since the
  error prints the exact command that produces a canonical key.
- **The specs mock Prisma, so they prove nothing about the columns.** A
  throwaway script against the local Postgres covered the parts they cannot
  reach: the `Bytes` round trip, the compound-key upsert replacing rather than
  colliding, and `iv`/`authTag` coming back at their declared lengths.

**Phase 2 — the route and the CLI. SHIPPED 15 Aug 2026.** §4.6, plus
`pnpm ai:key` mirroring `pnpm mcp:token`.
*Acceptance, met* — a throwaway script drove 23 checks against the dev server
(routes are script-verified here; CLAUDE.md's rule that no automated check
covers API authorization applies): a key added, listed masked, replaced and
deleted over HTTP; a wrong key refused at `PUT` before storage; the budget
running out; `GET` never returning plaintext, asserted on the serialized body.
Plus `verifyKey.test.ts`, 11 tests on the classification and redaction.

Two departures from the plan as written, both deliberate:

- **§4.4's signature change came forward into this phase.** `verifyProviderKey`
  needs to build a provider from an explicit key, and the alternative was a
  second construction path duplicating Azure's fetch-rewriting. So
  `createProvider(type, credentials)` landed now, with the routes passing a
  temporary `credentialsFromEnv(provider)` that preserves today's behaviour
  exactly. Phase 4 is correspondingly smaller: swap what the routes pass, delete
  `credentialsFromEnv`. Dead `getModelInstance` went with it.
- **The rate limit is spent after body validation, not before.** What is
  rationed is the provider call, and a body the schema rejects never makes one —
  charging for it would let the settings dialog's own validation errors eat the
  allowance a user needs to enter their key. Found by the verification script,
  whose budget arithmetic did not come out.

One thing worth knowing for phase 3: `verifyProviderKey` distinguishes
`rejected` (400, the user's to fix) from `unreachable` (502, ours), and the
route relies on that. Collapsing them would tell someone their key is wrong
because our network was down, which is the one outcome that makes a correct key
look broken.

**Phase 3 — the UI.** An "AI providers" section in `SettingsPanel.tsx` (DESIGN.md
conventions), with the four states the design system requires — empty, saving,
saved-and-masked, rejected. Picker filtering in the four render sites.
*Acceptance:* `pnpm check:theme` clean; a provider with no key is visibly
unselectable rather than selectable-and-broken.

**Phase 4 — flip the seam.** `createProvider` takes credentials (§4.4), both
routes resolve per user, `AIConfigurationError` becomes the typed 409, the env
provider keys leave `.env.example`, `CLAUDE.md` and the runtime path.
*Acceptance:* a user with no key gets the 409 and the settings prompt; a user
with a key completes normally; Ollama still works with no key at all; the
deployment's own env keys serve nobody.

**Phase 5 — rotation.** `pnpm ai:rotate` walks rows whose `keyVersion` is not
current, opens under the version they name, re-seals under the current one.
Resumable, because it is the operation that runs when something has gone wrong.
*Acceptance:* a rotation over a seeded table leaves every row readable and every
`keyVersion` current; killing it halfway and re-running finishes the job.

## 6. What this protects, and what it does not

Worth writing down, because the feature reads as "now the keys are secure" and
that is not the claim:

| Threat                                       | Before          | After                                      |
| -------------------------------------------- | --------------- | ------------------------------------------ |
| One user spends the deployment's credits      | wide open       | closed — no fallback exists                |
| Database dump (backup on a laptop, SQLi)      | n/a             | **closed** — ciphertext without the KEK    |
| XSS in the app                                | n/a             | **closed** — plaintext never reaches a browser |
| Full server compromise (env + DB)             | env keys leak   | every user's key leaks                     |
| Someone with production shell access          | env keys        | every user's key                           |
| Stolen key checked for validity via `PUT`     | n/a             | rate-limited, not prevented                |
| SSRF via a user-named endpoint                | n/a             | closed by construction (§4.5)              |

Rows four and five are the honest cost of a credential that must be replayed,
and they are the reason the browser-held alternative in §2 is not simply worse —
it trades them for an XSS exposure and per-browser storage. The trade is
defensible; it is just the wrong side of the trade for a blog with an account
system.

## 7. Open questions

1. **Does the deployment ever want to sponsor a user?** BYO-only is the decision,
   but an author inviting a collaborator may not want to make them buy an
   Anthropic key to use the toolbar. A `User.aiSponsored` boolean plus the §2
   quota work is the shape of an answer; it is deliberately not in this plan.
2. **What happens to a key when its owner is disabled?** `verifyAgentToken`
   refuses a disabled account's tokens. The equivalent here is that
   `resolveApiKey` should refuse for a disabled user — but the routes are
   `userRoute`, which already refuses them, so the check would be unreachable
   today and load-bearing the moment anything else calls the module.
3. **Should `lastUsedAt` be throttled like `shouldTouch`?** `agentTokens.ts`
   writes at most once a minute to avoid turning a read into a write. A
   completion is already expensive enough that a per-use write is noise — but
   the copilot's tool loop can issue several per turn, so probably yes, and it
   should reuse `shouldTouch` rather than grow a second one.

## 8. Deliberately not done

- **Per-user base URLs** (§4.5) — SSRF, and no demand.
- **Multiple keys per provider** — needs a default-selection concept for no gain.
- **Quotas on the Ollama path** — nothing meters the one provider that stays on
  deployment config. It is local and free in the expected deployment; if it ever
  points at a paid endpoint, §2's quota work is what covers it.
- **A KMS.** `AI_CREDENTIAL_KEYS` in the environment is what the single-VPS
  decision in `production-deployment.md` supports. The `keyVersion` column is
  what makes moving to a KMS later a rotation rather than a rewrite.
- **Encrypting `AgentToken`.** It is hashed and should stay hashed; the two
  credentials are different in kind and this plan should not blur them.
