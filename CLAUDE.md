# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Design System

**For all UI work, follow [DESIGN.md](./DESIGN.md).**\
It documents color tokens, typography scale, spacing grid, border radii,
component naming conventions, required states (loading/empty/error/disabled),
and accessibility rules. Always include `"Follow DESIGN.md conventions"` in any
UI-related prompt or sub-agent instruction.

## Project Overview

This is a modern blog platform built with Next.js 15, featuring a rich
Lexical-based editor with support for mathematical content, interactive
visualizations, and series organization. The application uses Prisma with
PostgreSQL for data persistence, NextAuth for authentication, and Redux Toolkit
for state management.

## Editing the blog's content

Asked to read or change a _post_ — as opposed to the code that renders one — use
the `blog-content` MCP tools, not the repo. Posts are rows in Postgres holding
Lexical JSON; there is no file to open. Start with `outline` for the block
addresses every other tool takes, and let the tool descriptions carry the rest —
they are the reference, and they are already in context.

Three things they do not say about themselves: only cloud content is visible
(anything created while signed out lives in browser IndexedDB and never reaches
the server), `apply_ops` proposes rather than commits (report an edit as
awaiting the author, never as done), and `rename_post`/`delete_post` are the two
that do **not** — they land immediately, and a delete is irreversible, so treat
them as the user's decision to make and never as a tidy-up you noticed. Setup and the
remaining caveats are in
[docs/guides/claude-code-content.md](./docs/guides/claude-code-content.md).

## Development Commands

### Core Development

```bash
pnpm install         # Install dependencies
pnpm dev             # Start development server
pnpm build           # Build for production
pnpm start           # Start production server
pnpm lint            # Run ESLint
```

### Maintenance

```bash
pnpm clean                    # Remove .next and cached files
pnpm rebuild                  # Clean and rebuild
pnpm exec prisma generate     # Generate Prisma client
pnpm exec prisma migrate dev  # Run database migrations
pnpm exec prisma studio       # Browse database in browser UI
```

### Testing

```bash
pnpm test            # Vitest, single run
pnpm test:watch      # Vitest, watch mode
```

Config is `vitest.config.mts`: `globals: true` (no importing `describe`/`it`/
`expect`), the `@/*` alias mirrored from `tsconfig.json`, and
`environment:
"node"` — every current spec is pure logic. A spec that needs a
DOM should opt in per-file with a `// @vitest-environment jsdom` docblock rather
than slowing the whole run. `src/types/vitest.d.ts` is what gives `tsc` the
globals; `compilerOptions.types` is deliberately left unset, because setting it
would restrict resolution to only its entries and drop every other ambient
package.

Coverage is 59 specs, 1136 tests, of which the list below walks the ones worth
knowing about rather than all of them. `src/lib/__tests__/blobRefs.test.ts` is
the newest: what a document's content references, and the two ways getting that
wrong destroys user work — a reference the scan cannot see, and one revoked
inside the upload-before-save window (docs/plans/blob-storage.md §3.1, §3.2).
The rest: `src/lib/__tests__/ordering.test.ts`
(fractional rank keys),
`src/components/Layout/SideBar/__tests__/
dragGeometry.test.ts` (sidebar drag
thresholds — `dragGeometry.ts` is kept import-free precisely so it is testable
without a browser), `src/store/__tests__/workspace.test.ts` (the `ui.workspace`
reducers — pane focus, the one-document-one-pane invariant, dirty hoisting, and
the URL replayed over a restored layout),
`src/lib/__tests__/workspaceUrl.test.ts` (when the address bar may be rewritten
to follow pane focus), `src/commands/__tests__/toolParity.test.ts` (that the AI
tool surface stays derivable from the command registry — see
docs/plans/archive/workspace-panes.md §3.1),
`src/components/EditDocument/__tests__/tabFit.test.ts` (which pane tabs fit the
strip and which fall into the overflow menu),
`src/lib/__tests__/scrollMemory.test.ts` (restoring a document to where it was
left — what a stored offset map may contain, and when a restore has settled
versus is still waiting on content that has not rendered), and four for the
content bridge (`src/lib/content-bridge/__tests__/`) — `inline.test.ts` (that a
block's inline formatting survives a Markdown round-trip, over a corpus of
literal marker characters plus 400 randomized runs), `ops.test.ts` (the plan's
central claim: a block nobody named comes out byte-identical, plus snapshot
addressing, atomicity and the freshness guard) and `outline.test.ts`
(addressing, descriptors for blocks with no codec, and the content hash) and
`codecs.test.ts` (a round-trip per graduated block type over a node with every
optional field populated — the obligation docs/plans/archive/claude-code-lexical.md
§4.6.1 attaches to graduating one — which now also feeds each of those nodes to
the zod schema in `content-bridge/schema.ts`, so a type that gains a codec
without gaining a schema arm, or the reverse, fails rather than working on one
agent and not the other), and
`packages/editor/src/utils/__tests__/virtualRepo.test.ts`
(the Copilot's view of the library — that a search hit carries a block address a
later tool can act on, rather than a line number no other tool accepts). Two
more cover phase 5: `src/lib/content-bridge/__tests__/blockId.test.ts` (that a
persistent id keeps naming its block after the tree shifts above it, that a
write stamps only what it touched, and that a read never stamps) and
`packages/editor/src/nodes/__tests__/serialization.test.ts` (that a stored node
survives
a load — `importJSON` is the only parse path, so a class that does not delegate
to `updateFromJSON` silently drops node state _and_ element format/indent/
direction; five classes did). `pnpm check:nodes` enforces the same rule
statically across every node class, including the `.tsx` ones the test
environment cannot parse. The newest two both gate an agent's writes:
`src/lib/__tests__/proposals.test.ts` (that a head repair falls back to history
rather than promoting a pending proposal, and that squashing a second batch onto
one carries `baseRevisionId` through untouched while `version` advances; see
docs/plans/archive/agent-gating.md §3.2, where refreshing that one field is the silent
clobber) and `src/lib/__tests__/agentBatches.test.ts`, which is the phase-2
acceptance test — three consecutive `apply_ops` calls simulated end to end over
an in-memory stand-in for the two tables, asserting that they leave exactly one
pending proposal holding all three edits, that each batch saw the previous one's
work, and that `head` never moves. Both grew a phase-5 half (§3.6): which
proposals a head move invalidates and why a null base cannot be excluded in SQL
(`planStaleMarking`), and what an author's save between two batches now does —
the second batch reads the live document and _replaces_ the stale proposal
rather than folding onto something approval could only refuse. The database half
of all this (the partial unique index, the `version` compare-and-set and the
stale marking actually firing) is a throwaway script against the local Postgres,
not a spec. The MCP server is no longer in that category:
`src/lib/mcp/__tests__/server.test.ts` builds one with
`createContentServer({ resolveAuthorId })` and drives it over the SDK's
`InMemoryTransport` against mocked Prisma, so the tools are reachable without a
database or a subprocess. It pins the authorization claim rather than the
plumbing — two servers in one process get two different authors, a write passes
its resolved author as `ownedBy`, and `tools/list` costs no user lookup. What is
still script-only is anything that needs the live database: `pnpm mcp:smoke`
and `pnpm mcp:token`. `pnpm mcp:smoke:http` is the same idea for the remote
endpoint and needs a live *server* as well: it covers what no spec can reach
because it only exists over HTTP — the token refusals being indistinguishable
from each other, a read-only token seeing six tools rather than eight and a
`manage` one seeing ten (with the check that matters being the *middle* case: a
read+propose token must not have acquired `delete_post`), 426 on
cleartext, the 1 MiB cap, the budgets, and a write proposing under the name of
the token that made it. It takes a URL, so it doubles as a post-deploy check,
and it names the checks it skipped rather than passing over them. Two traps it
encodes: `fetch` silently drops a `Host` header, so the cleartext check would
otherwise arrive claiming to be loopback and be waved through (it drops to
`node:http` for that one), and the route authenticates *before* it decides
whether the transport was fit to carry the credential, so 426 needs a valid
token to reach. `src/lib/__tests__/agentTokens.test.ts` covers the
credential those will use, and deliberately covers the *refusal* side, because
that is the half that fails silently: an unknown and a revoked token must be
indistinguishable from outside, expiry is inclusive on the boundary, the stored
hash never comes back to the caller, and a valid token whose owner is `disabled`
is refused — the `requireUser` rule a bearer credential is the obvious way to
miss. `src/lib/__tests__/rateLimit.test.ts` covers the token bucket by injecting
the clock rather than faking timers, which is why `take(key, now)` takes a time
at all.

Nine more the list above does not walk through, named so the count and the list
agree: `src/lib/changes/__tests__/` (`coalesce`, `diff`, `emitter`, `events` —
the change feed), `src/lib/__tests__/tokenRoute.test.ts` and
`src/lib/mcp/__tests__/transportSecurity.test.ts` (the agent-token wrapper and
the plain-HTTP refusal), `src/lib/__tests__/proposalLabels.test.ts`,
`src/store/__tests__/reconcile.test.ts`, and
`packages/editor/src/plugins/MarkdownPlugin/__tests__/blockShortcuts.test.ts`
(the ``` regression in docs/plans/archive/haklex-adoption.md §10.2, moved out of a
`useEffect` so it could be tested at all).

All of these follow the same rule as `dragGeometry.ts`: the logic lives in an
import-free module so it can be exercised without mounting anything. The DOM
half of the scroll restore is
`components/EditDocument/hooks/useScrollMemory.ts`, and it is uncovered: finding
the right scroller and re-asserting an offset as content settles are both things
only a real browser answers.

The sidebar drag's browser half is `SideBar/SidebarResizeHandle.tsx` plus
`SidebarDragPreview.tsx`, and it is uncovered for the same reason: pointer
capture, and the claim that the gesture does no layout, are only answerable by a
real engine. Verify with CDP `Performance.getMetrics` — `LayoutCount` must not
move between pointerdown and pointerup, and a `ResizeObserver` on `#app-sidebar`
must see exactly one `borderBoxSize` change per drag. See `verify-ui-in-browser`
for the harness (and the trap that `:3000` is usually a stale `next start`).

**No automated check covers API authorization.** Verify behaviour changes by
running the app against the local Postgres and exercising the routes directly.

> **Check what is already serving `5432` before starting anything.** This repo's
> `docker-compose.yml` defines `blog-postgres` (postgres:16) on that port, but a
> different container may already be there holding the real dev data — running
> `docker compose up -d` then collides and **kills the running one**.
> `docker ps` and `pg_isready -h localhost -p 5432` first; if a server answers,
> use it. A system PostgreSQL cluster may also be running, on a _different_ port
> (`pg_lsclusters`), and is not the one the app talks to.

Type-check and lint with `pnpm exec tsc --noEmit` and `pnpm lint`. After touching
anything in `packages/editor/src/nodes/`, run `pnpm check:nodes`. For UI
changes also run `pnpm check:theme`, which catches colors that do not respond
to the light/dark toggle (DESIGN.md §19) — it reads `.css`, `.css.ts` and the
editor's `--ed-*` contract alike.

## Architecture

### Database Schema (Prisma)

The application uses PostgreSQL with the following core models:

- **User**: User accounts with NextAuth integration, supports handles for
  profile URLs
- **Document**: Main content model that represents blog posts (type: DOCUMENT)
  - Supports hierarchical structure (parent/children relationships)
  - Includes fork relationships (base/forks)
  - Has status field (ACTIVE/DONE) for workflow management
  - Supports series organization via `seriesId` and `seriesOrder`
  - Has an inert `background_image` column — the feature was removed and its
    bytes deleted (docs/plans/blob-storage.md §10.2); nothing writes or renders it
- **Series**: Organizes posts into multi-part content series
- **Revision**: Version history for documents, stored as JSON
- **DocumentCoauthers**: Many-to-many relationship for collaborative editing
- **Account/Session/VerificationToken**: NextAuth models
- **AgentToken**: bearer credentials for the remote MCP endpoint — many per
  user, each independently revocable. Only the SHA-256 of a
  secret is stored, `userId` lives on the token and never arrives in a request,
  and revoked rows are kept rather than deleted. Mint and revoke with
  `pnpm mcp:token`; see docs/plans/archive/mcp-support.md §4.3.
  Three scopes, and the split is by what a mistake costs rather than by
  read/write: `read`, `propose` (`apply_ops`, `create_post` — both reviewable,
  both declinable) and `manage` (`rename_post`, `delete_post` — immediate, and
  the delete is unrecoverable because `Document` has no `deletedAt`). `manage`
  is not in the mint default, so no token predating it can delete anything

### Local vs Cloud Storage

Documents have a dual-storage architecture:

- **Local**: Stored in browser IndexedDB (`src/indexeddb/`). Accessible without
  authentication, supports offline use.
- **Cloud**: Stored in PostgreSQL via Prisma. Requires authentication.

The two are hidden behind one seam rather than branched on per call site. The
`PostBackend` interface (`src/store/backend/index.ts`) has two implementations —
`cloudBackend` (PostgreSQL via `/api/*`) and `localBackend` (IndexedDB) — and
`backendFor(user)` picks one from the session alone. Thunks call the interface,
so there are no paired `createLocal*` / `createCloud*` variants; everything
above the seam is written once.

### Blob storage

Images in the editor are stored once, content-addressed, and referenced by
`/api/blob/<sha256>` — not embedded as base64 in every revision, which is what
made six distinct images occupy 13.6 MB across 141 copies. `src/lib/storage.ts`
is the object store (S3 API, MinIO locally), `src/repositories/blob.ts` the rows.
See docs/plans/blob-storage.md. Migration is `pnpm blobs:migrate`
(`status | run [--dry-run] | verify`) and has been run for `image` nodes;
`sketch` and `graph` still hold SVG data URIs, because both render one inline
and a URL would change that (§10.1). Collection is `pnpm blobs:collect`
(`status | run [--dry-run]`): a blob with no `BlobRef` and older than seven days
goes, object first and then the row, because the row is the only thing that
names the key. **Nothing runs it on a schedule** — there is no scheduler in this
repo and no deployment to put one on (§11.2) — so unreferenced bytes stay until
an operator collects them, which is the safe direction for that to fail.

**The cloud stores an image once; a local document carries its own.** Local
(IndexedDB) documents keep data URIs — a signed-out browser can resolve neither
a blob URL nor an IndexedDB that holds no blobs — so the conversion happens at
the four boundaries rather than in storage (§11.1): `/api/export` bundles bytes
under `assets/blobs/{hash}`, `localImporter` inlines them back, and
`ingestInlineBlobs` (`src/lib/blobIngest.ts`) stores whatever arrives inline on
`POST /api/documents` and on import. A bundle's blob is **re-hashed on import** —
the filename in an uploaded zip is a claim, not evidence.

docx is the one consumer that needs bytes rather than a URL, because it embeds
its pictures: `/api/docx/[id]` resolves them with `loadBlobs` before the
conversion, which is a synchronous `editorState.read` and cannot fetch.

**A blob is authorized through the documents referencing it, never on its own**
(§4). `BlobRef` is that reference, and it is what `GET /api/blob/[hash]` asks
about — a hash is not a capability, because hashes appear in revision JSON,
export bundles and agent tool output.

Two rules follow, and both are invariants rather than conventions, because
breaking either ends in the collector deleting bytes a document is still using:

- **A write that stores `data` stores `blobHashes` with it**, in the same
  statement, from `blobHashesFor` (`src/lib/blobRefs.ts`). The column is a cache
  of what the content references, and it exists because recomputing it from the
  JSON is 11 MB on the worst document (§3.1).
- **A write that changes the set of revision rows or their content calls
  `reconcileDocumentBlobs(documentId)`** afterwards. It is deliberately quiet —
  bookkeeping must never turn a committed save into a 500 — so a missing call
  fails silently. `grep -rn "reconcileDocumentBlobs" src` is the complete list.

### State Management (Redux Toolkit)

Single app slice at `src/store/app.ts` (~590 lines). Thunks live in
`src/store/thunks/`, split by domain (`postThunks`, `seriesThunks`,
`projectThunks`, `revisionThunks`, `userThunks`, `sessionThunks`,
`storageThunks`, `exportThunks`, `importGuestDrafts`) and are re-exported from
`app.ts`, so existing import paths still resolve. State shape:

```typescript
{
  user?: User,
  posts: EntityState<Post, string>,  // entity adapter — see postsSelectors
  series: Series[],
  projects: Project[],
  ui: { ... }
}
```

Key async thunks:

- Bootstrap: `load` (session → guest-draft import → posts → series → projects)
- Post operations: loadPosts, getPost, createPost, updatePost, deletePost,
  movePost, duplicatePost, forkPost, mergePostsIntoTabs
- Series operations: loadSeries, createSeries, updateSeries, deleteSeries,
  moveSeries
- Project operations: loadProjects, createProject, updateProject, deleteProject,
  moveProject
- Revision operations: getRevision, createRevision, deleteRevision
- User operations: updateUser, alert
- Storage: getStorageUsage, getPostThumbnail

### Repository Pattern

Business logic is organized in repository files (`src/repositories/`):

- `document.ts`: Document CRUD, paged author listings, public listings
- `series.ts`: Series management and post organization
- `project.ts`: Projects (named groupings of series)
- `notes.ts`: Sticky-note canvases and notes
- `ordering.ts`: Server-side `rank` computation and container moves, in
  transactions (pairs with `src/lib/ordering.ts`, which mints the keys)
- `revision.ts`: Version control operations
- `user.ts`: User profile operations

Selectors come in owner-scoped and public variants where both exist — e.g.
`findSeriesById` returns a series whole and must only be given to a proven
author, while `findPublicSeriesById` and `findAllSeries` filter to published,
non-private posts and omit author emails. Reach for the public one on any path
an anonymous caller can hit.

### API Routes (Next.js App Router)

API routes are in `src/app/api/`:

- `/api/documents/*`: Document management (posts are Documents; there is no
  `/api/posts` route)
- `/api/series/*`, `/api/projects/*`: Organization
- `/api/revisions/*`: Revision history
- `/api/notes/*`: Sticky-note canvases
- `/api/users/*`: User profiles
- `/api/auth/[...nextauth]`: NextAuth authentication
- `/api/completion`, `/api/copilot`: AI endpoints (Anthropic, Google, Ollama,
  Azure OpenAI)
- `/api/import`, `/api/export`: Backup bundles (.zip)
- `/api/attachments/*`: Uploaded file access
- `/api/docx/*`, `/api/pdf/*`: Export functionality
- `/api/og`: Open Graph image generation
- `/api/thumbnails/*`: Document thumbnails
- `/api/health`: Liveness/readiness probe
- `/api/mcp`: The remote MCP endpoint — the same ten tools as the stdio
  server, authenticated by an agent token. POST only; stateless; three
  token-bucket budgets per token (requests → 429, reads and writes separately →
  a tool error), a 1 MiB body cap, and **426 on plain HTTP to a non-loopback
  host** unless `MCP_ALLOW_INSECURE=1` (a bearer token in cleartext is the
  credential given away). Writes record `claude-code:<token name>` as their
  origin, so the review rail says which credential proposed

Server actions have a 2MB body size limit (configured in `next.config.ts`).

#### Route conventions

Every handler is wrapped in one of four route wrappers from
`src/lib/api-utils.ts`. The wrapper both handles errors — a thrown `ApiError`
becomes a `{ error: { title, subtitle } }` response, anything else a 500 — and
resolves the caller, so `context.user` is only in scope if the route asked for
it:

- `userRoute` — requires a signed-in, non-disabled user; `context.user` is a
  `SessionUser`. 401 when absent, 403 when the account is disabled.
- `optionalUserRoute` — `context.user` is `SessionUser | null`, for routes with
  both a public and a signed-in branch. A disabled account is still rejected.
- `publicRoute` — no auth. **`grep -rn "publicRoute" src/app/api` is the
  complete list of unauthenticated surfaces**, which is the reason this is a
  separate name rather than the absence of a call.
- `tokenRoute` — an `Authorization: Bearer blog_pat_…` agent token instead of a
  session; `context.token` carries `userId` and `scopes`, and there is no
  `context.user` (the disabled-account rule is applied during verification, and
  fetching the row would be a query per request for something no handler reads).
  Every bad credential gets the same 401 with `WWW-Authenticate: Bearer` —
  unknown, revoked and expired must stay indistinguishable, or the endpoint
  confirms which secrets were once real. Only `/api/mcp` uses it.

`context.params` is already awaited. Pass the shape as the type argument:
`userRoute<{ id: string }>(async (request, { params, user }) => …)`. Options go
last: `{ errorLabel, signInMessage }`.

Two ESLint rules in `eslint.config.mjs` keep this total, because the whole value
of the scheme is that a missing declaration is impossible rather than merely
discouraged: `no-restricted-syntax` rejects a handler exported without a
wrapper, and `no-restricted-imports` bars `getServerSession` and `authOptions`
from `src/app/api/**`. Exemptions are `api/auth/**` (it _is_ the auth handler)
and `api/og` (edge runtime, reads nothing).

Request bodies are validated, not cast. `(await request.json()) as SomeType` is
a compile-time fiction over attacker-controlled JSON, and a third
`no-restricted-syntax` rule bans `request.json()` under `src/app/api/**` for
that reason. Read a body with `parseBody(request, schema)` from
`src/lib/api-utils.ts`, which 400s with the offending field path.
(`request.formData()` and `.text()` are untouched — the upload and export routes
need them.)

Prefer `.strict()` on update schemas. A field you did not mean to expose is then
a 400 naming it rather than a silent write: that is what keeps `parentId` /
`seriesId` / `rank` out of `PATCH /api/documents/[id]`, where passing one used
to reparent a document into any other post with no check on the destination.
Container changes belong to the `/move` routes, which authorize the destination,
refuse parent cycles and mint a rank — and `PostUpdateInput` omits those three
fields so the client cannot express the mistake either. Document schemas live in
`src/app/api/documents/schemas.ts`; smaller ones sit in the route file.

Authenticating is not authorizing. Do not call a `find…` function and then
compare author ids by hand — use the authorized fetches in `src/lib/access.ts`,
which return the row only after proving the caller may have it, so forgetting
the check is a missing variable rather than a missing line:

- `requireDocument(id, user, access)` where access is `own` (acts on the
  document: rename, delete, attach, move), `write` (edits content: editor, save
  a revision, status) or `read` (published-and-not-private, thumbnails, forks).
  The full rule per mode is a single table in that file.
- `requireRevision(id, user, access)` — follows the parent document. A revision
  id is not a bearer token.
- `requireCanvas` / `requireOwnedNote` — a note's owner lives on its canvas.
- `requireOwnedSeries` / `requireOwnedProject`.

For ids arriving in a request _body_, a batch must be checked as a whole — see
`findUnownedDocumentIds`, which answers for every id in one query so that
checking only the first is not an available mistake.

Filenames from outside the app — URL segments, entries inside an uploaded zip —
go through `resolveWithin` (`src/lib/safePath.ts`) before they become a path on
disk. It is the only export: taking a basename without re-resolving it against
the destination directory is half a guarantee, so that half is not reachable.

### Lexical Editor

The rich text editor is a workspace package, `packages/editor` — not part of
`src/`. The `@/editor/*` alias points at `packages/editor/src/*`, so import
paths read the same as before the extraction (docs/plans/archive/haklex-adoption.md §4).

**It is on a different design system to the rest of the app, deliberately.** The
app shell is MUI + DESIGN.md; the editor package is vanilla-extract + Base UI
against its own `--ed-*` token contract in
`packages/editor/src/styles/tokens.css.ts`, so that haklex's component code
ports in unrewritten (§5). The package has zero `@mui/*` imports and an ESLint
`no-restricted-imports` rule in `eslint.config.mjs` keeps it that way. The
`--ed-*` colors alias `--mui-palette-*`, so the two systems share one palette
and one dark-mode switch (`html.dark`) without sharing a component library —
DESIGN.md §19 governs both. Base UI primitives live in `packages/editor/src/ui`;
add to that directory rather than reaching back across the seam.

**Editor Structure:**

- `Editor.tsx`: Main editor component
- `config.tsx`: Editor configuration and theme
- `theme.css` / `theme.tsx`: Content styling (the document's own CSS, which is
  not on the `--ed-*` contract — it is what `exportDOM` and `/view` also render)
- `styles/tokens.css.ts`: the `--ed-*` chrome contract

**Custom Nodes** (`packages/editor/src/nodes/`):

- Math equations (MathLive integration)
- Graphs (Geogebra integration)
- Sketches (Excalidraw integration)
- Images, Tables, Code blocks
- Horizontal rules, Page breaks
- Collapsible sections, Sticky notes

**Plugins** (`packages/editor/src/plugins/`):

- Core: FloatingToolbar, DragDropPastePlugin, SavePlugin
- Content: MathPlugin, GraphPlugin, SketchPlugin, ImagePlugin, AttachmentPlugin
- Formatting: CodePlugin, ListPlugin, MarkdownPlugin
- Layout: LayoutPlugin, TablePlugin, KanbanPlugin
- Features: LinkPlugin, ComponentPickerPlugin, NodeSelectionPlugin

### Component Organization

Key UI components (`src/components/`):

- **BlogManager**: Main blog management interface
- **PostsList**: Display and manage posts
- **SeriesGrid** / **SeriesView** / **SeriesCard**: Series organization UI
- **DocumentBrowser**: Browse and search documents
- **EditDocument**: Document editing interface
- **DocumentActions** / **SeriesActions**: Action menus
- **TrashBin**: Soft delete management
- **NotesCanvas**: Canvas for sticky notes
- **Auth**: Authentication components
- **Layout**: Page layouts and structure

### Path Aliases

TypeScript path aliases are configured:

- `@/*` → `src/*`
- `@public/*` → `public/*`

### Environment Variables

Required environment variables (see `.env.example`):

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET`: NextAuth configuration
- `PUBLIC_URL`: Public base URL of the app

At least one OAuth provider. `src/lib/auth.ts` registers whichever of these has
both halves set, and the login UI reads the resulting list back from
`/api/auth/providers` — so the buttons always match what the server can serve.
With neither configured, sign-in is unavailable and the server logs an error at
startup.

- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth

Registration is open: anyone who completes an OAuth sign-in gets an account.
Access is managed by who is given the URL. The only sign-in refusal is an
account with `disabled` set.

Optional:

- `AI_CREDENTIAL_KEYS` (+ `AI_CREDENTIAL_KEY_VERSION`): the key-encryption keys
  for users' own provider keys. **There is no `ANTHROPIC_API_KEY` or
  `GOOGLE_GENERATIVE_AI_API_KEY` or `AZURE_API_KEY` any more** — each user
  brings their own and enters it in Settings, and nothing reads a deployment
  key. Format is `version:base64`, 32 bytes each, canonical base64; see
  docs/plans/archive/byo-provider-keys.md §4.2 and `.env.example` for the generator
  command. Without it, saving a key fails and every stored key is unreadable.
- AI endpoints, which stay deployment config because a user-supplied URL would
  be an SSRF gadget (§4.5): `OLLAMA_API_URL`, `AZURE_OPENAI_BASE_URL`,
  `AZURE_OPENAI_API_VERSION`
- `NEXT_PUBLIC_FASTAPI_URL`: External FastAPI backend URL
- `BROWSERLESS_URL`: For PDF generation (falls back to local Puppeteer)
- `UPLOADS_DIR`: Where attachments are written. Defaults to `<cwd>/var/uploads`.
  Must stay outside `public/` — see `src/lib/uploads.ts`; anything in the static
  tree is served with no session and no authorization check, bypassing
  `/api/attachments`. Point it at a mounted volume in production.
- `MCP_AUTHOR_ID`: which user the **stdio** MCP server acts as (a `User` id or
  email). Lives in `.env` like everything else — `.mcp.json` is committed, so an
  author named there would be one person's identity imposed on every clone. The
  server loads it via `--env-file=.env`, so nothing needs exporting by hand.
- `MCP_ALLOW_INSECURE=1`: accept an agent token at `/api/mcp` over plain HTTP to
  a non-loopback host. Only for a transport that is already private — an ssh
  tunnel, Tailscale, a proxy that forwards under a different header. Setting it
  on a public deployment publishes the credential.

## Important Notes

### Build Configuration

- ESLint is skipped during build (`eslint.ignoreDuringBuilds: true`)
- Bundle analyzer available with `ANALYZE=true pnpm build`
- PWA support enabled in production
- Webpack configured for MUI modular imports and font handling
- `pnpm install` automatically applies patches via `patch-package` (see
  `/patches/`)

### ESLint Rules

Key rules enforced by `eslint.config.mjs`:

- `no-console`: only `console.warn` and `console.error` are allowed
- `@typescript-eslint/no-explicit-any`: disallowed
- `react-hooks/exhaustive-deps`: enforced
- `no-restricted-syntax` on `grey.*` and numeric shades of semantic colors
  (`primary.50`, `warning.100`, …) — neither responds to the active color
  scheme, and the second resolves to `undefined` and drops. See DESIGN.md §19;
  `pnpm check:theme` covers the CSS spellings of the same mistakes.

### Documentation

Additional documentation is in the `/docs/` directory, including guides on
hydration issues, component architecture, and implementation-specific notes.
Start at [docs/README.md](./docs/README.md), which indexes the rest.

**A plan is not a description of the current tree.** `docs/plans/` holds live
proposals; each states its own status at the top, and that line is the thing to
read first. A plan that ships moves to `docs/plans/archive/` rather than being
deleted, because **the code cites these documents by section number** — 240
comments across 178 files, and two tools (`eslint.config.mjs`'s MUI rule and
`scripts/check-codecs.mjs`) print a path from there in their failure output. So:

- Moving or renaming anything under `docs/plans/` means updating those
  citations. `grep -rn "docs/plans/" --include="*.ts" --include="*.tsx"` finds
  them; the two `prisma/migrations/*.sql` comments are the exception, since
  Prisma checksums an applied migration and will refuse one that changed.
- Archived plans were accurate when they shipped and have drifted since — most
  say `src/editor`, which is `packages/editor/src` now. Read them for _why_ a
  thing is shaped as it is, never for _where_ it lives.

### AI Integration

The application supports multiple AI providers for completion:

- Anthropic (Claude)
- Google (Gemini)
- Ollama (local models)
- Azure OpenAI

Configuration is in `src/lib/ai/`.

## Debugging

- Hydration errors: see `docs/guides/hydration.md`. Common causes are browser
  extensions, date/time SSR mismatches, and `window`/`document` access during
  SSR.
- Use React DevTools for component inspection
