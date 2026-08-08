# IndexedDB origins, and the database rename

## Notes are no longer stored locally

This guide used to describe notes disappearing when switching between
`npm run dev` and `npm run build && npm start`. That is fixed, by the third of
the options it proposed: notes live in Postgres now (`prisma.notesCanvas`,
`/api/notes/*`, read by `src/editor/nodes/CanvasNode/`). The `notesCanvas`
IndexedDB store had no readers left and is no longer declared in
`src/indexeddb/index.ts`.

The migration described below never copied that store, and refused to delete the
legacy database while anything was left in it — so on a profile that held
pre-move notes, the operator dumped them out as JSON before the sweep could
finish (`docs/plans/legacy-idb-retirement.md` §4.2). That was the last decision
the migration was deferring, and it is now closed.

## The origin rule still applies to everything else

IndexedDB is scoped to an origin (protocol + hostname + port), so
`http://localhost:3000` and `http://localhost:3001` are separate stores. Guest
drafts, unacknowledged autosaves, signed-out Copilot threads and saved pane
layouts written against one port are invisible from the other. Run dev and
production builds on the same port locally if you want to see the same data.

## The database rename

The database was named `matheditor`, inherited from the project this app was
forked from. It is now `blog-simple`.

The name is the handle for the store, so renaming it migrates nothing by itself
— it opens a second, empty database and strands every draft in the old one.
`src/indexeddb/migrate.ts` was the copy that made the rename safe. It ran on
every boot from 1 Aug 2026 (`7921af36`) and was **retired on 8 Aug 2026**, once
every profile had been swept and found clean.

What it did, per boot:

1. Opened `matheditor` without a version. If `onupgradeneeded` fired, the open
   had just created it, so there was nothing there — it deleted it again and
   stopped. One side effect outlived it: that probe leaves the name in the
   origin's leveldb, so **grepping a browser profile on disk for `matheditor`
   proves nothing**. Only an `indexedDB.open` answers the question.
2. Diffed the keys in `documents`, `revisions`, `copilotThreads` and
   `pendingSaves` against the new database, copied what was missing, then
   deleted from the legacy database everything the new one was known to hold.
3. Deleted the legacy database outright once nothing worth keeping was left —
   ignoring `attachmentContent`, a cache the server still backs, but *not*
   `notesCanvas`. That step, added last, is what let the migration finish
   instead of re-probing forever.

Three consequences of that shape worth knowing:

- **It was idempotent, and it kept running.** The app ships as a PWA, so a tab
  on a stale service-worker bundle could still be writing to `matheditor` after
  the new code was live; those writes were picked up on the next visit.
- **Deleting the database was self-healing where a marker record would not have
  been.** A stale write recreated the database, and the next boot migrated it
  normally — a "already done" flag would have skipped it forever.
- **Draining is what stopped resurrection.** Without it, a guest draft deleted
  in the new database would have been copied back on the next boot, forever.

`attachmentContent` was never copied: it caches file bodies the server still
has, so it cost the most to move and bought only a cold fetch.

A record whose write failed — most plausibly a `ConstraintError` from the unique
`handle` index on `documents` — was left in the legacy database rather than
dropped, and logged. The failure mode was a retry, never a lost draft.

## What the rename did _not_ remove

Searching the tree for the old name still returns hits, and they are
load-bearing. Two Lexical node type strings are baked into stored content —
`Revision` rows in Postgres, documents in IndexedDB, and `.zip` backups already
on users' disks, which `/api/import` accepts. Lexical throws on a `type` it has
no class for, so `LegacyTableNode` and `LegacyTableCellNode` stay registered as
import aliases, and no migration can retire them: it would not reach the
backups.

Both strings are declared once, in `src/editor/nodes/TableNode/legacyTypes.ts`,
which is where a search for them should land. Current saves already emit
`blog-*`, and `src/editor/nodes/TableNode/__tests__/legacyTypes.test.ts` imports
the constants from that module to guard both spellings.

The only remaining mentions are those two node type strings, their explanatory
comments, their spec, this guide, and the git history. `LEGACY_DATABASE_NAME`
went with `migrate.ts` and `migrationPlan.ts` on 8 Aug 2026;
`docs/plans/legacy-idb-retirement.md` records the sweep that justified deleting
them and the residual risk it accepted.
