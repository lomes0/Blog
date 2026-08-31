/**
 * What "unwrappable" means, in one place — docs/plans/nested-editor-support.md §3.
 *
 * `canvas`, `image` and `sticky` were inline decorators until that plan, so
 * every one of them ever inserted landed inside a paragraph. A paragraph is not
 * a `BLOCK_CONTAINER` (`content-bridge/address.ts`), so a wrapped node has no
 * address, and everything inside it — a canvas's notes, an image's caption, a
 * sticky's body — is unreachable however well the seam below it is written.
 *
 * Two things act on this rule and they must not drift, because they run on the
 * same content from different sides: `pnpm nodes:unwrap` rewrites what is in
 * the database, and `packages/editor/src/nodes/blockDecoratorUnwrap.ts`
 * normalises everything the migration cannot reach — a clipboard payload
 * copied before the change, an import bundle, a restored revision. Both import
 * `UNWRAPPED_BLOCK_TYPES` from here.
 *
 * Import-free on purpose, so `__tests__/blockDecorators.test.ts` drives the real
 * migration rather than a description of it, and so the editor can import the
 * constant without pulling a server module into the bundle.
 */

/**
 * The node types a sole-child paragraph is unwrapped around.
 *
 * Not "every node whose `isInline()` is false": `horizontalrule`, `page-break`
 * and `nested-doc` were block-level already and were never wrapped, so a
 * paragraph containing one is a shape nobody has produced and not one to
 * normalise on a guess. And deliberately not `math`, `graph`, `sketch` or
 * `attachment` — measured across all 1,475 stored revisions, those genuinely do
 * sit in running text (§2), which is what being inline is *for*.
 */
export const UNWRAPPED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "canvas",
  "image",
  "sticky",
]);

/** The shape this walks: anything with an optional `children` array. */
interface JsonNode {
  type?: unknown;
  children?: unknown;
  [key: string]: unknown;
}

const isNode = (value: unknown): value is JsonNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface UnwrapResult {
  /** Paragraphs replaced by their only child. */
  unwrapped: number;
  /**
   * Paragraphs holding one of these types **and something else**, left alone.
   *
   * Counted rather than handled: the author's prose is not this migration's to
   * split, and §2 measured zero of them across the whole corpus. A non-zero
   * count here is news, which is why the script prints it even when it is 0.
   */
  shared: number;
}

/**
 * Replace every sole-child wrapper paragraph in `value` with its child.
 *
 * **Mutates in place**, and walks the whole JSON rather than only the block
 * tree: a wrapped image can sit inside a canvas note, a sticky body or a nested
 * doc, each of which keeps its children at a different key. A generic descent
 * costs nothing at this size and cannot miss a container the way an allowlist
 * of key paths silently would.
 */
export function unwrapBlockDecorators(value: unknown): UnwrapResult {
  const result: UnwrapResult = { unwrapped: 0, shared: 0 };
  visit(value, result);
  return result;
}

function visit(value: unknown, result: UnwrapResult): void {
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, result);
    return;
  }
  if (!isNode(value)) return;

  if (Array.isArray(value.children)) {
    const children = value.children as unknown[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!isNode(child) || child.type !== "paragraph") continue;
      const inner = child.children;
      if (!Array.isArray(inner) || inner.length === 0) continue;

      const wrapped = inner.filter(
        (n) => isNode(n) && typeof n.type === "string" &&
          UNWRAPPED_BLOCK_TYPES.has(n.type),
      );
      if (wrapped.length === 0) continue;
      if (inner.length > 1) {
        result.shared++;
        continue;
      }
      // Spliced in place, so the node keeps its position among its siblings —
      // an unwrap must not reorder a document.
      children[i] = inner[0];
      result.unwrapped++;
    }
  }

  for (const entry of Object.values(value)) visit(entry, result);
}
