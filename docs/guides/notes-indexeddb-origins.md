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

The database carried the upstream project's name, inherited from the fork. It is
now `blog-simple`, and the old name appears nowhere in the tree.

The name is the handle for the store, so renaming it migrates nothing by itself
— it opens a second, empty database and strands every draft in the old one.
`src/indexeddb/migrate.ts` was the copy that made the rename safe. It ran on
every boot from 1 Aug 2026 (`7921af36`) and was **retired on 8 Aug 2026**, once
every profile had been swept and found clean.

What it did, per boot:

1. Opened the old database without a version. If `onupgradeneeded` fired, the
   open had just created it, so there was nothing there — it deleted it again
   and stopped. One side effect outlived it: that probe leaves the name in the
   origin's leveldb, so **grepping a browser profile on disk for a database name
   proves nothing**. Only an `indexedDB.open` answers the question.
2. Diffed the keys in `documents`, `revisions`, `copilotThreads` and
   `pendingSaves` against the new database, copied what was missing, then
   deleted from the legacy database everything the new one was known to hold.
3. Deleted the legacy database outright once nothing worth keeping was left —
   ignoring `attachmentContent`, a cache the server still backs, but _not_
   `notesCanvas`. That step, added last, is what let the migration finish
   instead of re-probing forever.

Three consequences of that shape worth knowing:

- **It was idempotent, and it kept running.** The app ships as a PWA, so a tab
  on a stale service-worker bundle could still be writing to the old database
  after the new code was live; those writes were picked up on the next visit.
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

## The node `type` strings went the same way — and the reasoning was wrong

Two Lexical table node `type` strings carried the upstream spelling. They were
renamed with **compat aliases** (`LegacyTableNode` / `LegacyTableCellNode`,
registered so Lexical had a class for the old `type`), on the argument that the
old spelling was unreachable data — in `Revision` rows, in guests' IndexedDB and
in `.zip` backups "already on users' disks" that `/api/import` accepts. The
conclusion drawn was that no migration could ever retire them.

**That was false, and it survived several readings before anyone checked.** The
app was never deployed, so there were no users and no backups: the entire
population was one Postgres database. A `LIKE '%…%'` scan over every json/jsonb
column found **58 rows in `Revision.data`, across 5 documents**, and nothing
anywhere else — no IndexedDB content, no export bundle on disk. One `UPDATE`
rewrote them, verified byte-identical except the rename, and the aliases,
`legacyTypes.ts` and its spec were deleted on 8 Aug 2026.

The lesson generalises past this repo: **"unreachable" is a measurement, not a
property.** A comment asserting that data cannot be migrated is worth one
`count(*)` before it is believed. Here the check took seconds and retired a
constraint that had been treated as permanent.

**The aliases came back once, hours later, and broke the editor.** The Lexical
0.28 → 0.49 upgrade (`9c5d1b31`) reintroduced them to defend "legacy documents",
without knowing the migration above had already emptied that set — and the
reintroduction was fatal rather than merely redundant, because a class that owns
a type string upstream itself constructs makes every table insertion throw. See
`packages/editor/src/nodes/TableNode/registration.ts` for the mechanism and
`docs/plans/legacy-idb-retirement.md` §10.6 for the sequence. The second lesson,
then: **a migration is only finished when the reason for the workaround is
written where the workaround used to be**, or the next change re-derives it.

Nothing in the tree now carries the upstream name — code, docs or memory.
`docs/plans/legacy-idb-retirement.md` records both halves, and the pre-migration
rows are backed up under `var/backups/`.
