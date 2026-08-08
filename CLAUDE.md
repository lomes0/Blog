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

Asked to read or change a *post* — as opposed to the code that renders one —
use the `blog-content` MCP tools, not the repo. Posts are rows in Postgres
holding Lexical JSON; there is no file to open. Start with `outline` for the
block addresses every other tool takes, and let the tool descriptions carry the
rest — they are the reference, and they are already in context.

Three things they do not say about themselves: only cloud content is visible
(anything created while signed out lives in browser IndexedDB and never reaches
the server), `apply_ops` proposes rather than commits (report an edit as
awaiting the author, never as done), and there is no delete tool. Setup and the
remaining caveats are in
[docs/guides/claude-code-content.md](./docs/guides/claude-code-content.md).

## Development Commands

### Core Development

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
```

### Maintenance

```bash
npm run clean        # Remove .next and cached files
npm run rebuild      # Clean and rebuild
npx prisma generate  # Generate Prisma client
npx prisma migrate dev # Run database migrations
npx prisma studio    # Browse database in browser UI
```

### Testing

```bash
npm test             # Vitest, single run
npm run test:watch   # Vitest, watch mode
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

Coverage is 21 specs, 410 tests: `src/lib/__tests__/ordering.test.ts`
(fractional rank keys),
`src/components/Layout/SideBar/__tests__/
dragGeometry.test.ts` (sidebar drag
thresholds — `dragGeometry.ts` is kept import-free precisely so it is testable
without a browser),
`src/store/__tests__/workspace.test.ts` (the `ui.workspace` reducers — pane
focus, the one-document-one-pane invariant, dirty hoisting, and the URL replayed
over a restored layout), `src/lib/__tests__/workspaceUrl.test.ts` (when the
address bar may be rewritten to follow pane focus),
`src/commands/__tests__/toolParity.test.ts` (that the AI tool surface stays
derivable from the command registry — see docs/plans/workspace-panes.md §3.1),
`src/components/EditDocument/__tests__/tabFit.test.ts` (which pane tabs fit the
strip and which fall into the overflow menu),
`src/lib/__tests__/scrollMemory.test.ts` (restoring a
document to where it was left — what a stored offset map may contain, and when a
restore has settled versus is still waiting on content that has not rendered),
and four for the content bridge (`src/lib/content-bridge/__tests__/`) —
`inline.test.ts` (that a block's inline formatting survives a Markdown
round-trip, over a corpus of literal marker characters plus 400 randomized
runs), `ops.test.ts` (the plan's central claim: a block nobody named comes out
byte-identical, plus snapshot addressing, atomicity and the freshness guard) and
`outline.test.ts` (addressing, descriptors for blocks with no codec, and the
content hash) and `codecs.test.ts` (a round-trip per graduated block type over a
node with every optional field populated — the obligation
docs/plans/claude-code-lexical.md §4.6.1 attaches to graduating one — which now
also feeds each of those nodes to the zod schema in `content-bridge/schema.ts`,
so a type that gains a codec without gaining a schema arm, or the reverse, fails
rather than working on one agent and not the other), and
`src/editor/utils/__tests__/virtualRepo.test.ts` (the Copilot's view of the
library — that a search hit carries a block address a later tool can act on,
rather than a line number no other tool accepts). Two more cover phase 5:
`src/lib/content-bridge/__tests__/blockId.test.ts` (that a persistent id keeps
naming its block after the tree shifts above it, that a write stamps only what
it touched, and that a read never stamps) and
`src/editor/nodes/__tests__/serialization.test.ts` (that a stored node survives
a load — `importJSON` is the only parse path, so a class that does not delegate
to `updateFromJSON` silently drops node state _and_ element format/indent/
direction; five classes did). `npm run check:nodes` enforces the same rule
statically across every node class, including the `.tsx` ones the test
environment cannot parse. The newest two both gate an agent's writes:
`src/lib/__tests__/proposals.test.ts` (that a head repair falls back to history
rather than promoting a pending proposal, and that squashing a second batch onto
one carries `baseRevisionId` through untouched while `version` advances; see
docs/plans/agent-gating.md §3.2, where refreshing that one field is the silent
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
not a spec — as is anything about `mcp/`, which has no test environment.

All of these follow the same rule as `dragGeometry.ts`: the logic lives in an
import-free module so it can be exercised without mounting anything. The DOM
half of the scroll restore is
`components/EditDocument/hooks/useScrollMemory.ts`, and it is uncovered:
finding the right scroller and re-asserting an offset as content settles are
both things only a real browser answers.

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

Type-check and lint with `npx tsc --noEmit` and `npm run lint`. After touching
anything in `src/editor/nodes/`, run `npm run check:nodes`. For UI changes also
run `npm run check:theme`, which catches colors that do not respond to the
light/dark toggle (DESIGN.md §19).

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
  - Has optional background images
- **Series**: Organizes posts into multi-part content series
- **Revision**: Version history for documents, stored as JSON
- **DocumentCoauthers**: Many-to-many relationship for collaborative editing
- **Account/Session/VerificationToken**: NextAuth models

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

Server actions have a 2MB body size limit (configured in `next.config.ts`).

#### Route conventions

Every handler is wrapped in one of three route wrappers from
`src/lib/api-utils.ts`. The wrapper both handles errors — a thrown `ApiError`
becomes a `{ error: { title, subtitle } }` response, anything else a 500 — and
resolves the session, so `context.user` is only in scope if the route asked for
it:

- `userRoute` — requires a signed-in, non-disabled user; `context.user` is a
  `SessionUser`. 401 when absent, 403 when the account is disabled.
- `optionalUserRoute` — `context.user` is `SessionUser | null`, for routes with
  both a public and a signed-in branch. A disabled account is still rejected.
- `publicRoute` — no auth. **`grep -rn "publicRoute" src/app/api` is the
  complete list of unauthenticated surfaces**, which is the reason this is a
  separate name rather than the absence of a call.

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
go through `resolveWithin`/`safeBasename` (`src/lib/safePath.ts`) before they
become a path on disk.

### Lexical Editor

The rich text editor is built with Lexical (`src/editor/`):

**Editor Structure:**

- `Editor.tsx`: Main editor component
- `config.tsx`: Editor configuration and theme
- `theme.css` / `theme.tsx`: Styling and theming

**Custom Nodes** (`src/editor/nodes/`):

- Math equations (MathLive integration)
- Graphs (Geogebra integration)
- Sketches (Excalidraw integration)
- Images, Tables, Code blocks
- Horizontal rules, Page breaks
- Collapsible sections, Sticky notes

**Plugins** (`src/editor/plugins/`):

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

- AI APIs: `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OLLAMA_API_URL`
- Azure OpenAI: `AZURE_API_KEY`, `AZURE_OPENAI_BASE_URL`,
  `AZURE_OPENAI_API_VERSION`
- `NEXT_PUBLIC_FASTAPI_URL`: External FastAPI backend URL
- `BROWSERLESS_URL`: For PDF generation (falls back to local Puppeteer)
- `UPLOADS_DIR`: Where attachments are written. Defaults to `<cwd>/var/uploads`.
  Must stay outside `public/` — see `src/lib/uploads.ts`; anything in the static
  tree is served with no session and no authorization check, bypassing
  `/api/attachments`. Point it at a mounted volume in production.

## Important Notes

### Build Configuration

- ESLint is skipped during build (`eslint.ignoreDuringBuilds: true`)
- Bundle analyzer available with `ANALYZE=true npm run build`
- PWA support enabled in production
- Webpack configured for MUI modular imports and font handling
- `npm install` automatically applies patches via `patch-package` (see
  `/patches/`)

### ESLint Rules

Key rules enforced by `eslint.config.mjs`:

- `no-console`: only `console.warn` and `console.error` are allowed
- `@typescript-eslint/no-explicit-any`: disallowed
- `react-hooks/exhaustive-deps`: enforced
- `no-restricted-syntax` on `grey.*` and numeric shades of semantic colors
  (`primary.50`, `warning.100`, …) — neither responds to the active color
  scheme, and the second resolves to `undefined` and drops. See DESIGN.md §19;
  `npm run check:theme` covers the CSS spellings of the same mistakes.

### Documentation

Additional documentation is in the `/docs/` directory, including guides on
hydration issues, component architecture, and implementation-specific notes.

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
