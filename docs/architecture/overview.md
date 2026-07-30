# Architecture Overview

This document describes the layered architecture of the application and the
rules each layer must follow. Read this before making structural changes or
adding new features.

---

## Layer map

```
┌─────────────────────────────────────────────────────┐
│  Next.js App Router pages  (src/app/)               │
│  Server Components · RSC fetch · generateMetadata   │
├─────────────────────────────────────────────────────┤
│  React Components  (src/components/, src/editor/)   │
│  Client Components · UI state · dispatch actions    │
├─────────────────────────────────────────────────────┤
│  State layer  (src/store/)                          │
│  Redux Toolkit · async thunks · single app slice    │
├─────────────────────────────────────────────────────┤
│  Backend seam  (src/store/backend/)                 │
│  PostBackend interface · backendFor(user) picks one │
├──────────────────────┬──────────────────────────────┤
│  cloudBackend        │  localBackend                │
│  src/api/client.ts   │  src/indexeddb/              │
│  HTTP → /api/*       │  Browser IndexedDB           │
├──────────────────────┴──────────────────────────────┤
│  API routes  (src/app/api/)                         │
│  Route handlers · validation · auth checks          │
├─────────────────────────────────────────────────────┤
│  Repositories  (src/repositories/)                  │
│  Business logic · Prisma queries                    │
├─────────────────────────────────────────────────────┤
│  Database  (PostgreSQL via Prisma)                  │
└─────────────────────────────────────────────────────┘
```

---

## Storage duality

A post lives in one of two places, but the difference is hidden behind a single
seam rather than branched on at every call site.

|               | Local                                | Cloud                 |
| ------------- | ------------------------------------ | --------------------- |
| Storage       | Browser IndexedDB (`src/indexeddb/`) | PostgreSQL via Prisma |
| Auth required | No                                   | Yes                   |
| Implements    | `localBackend`                       | `cloudBackend`        |
| Works offline | Yes                                  | No                    |

The `PostBackend` interface (`src/store/backend/index.ts`) has those two
implementations, and `backendFor(user)` picks one from the session alone. Thunks
call the interface, so there is exactly one `createPost`, one `updatePost`, and
so on — everything above the seam is written once.

**Rule:** New persistence operations go on the `PostBackend` interface and get
both implementations. Do not add a call-site branch on whether a user is signed
in, and do not reach past the seam into `apiClient` or `src/indexeddb/` from a
thunk.

> There is no `UserDocument { local?, cloud? }` hybrid type and no paired
> `createLocal*` / `createCloud*` thunks. Both were removed; a post is one flat
> `Post`.

---

## API client

See [api-client.md](./api-client.md) for the full contract.

**Rule:** No file under `src/` (outside of `src/app/api/` itself) may call
`fetch('/api/...')` directly. Use `apiClient` from `@/api`.

---

## Redux store

Single slice in `src/store/app.ts`. Shape:

```ts
{
  user?: User;
  posts: EntityState<Post, string>;   // entity adapter — see postsSelectors
  series: Series[];
  projects: Project[];
  ui: { ... };
}
```

Async thunks use `thunkAPI.fulfillWithValue` / `thunkAPI.rejectWithValue` and
delegate persistence to `backendFor(user)`. They must **not** contain inline
`fetch` calls.

Thunks live under `src/store/thunks/`, split by domain (`postThunks`,
`seriesThunks`, `projectThunks`, `revisionThunks`, `userThunks`,
`sessionThunks`, `storageThunks`, `exportThunks`, `importGuestDrafts`) and are
re-exported from `store/app.ts`, so existing import paths still resolve.

**Rule:** Components that need data should read from the Redux store via
`useSelector`. Direct API fetches in components are only acceptable for data
that is transient, not global, and not needed by other components — and even
then must go through `apiClient`.

---

## Cache revalidation

After any client-side mutation:

1. The **API route** calls `revalidatePath()` (forward-compat, currently inert
   because `dynamic = "force-dynamic"`).
2. The **component or thunk** calls `router.refresh()` after a successful
   mutation to trigger a server re-fetch of the current page.

`router.refresh()` is the only mechanism that actually causes RSC data to update
today. Do not skip it.

---

## Repositories

Business logic belongs in `src/repositories/`, not in API routes or components.
API routes call repository functions; they do not contain Prisma queries
themselves.

```
src/repositories/
├── document.ts   – Document CRUD, paged author listings, public listings
├── series.ts     – Series management and post organization
├── project.ts    – Projects (named groupings of series)
├── notes.ts      – Sticky-note canvases and notes
├── ordering.ts   – Server-side `rank` computation and container moves
├── revision.ts   – Version control
└── user.ts       – Profile operations
```

Selectors come in owner-scoped and public variants where both exist — e.g.
`findSeriesById` returns a series whole and must only be given to a proven
author, while `findPublicSeriesById` filters to published, non-private posts.
Reach for the public one on any path an anonymous caller can hit.

Authorization is not the repository's job: routes fetch through the authorized
helpers in `src/lib/access.ts` (`requireDocument`, `requireRevision`,
`requireOwnedSeries` …), which return the row only after proving the caller may
have it. See the route conventions in [CLAUDE.md](../../CLAUDE.md).

---

## Component organisation

```
src/components/
├── <Feature>/
│   ├── index.tsx          – public component export
│   ├── hooks/             – feature-scoped hooks
│   └── components/        – private sub-components
```

Components must not:

- Call `fetch` directly — use `apiClient`
- Contain Prisma queries or server-only imports
- Manage global state — dispatch Redux actions instead

---

## Editor (Lexical)

Custom nodes live in `src/editor/nodes/`. Plugins live in `src/editor/plugins/`.
The editor is client-only; never import editor internals in server components or
API routes.

---

## Naming conventions

| Thing               | Convention                                                           |
| ------------------- | -------------------------------------------------------------------- |
| Thunk               | verb-first, storage-agnostic: `createPost`, `updatePost`, `movePost` |
| Backend method      | `PostBackend` member, implemented by both `cloud.ts` and `local.ts`  |
| API client method   | `apiClient.<resource>.<verb>()`                                      |
| Repository function | verb-first: `createDocument`, `getDocumentById` …                    |
| Response type       | `Get*Response`, `Post*Response`, `Patch*Response`, `Delete*Response` |

---

## Checklist for new features

- [ ] HTTP calls use `apiClient` — no bare `fetch('/api/...')`
- [ ] New routes have a corresponding `apiClient` method added to
      `src/api/client.ts`
- [ ] New request/response types are in `src/api/types.ts` or `src/types.ts`,
      not inline
- [ ] New persistence operations are `PostBackend` methods implemented in both
      `backend/cloud.ts` and `backend/local.ts` — no call-site branch on auth
- [ ] Mutations in components call `router.refresh()` after success
- [ ] Business logic is in `src/repositories/`, not in route handlers
- [ ] Route handlers are wrapped in `userRoute` / `optionalUserRoute` /
      `publicRoute`, read bodies with `parseBody`, and fetch rows through
      `src/lib/access.ts` — never a `find…` plus a hand-written id comparison
- [ ] No `console.log` — only `console.warn` and `console.error` (ESLint rule)
- [ ] No `any` types (ESLint rule `@typescript-eslint/no-explicit-any`)
- [ ] `react-hooks/exhaustive-deps` is satisfied — no disabled eslint comments
      without a written explanation
