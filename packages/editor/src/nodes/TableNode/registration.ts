import type { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import {
  TableCellNode as LexicalTableCellNode,
  TableNode as LexicalTableNode,
  TableRowNode as LexicalTableRowNode,
} from "@lexical/table";
import { TableCellNode } from "./TableCellNode";
import { TableNode } from "./TableNode";

/**
 * The complete table registry, shared verbatim by `editor/config.tsx` and
 * `nodes/nestedConfig.tsx`.
 *
 * It is one exported constant rather than two copies of the same five entries
 * because it is the *shape* that is load-bearing, and getting it wrong is fatal
 * rather than cosmetic — see below. `packages/editor/src/nodes/__tests__/
 * serialization.test.ts` builds a headless editor over this array and inserts a
 * table through `@lexical/table`'s own creators; a config file cannot be
 * imported there (the `.tsx` node modules do not parse in that environment), so
 * this is what makes the registry testable at all.
 *
 * ## Why upstream's classes hold the `"table"` / `"tablecell"` slots
 *
 * Lexical keys its node registry by type string, one entry per type, and
 * `LexicalNode`'s constructor asserts on *every* construction that the
 * registered `klass` for a type is the class being constructed
 * (`errorOnTypeKlassMismatch`). `@lexical/table` constructs its own classes
 * directly — `$createTableNode()` is `$applyNodeReplacement(new TableNode())`,
 * and `$createTableCellNode()` the same — so the `new` runs *before*
 * replacement gets a chance. Register anything but upstream's own class in
 * those slots and every table insertion throws:
 *
 *     Create node: Type table in node TableNode does not match registered node
 *     X with the same type
 *
 * That is not a misconfiguration, it is structural: you cannot own a type
 * string that upstream itself constructs. (A subclass registered under a *new*
 * type string, which is what `TableNode`/`TableCellNode` are, is fine — they
 * are `blog-table` / `blog-tablecell` and own their own slots.)
 *
 * So the upgrade is the `with` fn, which `$applyNodeReplacement` calls on the
 * node upstream just built. `withKlass` does the other half: it makes upstream's
 * `TableNode` resolve to ours for `registerNodeTransform` /
 * `registerMutationListener`, which is what lets `@lexical/table`'s
 * `registerTablePlugin` and `registerTableSelectionObserver` drive our
 * subclasses. It is legitimate here precisely because ours is a *strict*
 * subclass of upstream's, which registration asserts.
 *
 * `TableRowNode` is registered plainly: it was never renamed, so upstream's
 * class both owns and serializes `"tablerow"`.
 *
 * ## What this does not do
 *
 * It does not upgrade *stored* JSON carrying the pre-rename `"table"` /
 * `"tablecell"` type strings. At 0.49 upstream declares itself through
 * `$config()` and has no own `static importJSON`; the synthesized one is
 * `s => new klass().updateFromJSON(s)` — plain construction, no
 * `$applyNodeReplacement` — so such JSON loads as an upstream node and comes
 * back under the old type, without the id/style/float our subclasses model.
 *
 * That is deliberate, and it is not defended against, because the data is gone:
 * `docs/plans/archive/legacy-idb-retirement.md` §10 migrated all 58 stored revisions
 * that carried those strings, verified every other JSON column at zero, swept
 * every browser profile on the only machine that has ever run this app (zero
 * guest documents) and scanned the filesystem for export bundles (none). The
 * app was never deployed. §10.4 deleted the alias classes on that evidence;
 * `9c5d1b31` reintroduced them unaware of it, which is what broke insertion.
 */
export const TABLE_NODES: (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  TableNode,
  TableCellNode,
  {
    replace: LexicalTableNode,
    with: (_node: LexicalTableNode) => new TableNode(),
    withKlass: TableNode,
  },
  {
    replace: LexicalTableCellNode,
    with: (node: LexicalTableCellNode) =>
      new TableCellNode(node.__headerState, node.__colSpan, node.__width),
    withKlass: TableCellNode,
  },
  LexicalTableRowNode,
];
