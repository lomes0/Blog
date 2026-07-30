# Notes Override Bug

## Issue

Notes appear to be deleted when switching between `npm run dev` and
`npm run build + start` environments.

## Root Cause

Notes are stored in **IndexedDB** (database name: `matheditor`, version: 4)
which is origin-specific. Each origin (protocol + hostname + port) maintains a
separate IndexedDB instance.

- `npm run dev` typically runs on `http://localhost:3000`
- `npm run build + start` runs on a different port (e.g.,
  `http://localhost:3001`)

Since these are different origins, they have completely separate IndexedDB
storage. Notes created in one environment are not accessible in the other.

## Affected Code

- `/src/indexeddb/index.ts` - IndexedDB configuration
- `/src/hooks/useNotesStore.ts` - Notes storage hook using IndexedDB
- `/src/components/NotesCanvas/` - Notes UI components

## Potential Solutions

### 1. Use Same Port (Quick Fix)

Configure both dev and production to use the same port locally:

- Add `-p 3000` flag to production start command
- Or configure PORT environment variable

### 2. Export/Import Feature (Medium)

Add UI functionality to:

- Export notes as JSON file
- Import notes from JSON file
- Allow users to manually migrate data between environments

### 3. Backend Storage (Comprehensive)

Move notes storage from IndexedDB to PostgreSQL:

- Add notes tables to Prisma schema
- Create API routes for CRUD operations
- Persist notes server-side across all environments
- Requires authentication integration

## Status

**Unresolved** - To be fixed in future update
