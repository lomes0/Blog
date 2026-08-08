# Retiring the fork's name, once and for all

**Status:** COMPLETE, 8 Aug 2026. §§0–9 retire the **IndexedDB database name**:
Phase 1 made a profile retire itself, Phase 2 built the tools to prove an origin
clean, Phase 3 swept every origin that exists, Phase 4 deleted all of it — 445
lines plus the tools. **§10 then retires the two Lexical table `type` strings**,
which §7.3 had declared permanent; that judgement was wrong, and 58 rows of
`UPDATE` disposed of it.

The upstream name now appears **nowhere in the tree** — not in code, docs or
memory. Only git history still carries it.

§9 records where this plan's own analysis was wrong and what corrected it.

---

## 0. The thesis

`src/indexeddb/migrate.ts` is correct and it works. What it lacks is an ending.
It drains records as it copies them, but it never deletes the database it
drained, so `openLegacyDatabase()` keeps returning a handle forever and every
boot on every once-forked profile pays an open, four `getAllKeys` calls and a
close to discover there is nothing to do. Nothing anywhere records that the
migration ran, so no calendar date for deleting the code is better than a guess.

"Once and for all" is achievable, but not by reaching other people's browsers —
IndexedDB is origin-scoped and client-side, and there is no server-side
migration to write. It is achievable because the applier is already portable:
**the migration runs on every boot** (`src/indexeddb/index.ts:131`), so loading
the app on an origin in a profile *is* applying it, on any device, any browser,
any deployment. The two things missing are permanence and proof, and both are
small.

The order matters. Permanence first (§3), because the sweep in §5 is only
meaningful once a visited profile stays fixed.

---

## 1. What is actually left

At the start, a case-insensitive search for the upstream name returned 25
matches in 12 files, in two groups:

| Value                                   | Sites                                                         | Fate                                                                   |
| --------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The database name                       | `migrate.ts:12` + 3 uses                                      | **Deleted** (§3–§6), with `migrate.ts` + `migrationPlan.ts` + spec |
| The two table `type` strings            | `TableNode/legacyTypes.ts:17-18`, `blocks.ts:206,210`, `address.ts:37` | First judged **permanent**; that was wrong — **deleted** (§10) |
| Comments explaining the above           | `index.ts:54`, `legacyTypes.ts:13`, `blocks.ts:199`, `address.ts:35` | Stay; the two about the database name go with it                |
| Git log, `docs/plans/*`, `docs/guides/*` | 11 sites                                                      | Historical record, not references                                      |

The deletable total is **445 lines**: `migrate.ts` (254), `migrationPlan.ts`
(81), `__tests__/migrationPlan.test.ts` (110).

### 1.1 What lives in the legacy database

The legacy database is at version 5, so it holds `documents`, `revisions`,
`attachmentContent`, `pendingSaves` and `notesCanvas`. Three categories:

- **Migrated** — `documents`, `revisions`, `pendingSaves`, and `copilotThreads`
  if present (`MIGRATED_STORES`, `migrate.ts:25`). Copied and drained today.
- **Disposable** — `attachmentContent`, a cache of file bodies the server still
  has. Deliberately not copied. Safe to destroy.
- **Undecided** — `notesCanvas`. Notes moved to Postgres and nothing has read
  the store since, but `migrate.ts:20-24` explicitly declined to decide whether
  pre-move notes are still owed to anyone. It is not in the current config at
  all, so it exists *only* in the legacy database. **This plan forces that
  decision** (§4.2), because deleting the database destroys it.

---

## 2. Why it cannot finish today

Two defects, both in `migrate.ts`:

**2.1 The legacy database is never deleted.** `drainLegacy` (`migrate.ts:153`)
empties the migrated stores, but the database survives with its schema,
`attachmentContent` and `notesCanvas`. Every subsequent boot re-probes it. The
cost is small and permanent, and — more to the point — the profile never reaches
a state distinguishable from "not yet migrated".

**2.2 The early returns are the common case.** For an already-drained profile,
control leaves at `migrate.ts:216` (`stores.length === 0`) or `:221`
(`active.length === 0`). Those are precisely the paths that must learn to delete
the database, which is why §3 is a restructure rather than an append. I earlier
estimated this at ~15 lines; it is closer to 40.

---

## 3. Phase 1 — make a profile retire itself

**File:** `src/indexeddb/migrate.ts`.

### 3.1 Count with `count()`, not `getAllKeys()`

`readKeys` filters to string keys (`migrate.ts:88-92`), which is right for
planning a copy — a non-string key is left behind rather than guessed at — and
**wrong for an emptiness check**, where it would report a store holding
non-string-keyed records as empty and authorise destroying them. The spent-check
gets its own counter over `store.count()`.

### 3.2 The gate

Delete the legacy database when every store in it is empty, **ignoring
`attachmentContent`** and requiring `notesCanvas` to be empty.

Ignoring `attachmentContent` is not optional: it is a cache that any profile
which opened a document with an attachment will have populated, so gating on it
would mean the database is never deleted on exactly the profiles that used the
app most. (My earlier suggestion to gate on "every store empty, no product call
needed" was wrong for this reason — the notes decision cannot be dodged.)

```ts
/** Destroyed with the legacy database. A cache the server still backs. */
const DISPOSABLE_STORES: readonly string[] = ["attachmentContent"];

/** True when nothing worth keeping is left in the legacy database. */
async function legacyIsSpent(legacy: IDBDatabase): Promise<boolean> {
  const stores = Array.from(legacy.objectStoreNames).filter(
    (name) => !DISPOSABLE_STORES.includes(name),
  );
  if (stores.length === 0) return true;
  const tx = legacy.transaction(stores, "readonly");
  const counts = await Promise.all(
    stores.map((name) => promisify(tx.objectStore(name).count())),
  );
  return counts.every((count) => count === 0);
}
```

### 3.3 The deletion

```ts
function deleteLegacyDatabase(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DATABASE_NAME);
    // `onblocked` fires when another tab still holds it open. Give up quietly;
    // the next boot that finds it spent tries again. Same for an error: the
    // database staying is never worse than the app failing to start.
    request.onblocked = () => resolve();
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}
```

### 3.4 Wiring it into the early returns

`legacyIsSpent` needs the open handle, and `deleteDatabase` needs it closed, so
the check happens inside the `try` and the deletion after the `finally`:

```ts
  let spent = false;
  try {
    // …existing body; every `return` becomes `spent = await legacyIsSpent(legacy)`
    // followed by a fall-through, so the drained paths reach the delete.
    await drainLegacy(legacy, plans, written);
    spent = await legacyIsSpent(legacy);
  } finally {
    legacy.close();
    target?.close();
  }
  if (spent) await deleteLegacyDatabase();
```

Once deleted, the next boot's probe takes the `onupgradeneeded` branch, deletes
the empty database it just created and resolves `null` (`migrate.ts:72`) — zero
work, permanently.

### 3.5 Why this beats a marker record

`migrate.ts:180-186` rejects a one-shot marker because the app ships as a PWA
and a tab on a stale service-worker bundle can keep writing to the old database
after this code is live. Deleting the database honours that reasoning rather
than working around it: a stale bundle's write **recreates** the database, and
the next boot migrates it normally. A `localStorage` flag would have reopened
exactly the hole that comment closes. This is self-healing; a marker is not.

### 3.6 Tests

`migrationPlan.ts` is unchanged, so its spec stands. The new logic is
`IDBDatabase`-shaped and lives in `migrate.ts`, which CLAUDE.md already records
as browser-only and uncovered. Add no spec; verify with §4.

### 3.7 The doc fix, same commit

`docs/plans/upstream-scrub.md:512` still lists under *What this does not fix*:
that `src/indexeddb/index.ts` still kept the upstream database name. That was
overtaken by `7921af36` a week later — `index.ts:56` reads `"blog-simple"`. It
was the only factually wrong reference in the repo. Rewrite it to
point here.

---

## 4. Phase 2 — the portable probe

Two artefacts, because they answer to two different situations.

### 4.1 `scripts/legacy-idb-probe.js` — paste anywhere

A dependency-free async IIFE that opens the legacy database without a version,
reports per-store `count()`, and resolves a verdict. **Read-only**, and it
deletes the empty database it creates if there was none, so probing leaves no
trace — the same trick as `openLegacyDatabase`.

It is deliberately not an applier. A second copy of the copy logic is a second
thing to keep correct, and the app already applies the migration on boot. The
probe observes; the app acts.

Verdicts:

| Verdict      | Meaning                                      | Operator action                |
| ------------ | -------------------------------------------- | ------------------------------ |
| `CLEAN`      | No legacy database on this origin            | Nothing. Record it.            |
| `SPENT`      | Present, but nothing worth keeping is left   | Boot the app once; re-probe    |
| `PENDING`    | Migrated stores still hold records           | Load the app, reload, re-probe |
| `NOTES_ONLY` | Only `notesCanvas` is left                   | §4.2, then re-probe            |

`SPENT` replaces the `BLOCKED` verdict this plan first proposed. Blocking is not
observable in a single probe — it is a property of a deletion attempt, not of
the database — so the honest report is "nothing worth keeping is here, and the
next boot removes it". Seeing `SPENT` *after* a boot is the diagnostic: either
another tab on the origin held the database open, or the build serving that
origin predates §3.

Portability is the point: it needs no build step, no app import and no
`node_modules`. It runs in any console — desktop, a phone over remote debugging,
someone else's laptop — on **any** deployment. That is the escape hatch for
every environment the harness in §4.3 cannot reach, and it is the only tool that
works for a browser you do not control.

### 4.2 `--dump-notes`, and deciding the notes question

The one write the probe offers: serialise `notesCanvas` to a JSON file via a
download, then clear the store. Run it on any profile reporting `NOTES_ONLY`.

That is the resolution of the question `migrate.ts:20-24` deferred. The records
are preserved out-of-band, where they can be inspected or discarded on their own
schedule, and the migration stops carrying a decision it was never the right
place to make. After the dump, the profile self-deletes on next boot.

### 4.3 `scripts/check-legacy-idb.mjs` — for profiles you own

A Node harness that takes `--url` and `--user-data-dir`, navigates, waits for
boot so the app's own migration runs, evaluates the probe, prints its JSON and
exits non-zero unless `CLEAN`. Wired as `check:legacy-idb` alongside the other
`check:*` scripts. `--dump-notes <path>` writes any `notesCanvas` records out.

**Zero dependencies**, which is a change from this plan's first draft: it drives
Chrome over the DevTools protocol directly using the `WebSocket` global Node has
had since v22, rather than the puppeteer-core the `verify-ui-in-browser` notes
describe. Adding a dependency for a tool §6 deletes was the wrong trade, and the
protocol surface needed here is four calls wide.

Four constraints worth writing down rather than rediscovering:

- **A fresh `--user-data-dir` always reports `CLEAN`, and proves nothing** — it
  only proves an empty profile is empty. This is the trap the whole sweep turns
  on, because a meaningless pass is indistinguishable from a real one in the
  output. The harness warns loudly when the profile did not already exist.
- Chromium will not attach to a profile another instance already has open.
  Close it, or `rsync` the profile aside and probe the copy — a copy is also the
  right answer when you would rather not have the app's migration write to a
  live profile at all.
- To probe **without** booting the app, navigate to `/api/health` instead of the
  app root. It is the same origin, so IndexedDB is fully visible, but no app
  bundle loads and no migration runs. That is how you read a profile's true
  current state rather than the state your own probe just caused.
- `:3000` is often a stale `next start` build. Check `ps aux | grep next` first —
  and note that a dev server on another port is a **different origin**, so it
  cannot clean `:3000`'s databases no matter what code it serves.

### 4.4 Sweep per **origin**, not per machine

IndexedDB is origin-scoped, so `http://localhost:3000` and the production domain
each carry their own independent legacy database, on the same machine, in
the same profile. A developer box that has run the app locally is a migration
population of its own. Enumerate origins × profiles, not machines.

---

## 5. Phase 3 — the sweep

### 5.0 Phase 1, exercised end to end

`migrate.ts` is browser-only and has no spec (CLAUDE.md says so). It was instead
driven through its whole lifecycle against a real Chrome, 8 Aug 2026, on a
throwaway profile seeded with a v5 legacy database holding a guest draft,
a revision, a pending save, a cached attachment and a notes canvas:

| Step                       | Verdict      | What it establishes                                                     |
| -------------------------- | ------------ | ----------------------------------------------------------------------- |
| after seeding, boot the app | `NOTES_ONLY` | `documents`/`revisions`/`pendingSaves` drained to 0; `notesCanvas` held it back |
| inspect the new database   | —            | draft, revision and pending save arrived in `blog-simple` v7; the attachment cache was **not** copied |
| `--dump-notes`             | `NOTES_ONLY` | the canvas record written out as JSON; harness exited 1                 |
| `legacyIdb.clearNotes()`   | `SPENT`      | nothing worth keeping left, database still present                      |
| boot the app again         | `CLEAN`      | **database deleted**; harness exited 0                                  |

That is every branch of §3 — the gate holding while notes remain, the disposable
store being ignored rather than blocking, and the deletion firing exactly once
the database is spent.

### 5.1 The population

| Origin                  | Profile                        | Legacy DB          | Guest drafts | Date  |
| ----------------------- | ------------------------------ | ------------------ | ------------ | ----- |
| `http://localhost:3000` | Brave `Default`                | absent             | none         | 8 Aug |
| `http://localhost:3000` | Chrome `Default`               | absent             | none         | 8 Aug |
| `http://localhost:3000` | `~/.config/web-editor`         | absent             | none         | 8 Aug |
| `http://localhost:3000` | `~/.config/bank`               | **present, empty** | none         | 8 Aug |
| _(any deployed origin)_ | —                              | none exists        | —            | 8 Aug |

**Enumerate profiles by searching the disk, not by listing browsers.** The first
pass of this sweep checked Brave and Chrome's `Default` profiles and declared
the population covered. It was wrong: two more Chromium profiles hold a
`localhost:3000` origin, and the app's *primary* home is one of them —
`~/.config/web-editor` is a Chrome app-mode window
(`--app=http://localhost:3000 --user-data-dir=…`), not a normal browser profile,
so nothing about it appears where you would look for browsers. The query that
finds them all is
`find ~/.config ~/snap ~/.var -type d -name "*localhost*indexeddb*"`.

Both running profiles were swept by `rsync`ing them aside and probing the copy
through `/api/health` (§4.3) — read-only, with the copies deleted afterwards.

Two results worth keeping:

- **`web-editor`** holds `blog-simple` v7 with zero documents and zero
  revisions, which is what a signed-in user's profile should look like: the
  content is in Postgres. No legacy database at all.
- **`bank`** holds a legacy database at **version 2** — a visit far
  older than the v5 the migration was written against — with `documents` and
  `revisions` both at **0 records**, and no `blog-simple` at all. Nothing was
  ever stranded there. §7.5 covers what is left of it.

`PUBLIC_URL` and `NEXTAUTH_URL` are both `http://localhost:3000` in this
checkout. `fly.toml` (app `blog-simple`, iad) and `vercel.json` are committed
and looked like they might contradict that, but **the author confirmed the app
has never been deployed** — both are unused templates. The population is
therefore the two rows above, and both are clean.

Guest drafts were the only stake. A signed-in user's documents are in Postgres;
only a guest who never signed in has content that exists nowhere but the legacy
IndexedDB of one browser. With no deployed origin, no such guest can exist
outside this machine, which is what made §6 evidence-based rather than a
calendar bet.

---

## 6. Phase 4 — the deletion

Once every row in §5 reads `CLEAN`:

1. Delete `src/indexeddb/migrate.ts`, `src/indexeddb/migrationPlan.ts`,
   `src/indexeddb/__tests__/migrationPlan.test.ts`.
2. Remove the import and call at `src/indexeddb/index.ts:5,131`, and the comment
   at `:52-57` (keep the sentence explaining that renaming migrates nothing —
   it is the reason the current name must not change either).
3. Delete `scripts/legacy-idb-probe.js`, `scripts/check-legacy-idb.mjs` and the
   `check:legacy-idb` script. They exist to reach this point.
4. CLAUDE.md: drop `migrate.ts` from the uncovered-modules paragraph and
   `migrationPlan.test.ts` from the spec inventory; correct the spec count.
5. `docs/guides/notes-indexeddb-origins.md`: mark the migration retired, keep the
   history.
6. Memory: `fork-remnants.md` (renamed from the upstream-named file).

`npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run check:unused`.

---

## 7. What this does not fix

**7.1 The population may be unknowable.** If §5's last row cannot be answered,
the only honest instrument is a signal: a `publicRoute` endpoint pinged when a
migration copies a record, watched until the rate is zero. I recommend against
it unless forced — it adds an eighth entry to a list of seven deliberately
enumerated unauthenticated surfaces, and it needs rate limiting. Phase 1 alone
makes the population shrink monotonically, which is most of what the telemetry
would have told you; the fallback if it stays unknowable is to keep the code and
revisit in Aug 2027.

**7.2 The residual risk after Phase 4, stated plainly.** In general, a guest who
has not opened the app on that origin between 1 Aug 2026 and the deletion date
loses local-only drafts: there is no cloud copy and no code can recover them
afterwards. Here that risk came out empty — the app was never deployed, and all
four profiles on the only machine that has ever run it hold zero guest documents
(§5.1). The claim it rests on is "never deployed"; if that ever proves wrong,
the recovery path is `git show` on this commit, not anything left in the tree.

**7.5 One empty orphan is left behind, deliberately.** `~/.config/bank` still
has an empty v2 legacy database, and with the migration deleted nothing
will ever remove it. It holds no records, so it is untidiness rather than a
liability. Clearing it is one line in that profile's console on
`http://localhost:3000` — `indexedDB.deleteDatabase(<old name>)` — and it is
left to the author rather than done as a side effect here, because writing to an
unrelated browser profile is not something a cleanup should do uninvited.

**7.3 ~~The table `type` strings stay forever.~~ Retired the same day — see
§10.** This section claimed they were in `.zip` backups on people's disks that
`/api/import` accepts, so no migration could reach them. Every clause was true
in general and false here.

**7.4 `attachmentContent` is destroyed, not migrated.** By design; the server
has the files. The cost is one cold fetch per attachment after the deletion.

---

## 8. Out of scope

- **Deduplicating the table literals.** `blocks.ts:206,210` and `address.ts:37`
  retype strings `legacyTypes.ts` already exports, and it is import-free, so an
  import would work. But `src/lib/content-bridge/` imports nothing from
  `src/editor` — a boundary that keeps it runnable under bare Node for `mcp/`.
  Not worth trading for two constants; the cross-reference comments already do
  the job.
- **Renaming `blog-simple`.** Same trap, one rename later. Don't.
- **The `config.databaseName === LEGACY_DATABASE_NAME` guard** (`migrate.ts:209`)
  is unreachable today. It goes with the file in Phase 4; leave it until then.

---

## 9. Where this plan was wrong

**9.1 "Gate the deletion on every store being empty, so no product call is
needed."** Wrong, and it would have been a data-loss bug. `attachmentContent` is
populated on any profile that opened a document with an attachment, so that gate
would never fire on the profiles that used the app most — and the obvious repair
("ignore stores we do not migrate") silently sweeps `notesCanvas` in with it,
destroying the very records `MIGRATED_STORES` set aside. Not migrated and safe to
destroy are two different questions; §3.2 answers them separately, which is why
`DISPOSABLE_STORES` exists as its own list.

**9.2 "~15 lines."** It is ~110 changed, because the early returns at the old
`migrate.ts:216,221` are the *common* path for an already-migrated profile and
had to be routed through the new decision rather than past it. That restructure —
`copyOutOfLegacy` — is most of the diff.

**9.3 An on-disk `grep` for a database name is not evidence.** Brave's
`http_localhost_3000.indexeddb.leveldb` contains the string, which looked like a
surviving legacy database; the probe then reported `CLEAN`. The explanation is
that `openLegacyDatabase` *creates* the database in order to find out whether it
existed, then deletes the empty one it made — leaving the name in the leveldb log
as a tombstone. The app's own probe writes the evidence that would convict it.
Only an `indexedDB.open` answers this question.

**9.4 `BLOCKED` is not a verdict.** See §4.1.

**9.6 The first sweep missed the profile that mattered most.** §5.1 was first
filled in with two rows — Brave and Chrome `Default` — on the reasoning that
those are the browsers on this machine. Both were clean, and the deletion was
very nearly justified on that basis. A wider `find` then turned up two more
Chromium profiles, one of which (`~/.config/web-editor`) is an app-mode window
pointed straight at this app and is where it is actually used day to day. The
outcome did not change, but the method was wrong: **enumerate origins by
searching the filesystem for `*localhost*indexeddb*`, not by thinking of
browsers you have installed.** An app-mode `--user-data-dir` is invisible to the
second approach and is exactly where a single-user app's data lives.

**9.5 puppeteer-core was the wrong reach.** See §4.3.

---

## 10. The other half — retiring the two node `type` strings

Added 8 Aug 2026, after §7.3 above was challenged rather than accepted.

### 10.1 The claim, and why it was wrong

The two table `type` strings were renamed in `f5ef8e66` using compat aliases:
`LegacyTableNode` / `LegacyTableCellNode`, whose `getType()` returned the old
spelling and whose `importJSON` delegated to the real class, so Lexical had a
class for stored content and upgraded it on next save. The aliases were declared
permanent on this reasoning:

> Data in `Revision` rows, guests' IndexedDB and `.zip` backups already on
> users' disks, which `/api/import` accepts. No migration reaches a backup.

Each clause is true of a deployed multi-user app. **This app was never deployed**
(§5.1), which collapses every one of them: there are no users, so no disks, so
no backups. The reasoning had been inherited from upstream's framing and
restated three times without anyone asking how much data it actually described.

### 10.2 What the data said

A `LIKE '%…%'` scan over **every** `json`/`jsonb` column in the database —
enumerated from `information_schema.columns` rather than guessed, which is what
caught `Revision.ops` and `CopilotThread.messages`:

| Column                  | Rows with the legacy spelling |
| ----------------------- | ----------------------------- |
| `Revision.data`         | **58** (across 5 documents)   |
| `Revision.ops`          | 0                             |
| `CopilotThread.messages` | 0                            |
| `Note.content`          | 0                             |

`Document` has no JSON column at all — content lives only in `Revision`. Outside
Postgres: every swept browser profile held zero documents (§5.1), and a scan of
the filesystem for export bundles (zips containing `assets/attachments` or
`documents/*.json`) found none. **58 rows was the entire population in
existence.**

### 10.3 The migration

Backed up first — `var/backups/revisions-*.json`, gitignored — then:

```sql
UPDATE "Revision"
   SET data = replace(data::text, '<old-table-type>', 'blog-table')::jsonb
 WHERE data::text LIKE '%<old-table-type>%';
```

One `replace` covers both spellings: the cell type has the table type as a
prefix, so rewriting the shorter one turns the longer into `blog-tablecell` in
the same pass. 58 rows updated, all four counts then zero.

Verified by re-reading every migrated row and comparing it against the backup
with the same replacement applied in Python: **0 rows differed beyond the
rename**. Then end-to-end through the real codec — `outline` on a migrated
document rendered its table as `6 rows × 2 columns` with rows and cells
addressed, with the alias classes already deleted.

### 10.4 What went

`legacyTypes.ts`, `legacyTypes.test.ts`, both alias classes, their registrations
in `config.tsx` and `nestedConfig.tsx`, the legacy entries in `TABLE_TYPES` /
`TABLE_CELL_TYPES` / `BLOCK_CONTAINERS`, and the legacy case in `codecs.test.ts`.

`TABLE_TYPES` and `TABLE_CELL_TYPES` stay **sets** holding one element each.
They are the read side, and the next rename will want somewhere to put the old
spelling for as long as it takes to migrate — which is now a known, short
procedure rather than a permanent obligation.

### 10.5 The lesson

**"Unreachable" is a measurement, not a property.** A comment asserting that
data cannot be migrated is worth one `count(*)` before it is believed. This one
had been load-bearing for weeks; checking it took under a minute and turned a
permanent constraint into a 58-row `UPDATE`.
