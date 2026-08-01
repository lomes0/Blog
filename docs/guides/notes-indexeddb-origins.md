# IndexedDB origins, and the database rename

## Notes are no longer stored locally

This guide used to describe notes disappearing when switching between
`npm run dev` and `npm run build && npm start`. That is fixed, by the third of
the options it proposed: notes live in Postgres now (`prisma.notesCanvas`,
`/api/notes/*`, read by `src/editor/nodes/CanvasNode/`). The `notesCanvas`
IndexedDB store had no readers left and is no longer declared in
`src/indexeddb/index.ts`.

Whatever a browser still holds in that store is untouched — the migration below
does not copy it and does not delete it. If notes created before the move to
Postgres are still owed to anyone, that data is in the legacy database under the
`notesCanvas` store, and recovering it is a separate job.

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
— it opens a second, empty database. `src/indexeddb/migrate.ts` is the copy that
makes the rename safe, and it runs before `setupIndexedDB` sets the flag every
store action waits on, so nothing can read or write mid-copy.

What it does, per boot:

1. Opens `matheditor` without a version. If `onupgradeneeded` fires, the open
   just created it, so there was nothing there — it deletes it again and stops.
2. Diffs the keys in each of `documents`, `revisions`, `copilotThreads` and
   `pendingSaves` against the new database, copies what is missing, and then
   deletes from the legacy database everything the new one is now known to hold.

Two consequences of that shape worth knowing:

- **It is idempotent, and it keeps running.** The app ships as a PWA, so a tab
  on a stale service-worker bundle can still be writing to `matheditor` after
  the new code is live. Those writes get picked up on the next visit. Once the
  legacy database is drained the cost is one open and one `getAllKeys` per
  store.
- **Draining is what stops resurrection.** Without it, a guest draft deleted in
  the new database would be copied back in on the next boot, forever.

`attachmentContent` is not copied: it caches file bodies the server still has,
so it costs the most to move and buys a cold fetch.

A record whose write fails — most plausibly a `ConstraintError` from the unique
`handle` index on `documents` — is left in the legacy database rather than
dropped, and logged. The failure mode is a retry, never a lost draft.

## What the rename did *not* remove

`rg matheditor` still returns hits, and they are load-bearing. The Lexical node
types `matheditor-table` and `matheditor-tablecell` are baked into stored
content: `Revision` rows in Postgres, documents in IndexedDB, and `.zip` backups
already on users' disks, which `/api/import` accepts. Lexical throws on a `type`
it has no class for, so `LegacyTableNode` and `LegacyTableCellNode` stay
registered as import aliases. Current saves already emit `blog-*`;
`src/editor/nodes/TableNode/__tests__/legacyTypes.test.ts` guards both spellings.
