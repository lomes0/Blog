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

There is no test runner configured in `package.json`. A single spec exists at
`src/lib/__tests__/ordering.test.ts`, written in `describe`/`it`/`expect` shape
so it runs as-is once Vitest/Jest is wired up — but nothing executes it today.

This means no automated check covers API authorization. Verify behaviour changes
by running the app against the local Postgres (`docker compose up -d`) and
exercising the routes directly. Type-check and lint with `npx tsc --noEmit` and
`npm run lint`.

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
so there are no paired `createLocal*` / `createCloud*` variants; everything above
the seam is written once.

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

Handlers wrap in `withApiHandler` (`src/lib/api-utils.ts`), which turns a thrown
`ApiError` into a `{ error: { title, subtitle } }` response and anything else
into a 500. Authorization uses the helpers from the same module rather than
hand-rolled session checks:

- `requireUser(subtitle?)` — the signed-in, non-disabled user, or throws
- `optionalUser()` — the user or `null`, for routes with a public branch
- `requireOwner(ownerId, user, subtitle)` — throws unless `ownerId` is the user

Authenticating is not authorizing. Every route that takes an id must also prove
the caller owns (or may read) *that* record — including ids in a request body,
where a batch must be checked as a whole (see `findUnownedDocumentIds`). Several
routes previously authenticated and then acted on any id passed to them.

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

- **Playground**: Standalone editor component
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
