/**
 * The `type` strings the table nodes carried before the fork's name was
 * scrubbed, written down in one place.
 *
 * Lexical stamps a node's `getType()` into every serialization, so these two
 * strings are not references to old code — they are *data*, already sitting in
 * `Revision` rows, in guests' IndexedDB, and in `.zip` backups on people's disks
 * that `/api/import` still accepts. Lexical throws on a `type` it has no class
 * for, so `LegacyTableNode` and `LegacyTableCellNode` re-register them as import
 * entry points. Neither can ever be deleted; a migration would not reach the
 * backups.
 *
 * They live here so that `rg matheditor` lands on this explanation rather than
 * on three separate string literals that each look like an oversight.
 */

export const LEGACY_TABLE_TYPE = "matheditor-table";
export const LEGACY_TABLE_CELL_TYPE = "matheditor-tablecell";
