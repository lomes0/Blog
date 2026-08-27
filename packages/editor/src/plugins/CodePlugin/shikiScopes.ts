/**
 * TextMate scope → Lexical code-highlight token type.
 *
 * This module is **import-free on purpose**, the same rule `dragGeometry.ts`
 * and `imageLayout.ts` follow: it is the whole of the Shiki phase's correctness
 * risk (docs/plans/archive/haklex-reprise.md §10, "the scope→class table will
 * be the whole of phase 2"), so it has to be exercisable by a spec without a
 * highlighter, an editor or a DOM.
 *
 * The names it returns are **not** class names. They are the keys of
 * `theme.codeHighlight` in `../../theme.tsx`, which Lexical looks up to build
 * the `LexicalTheme__token*` class on each `CodeHighlightNode`. That indirection
 * is the point: the tokenizer chooses a *type string*, the stylesheet chooses a
 * colour, and `theme.css`'s `html.dark` block re-chooses it in the other scheme.
 * Nothing here, and nothing downstream of here, ever sees a hex value — which is
 * exactly the property `@lexical/code-shiki` gives up when its `$tokenize` calls
 * `node.setStyle()` and bakes one theme into stored JSON
 * (docs/plans/archive/haklex-adoption.md §10.7).
 *
 * A name this file returns that `theme.codeHighlight` does not carry renders
 * unstyled — the safe direction, but a silent one, so `__tests__/shikiScopes.test.ts`
 * asserts the two agree.
 */

/**
 * The token types this module may return.
 *
 * A strict subset of `theme.codeHighlight`'s keys — the map also carries prism
 * spellings (`atrule`, `cdata`, `prolog`, `doctype`, `symbol`, `class`,
 * `entity`) that no TextMate scope produces, and there is no reason to invent
 * a scope for them.
 */
export type CodeTokenType =
  | "attr"
  | "boolean"
  | "builtin"
  | "char"
  | "class-name"
  | "comment"
  | "constant"
  | "deleted"
  | "function"
  | "important"
  | "inserted"
  | "keyword"
  | "namespace"
  | "number"
  | "operator"
  | "property"
  | "punctuation"
  | "regex"
  | "selector"
  | "string"
  | "tag"
  | "url"
  | "variable";

/**
 * Scope prefix → token type, resolved longest-prefix-first on dot boundaries.
 *
 * Keys are written **without** the language suffix every real scope carries
 * (`keyword.control.export.ts`, `entity.name.function.py`), because
 * {@link scopeToTokenType} walks segments off the right until something matches
 * — so `comment` catches `comment.line.double-slash.ts` and the suffix falls
 * away with the rest of the tail.
 *
 * The consequence worth knowing: a mapping cannot be conditioned on the
 * *language*, only on the scope. CSS is where that shows — an element selector
 * is `entity.name.tag.css`, which lands on `tag` here where prism called it
 * `selector`. The two resolve to different `--tok-*` variables, so the colour
 * differs from the prism era; it is a colour, not a correctness bug, and
 * special-casing it would mean matching on suffixes and giving up the single
 * rule that makes this table readable.
 */
const SCOPE_TYPES: Readonly<Record<string, CodeTokenType>> = {
  // --- comments -----------------------------------------------------------
  // The `//` and `/*` themselves are `punctuation.definition.comment`, one
  // level *inside* the comment scope. Without this entry the delimiters would
  // resolve to `punctuation` and break out of the comment's italic grey.
  "comment": "comment",
  "punctuation.definition.comment": "comment",
  "meta.diff.header": "comment",

  // --- strings ------------------------------------------------------------
  // Quotes belong to the string, matching prism, for the same reason as above.
  "string": "string",
  "punctuation.definition.string": "string",
  "string.regexp": "regex",
  "string.other.link": "url",
  "constant.character": "char",
  "constant.character.escape": "char",

  // --- literals -----------------------------------------------------------
  "constant": "constant",
  "constant.numeric": "number",
  // `true` / `false` / `null` / `nil` — TextMate files them under
  // `constant.language`, prism under `boolean`.
  "constant.language": "boolean",
  "support.constant": "constant",

  // --- keywords -----------------------------------------------------------
  "keyword": "keyword",
  // `+`, `=>`, `:` in a type annotation. More specific than `keyword`, so the
  // longest-prefix walk reaches it first.
  "keyword.operator": "operator",
  "storage": "keyword",
  // `this`, `self`, `super` read as keywords everywhere they appear.
  "variable.language": "keyword",

  // --- names --------------------------------------------------------------
  "entity.name.function": "function",
  "entity.name.class": "class-name",
  "entity.name.type": "class-name",
  "entity.name.namespace": "namespace",
  "entity.name.scope-resolution": "namespace",
  "entity.name.tag": "tag",
  // C#'s property declarations, and anything else a grammar files as a named
  // variable rather than under the `variable.*` root.
  "entity.name.variable": "variable",
  "entity.other.attribute-name": "attr",
  "entity.other.inherited-class": "class-name",
  // A shell command name. The grammar also stacks
  // `entity.name.function.call.shell` under it, so this arm is belt and braces
  // — but the belt is one scope away from being the only thing holding it up.
  "entity.name.command": "function",
  "support.function": "function",
  // `echo`, `cd`, `len` — a language's own vocabulary rather than the user's.
  "support.function.builtin": "builtin",
  "support.class": "class-name",
  // A primitive type annotation (`number`, `string`). Prism calls these
  // `builtin`; keeping that keeps TypeScript looking as it did.
  "support.type": "builtin",
  "support.type.property-name": "property",
  "support.variable": "variable",
  "support.other": "variable",

  // --- variables and members ---------------------------------------------
  "variable": "variable",
  "meta.object-literal.key": "property",

  // --- punctuation --------------------------------------------------------
  "punctuation": "punctuation",
  // Braces and brackets are `meta.*` in most grammars, not `punctuation.*`.
  "meta.brace": "punctuation",
  "meta.delimiter": "punctuation",
  // The `$` of a shell or PHP variable belongs with the variable it introduces.
  "punctuation.definition.variable": "variable",

  // --- CSS-flavoured selectors -------------------------------------------
  // `.foo`, `#foo`, `:hover`, `::before`. HTML's own `class=` attribute is
  // `entity.other.attribute-name.html`, which stops at `attr` above, so these
  // four do not collide with markup.
  "entity.other.attribute-name.class": "selector",
  "entity.other.attribute-name.id": "selector",
  "entity.other.attribute-name.pseudo-class": "selector",
  "entity.other.attribute-name.pseudo-element": "selector",

  // --- markup (markdown, diff) -------------------------------------------
  "markup.heading": "important",
  "punctuation.definition.heading": "important",
  "markup.bold": "important",
  "markup.italic": "important",
  "markup.underline.link": "url",
  "markup.inline.raw": "string",
  "markup.fenced_code": "string",
  "markup.raw": "string",
  "markup.quote": "comment",
  // No `markup.list` arm on purpose: the bullet is
  // `punctuation.definition.list.begin`, which the generic `punctuation` entry
  // already catches, while `markup.list` wraps the item's *text* — an arm here
  // greys out the prose, which is what it did before this comment was written.
  "markup.inserted": "inserted",
  "markup.deleted": "deleted",
  "markup.changed": "important",
  "meta.diff.range": "important",
  "entity.name.section": "important",
};

/**
 * The type for one scope, or `null` when the table has nothing to say.
 *
 * Walks segments off the right-hand side, so the most specific entry wins and
 * the language suffix is discarded for free:
 * `punctuation.definition.string.begin.ts` tries that, then
 * `punctuation.definition.string` (hit → `string`), never reaching the bare
 * `punctuation` entry that would have coloured the quote grey.
 */
export function scopeToTokenType(scope: string): CodeTokenType | null {
  let candidate = scope;
  for (;;) {
    const hit = SCOPE_TYPES[candidate];
    if (hit !== undefined) return hit;
    const dot = candidate.lastIndexOf(".");
    if (dot === -1) return null;
    candidate = candidate.slice(0, dot);
  }
}

/**
 * The type for a whole scope *stack*, innermost first.
 *
 * TextMate hands back the stack outermost→innermost (`source.ts`,
 * `meta.var.expr.ts`, `keyword.control.export.ts`), and the innermost scope
 * that this table recognises is the one that describes the token. Walking from
 * the other end would colour every token in a TypeScript file by `source.ts`.
 */
export function tokenTypeForScopes(
  scopes: readonly string[],
): CodeTokenType | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const type = scopeToTokenType(scopes[i]);
    if (type !== null) return type;
  }
  return null;
}

/**
 * Every type {@link scopeToTokenType} can return, for the spec that checks them
 * against `theme.codeHighlight`. Derived from the table rather than written out
 * twice, so a new arm cannot escape the check by being forgotten here.
 */
export function tokenTypesInUse(): CodeTokenType[] {
  return [...new Set(Object.values(SCOPE_TYPES))].sort();
}
