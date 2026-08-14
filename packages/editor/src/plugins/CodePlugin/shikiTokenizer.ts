/**
 * Shiki as a *tokenizer* for `registerCodeHighlighting`, with our class channel
 * left alone.
 *
 * `docs/plans/archive/haklex-adoption.md` §10.7 cut live Shiki permanently, and
 * the reason was correct as a statement about `@lexical/code-shiki`: its
 * `$tokenize` calls `node.setStyle(stringifyTokenStyle(...))`, and
 * `CodeHighlightNode` extends `TextNode`, whose `__style` **serializes**. That
 * bakes one theme's hex literals into stored document JSON, so dark mode
 * renders light-theme colours with every checker green — `check:theme` reads
 * stylesheets, not revisions.
 *
 * `registerCodeHighlighting(editor, tokenizer)` takes a custom tokenizer, so
 * none of that is forced on a consumer. This module is the alternative:
 *
 * - it emits **token type strings** (`keyword`, `string`, …) which Lexical
 *   resolves through `theme.codeHighlight` to `LexicalTheme__token*` classes,
 *   which `theme.css` resolves to `var(--tok-*)`, which `html.dark` overrides;
 * - it calls `$createCodeHighlightNode(text, type)` and nothing else. There is
 *   no `setStyle` call in this file and no colour value of any kind;
 * - it loads **no Shiki theme at all** (see {@link tokensForLine}), so a colour
 *   is not merely unused, it is never resolved.
 *
 * `packages/editor/src/nodes/__tests__/codeHighlightStyle.test.ts` is the guard:
 * it tokenizes through a real editor and asserts every serialized
 * `code-highlight` node has an empty `style`.
 *
 * The scope→type table lives next door in `shikiScopes.ts`, import-free, so a
 * spec can exercise the whole of the phase's correctness risk without a
 * highlighter.
 */

import {
  $createCodeHighlightNode,
  DEFAULT_CODE_LANGUAGE,
  type registerCodeHighlighting,
} from "@lexical/code";
import {
  $createLineBreakNode,
  $createTabNode,
  $getNodeByKey,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  tokenizeRawText,
} from "lexical";
import type { HighlighterCore } from "shiki/core";
import { tokenTypeForScopes } from "./shikiScopes";

/**
 * The tokenizer contract, taken from the function that consumes it rather than
 * imported from `@lexical/code-prism`. That package is a transitive dependency
 * of `@lexical/code` — reachable today only because npm hoists it — and this is
 * the one thing we need from it.
 */
type CodeTokenizer = NonNullable<Parameters<typeof registerCodeHighlighting>[1]>;

/**
 * A prism-shaped token. `@lexical/code-prism`'s `$mapTokens` reads `type` (the
 * `theme.codeHighlight` key) and `content`; `alias` is only consulted for
 * prism's own `prefix` tokens in diff mode, which we never emit.
 */
interface PrismShapedToken {
  type: string;
  alias: string;
  content: string;
}

/**
 * Grammar id → the module that carries it.
 *
 * **This set is the code block's own language dropdown**, not a guess.
 * `utils/codeLanguage.ts`'s `getCodeLanguageOptions()` is what fills the
 * selector, and it is `@lexical/code-prism`'s `CODE_LANGUAGE_FRIENDLY_NAME_MAP`
 * plus `csharp` and `bash` — so those twenty ids are the only languages the
 * editor can assign. Two of them (`clike`, `plain`) have no Shiki grammar and
 * are absent below; `diff` is here instead, because it is one of the few extra
 * ids that survives the gate described in {@link grammarIdFor}.
 *
 * Each value is a separate `import()`, so each grammar is its own chunk and
 * none of them is in any chunk a page without a code block loads. That matters
 * at these sizes: `cpp` alone is 534 KB of grammar JSON, `typescript` 191 KB.
 */
const GRAMMARS = {
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  markdown: () => import("@shikijs/langs/markdown"),
  "objective-c": () => import("@shikijs/langs/objective-c"),
  powershell: () => import("@shikijs/langs/powershell"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  typescript: () => import("@shikijs/langs/typescript"),
  xml: () => import("@shikijs/langs/xml"),
} as const;

type GrammarId = keyof typeof GRAMMARS;

/**
 * The ids a `CodeNode` may actually carry, mapped onto grammar ids.
 *
 * Shiki resolves its own aliases once a grammar is loaded, but only after the
 * fact — we need the mapping *before* deciding what to fetch, and three of
 * these (`markup`, `clike`, `plain`) are prism spellings Shiki has never heard
 * of. Keeping one table means the alias question is answered in a single place
 * whether it is a load decision or a lookup.
 */
const ALIASES: Readonly<Record<string, GrammarId>> = {
  bash: "shellscript",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  cs: "csharp",
  golang: "go",
  htm: "html",
  js: "javascript",
  // `markup` is prism's name for the HTML/XML family; the HTML grammar is the
  // superset and is preloaded anyway.
  markup: "html",
  md: "markdown",
  objc: "objective-c",
  ps: "powershell",
  ps1: "powershell",
  py: "python",
  rs: "rust",
  sh: "shellscript",
  shell: "shellscript",
  ts: "typescript",
  zsh: "shellscript",
};

/**
 * Loaded before the first token is asked for; everything else waits for a
 * `loadLanguage` round trip and one frame of unhighlighted code.
 *
 * Chosen by frequency, not by the dropdown's full list: these eight are ~700 KB
 * of grammar between them and the remaining eleven another ~1 MB, most of it
 * `cpp`. They are also the eight this repo already singles out by hand —
 * `nodes/AttachmentNode/AttachmentPreview.tsx` imports prism grammars for
 * javascript, typescript, css, python, bash, markdown and sql, which is the
 * nearest thing in the tree to a measurement of what gets written here.
 */
const PRELOAD: readonly GrammarId[] = [
  "css",
  "html",
  "javascript",
  "markdown",
  "python",
  "shellscript",
  "sql",
  "typescript",
];

/**
 * Shiki's own default. A pathological line — a minified bundle pasted into a
 * code block — stops being tokenized rather than blocking the keystroke that
 * triggered it; the rest of the line comes back as one plain run.
 */
const TOKENIZE_TIME_LIMIT_MS = 500;

let highlighter: HighlighterCore | null = null;
let booting: Promise<HighlighterCore> | null = null;
/** Grammar ids that can be tokenized *synchronously*, right now. */
const loaded = new Set<GrammarId>();
/** In-flight (and settled) load attempts, so N code nodes cost one fetch. */
const requests = new Map<GrammarId, Promise<boolean>>();

/**
 * Build the highlighter once, on the first tokenize.
 *
 * `createJavaScriptRegexEngine()` rather than the Oniguruma default: the WASM
 * build is 467 KB and needs a separate fetch and instantiation, and the
 * JavaScript engine handles every grammar in {@link GRAMMARS}. `shiki/core`
 * itself is behind an `import()` too, so this whole subsystem — engine included
 * — is absent from any chunk that has no code block in it.
 *
 * **`target: "ES2024"` is not a compatibility setting; it is a correctness
 * one.** The default `"auto"` resolves to `"ES2025"` on any runtime with native
 * regexp modifiers — Node 24, Chrome 125+ — and on that path the translator
 * mis-handles Oniguruma's inline `(?i:…)` groups. Measured against
 * `@shikijs/langs/sql` 4.4.3, whose entire DML keyword pattern is one
 * `(?i:\b(select|insert…))`: `SELECT count(*) FROM t` highlights nothing under
 * `"ES2025"` and correctly under `"ES2024"`, which emulates the modifier
 * instead. Uppercase SQL is the conventional spelling, so this is the
 * difference between the language working and not.
 */
function ensureHighlighter(): Promise<HighlighterCore> {
  if (booting !== null) return booting;
  booting = (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ]);
    const core = await createHighlighterCore({
      // No themes. Not "a theme we ignore" — none, which is what makes the
      // §10.7 failure unreachable rather than merely avoided. See
      // `tokensForLine` for why we can get away with it.
      themes: [],
      langs: PRELOAD.map((id) => GRAMMARS[id]()),
      engine: createJavaScriptRegexEngine({ target: "ES2024" }),
    });
    highlighter = core;
    for (const id of PRELOAD) loaded.add(id);
    return core;
  })();
  return booting;
}

/**
 * Which grammar, if any, highlights a `CodeNode`'s language.
 *
 * **A `null` here is not the only way a language goes unhighlighted.**
 * `registerCodeHighlighting` gates on `@lexical/code-prism`'s own
 * `isCodeLanguageLoaded`, which reads `Prism.languages` — the tokenizer does not
 * get a say. So a language prism has no grammar for never reaches this
 * function at all, whatever Shiki supports. That is why the table above is the
 * dropdown rather than Shiki's 200-odd bundled languages: anything wider would
 * be unreachable code.
 */
function grammarIdFor(language: string | null | undefined): GrammarId | null {
  if (!language) return null;
  const lower = language.toLowerCase();
  // `diff-javascript` is prism's spelling for a diff *of* JavaScript, and it
  // reaches us because the gate above checks the inner language. Shiki has no
  // equivalent; the +/- structure is the half worth colouring.
  const base = lower.startsWith("diff-") ? "diff" : lower;
  if (Object.prototype.hasOwnProperty.call(GRAMMARS, base)) {
    return base as GrammarId;
  }
  return ALIASES[base] ?? null;
}

/**
 * Fetch a grammar, once.
 *
 * Resolves `true` when the language is usable afterwards — the signal to
 * re-highlight whatever asked for it. A failed load is remembered as a failure
 * and not retried: the alternative is a fetch per keystroke against a chunk
 * that is not coming back.
 */
function requestGrammar(id: GrammarId): Promise<boolean> {
  const existing = requests.get(id);
  if (existing !== undefined) return existing;
  const attempt = (async () => {
    try {
      const core = await ensureHighlighter();
      if (!loaded.has(id)) {
        await core.loadLanguage(GRAMMARS[id]());
        loaded.add(id);
      }
      return true;
    } catch (error) {
      console.error(`Shiki: the "${id}" grammar failed to load`, error);
      return false;
    }
  })();
  requests.set(id, attempt);
  return attempt;
}

/**
 * Make a language tokenizable, awaitably.
 *
 * The editor never needs this — `$tokenize` schedules its own loads — but a
 * spec does, because `tokenize` is synchronous and the first call for any
 * language is necessarily a miss. Resolves `false` for a language no grammar
 * covers.
 */
export function preloadCodeLanguage(language: string): Promise<boolean> {
  const id = grammarIdFor(language);
  if (id === null) return Promise.resolve(false);
  return requestGrammar(id);
}

/**
 * One line of source → prism-shaped tokens, via the raw TextMate grammar.
 *
 * §4.1 of docs/plans/haklex-reprise.md specifies `codeToTokens(…, {
 * includeExplanation: "scopeName" })`, and this is the one place the
 * implementation departs from it. `codeToTokens` requires a theme, resolves a
 * colour for every token and then **merges adjacent tokens that resolved to the
 * same colour** — so the scopes we actually want arrive only as a side channel
 * (`explanation`), and only when a theme with real rules is loaded. Measured:
 * with a rules-free theme, every line comes back as a single token with an
 * empty `explanation`.
 *
 * `grammar.tokenizeLine` is the layer underneath all of that. It takes no
 * theme, does no colour resolution, and returns exactly the scope stacks
 * `shikiScopes.ts` wants — finer than `codeToTokens`, because nothing has
 * merged. It also means "never reads a theme colour" is a property of the code
 * rather than a rule someone has to keep.
 *
 * `ruleStack` threads across lines: a multi-line comment or template literal is
 * only correct if line N+1 starts where line N left off.
 */
function tokensForLine(
  grammar: ReturnType<HighlighterCore["getLanguage"]>,
  line: string,
  stack: Parameters<ReturnType<HighlighterCore["getLanguage"]>["tokenizeLine"]>[1],
  out: (string | PrismShapedToken)[],
) {
  const result = grammar.tokenizeLine(line, stack, TOKENIZE_TIME_LIMIT_MS);
  for (const token of result.tokens) {
    const content = line.slice(token.startIndex, token.endIndex);
    if (content === "") continue;
    const type = tokenTypeForScopes(token.scopes);
    // An unmapped scope becomes a bare string, which `$mapTokens` turns into a
    // `CodeHighlightNode` with no `highlightType` and therefore no class. That
    // is the correct fallback: unstyled, not mis-styled.
    out.push(type === null ? content : { type, alias: "", content });
  }
  return result.ruleStack;
}

/**
 * Flatten prism-shaped tokens into Lexical nodes.
 *
 * A reimplementation of `@lexical/code-prism`'s private `$mapTokens`, which is
 * not exported. `tokenizeRawText` is what splits `\n` and `\t` out of a run —
 * a code block stores them as `LineBreakNode`/`TabNode`, not as text — so a
 * token's content can contain either and still come out structured.
 */
function $mapTokens(
  tokens: readonly (string | PrismShapedToken)[],
): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  for (const token of tokens) {
    const isRaw = typeof token === "string";
    const content = isRaw ? token : token.content;
    const type = isRaw ? undefined : token.type;
    tokenizeRawText(content, {
      linebreak: () => nodes.push($createLineBreakNode()),
      tab: () => nodes.push($createTabNode()),
      text: (text) => nodes.push($createCodeHighlightNode(text, type)),
    });
  }
  return nodes;
}

/**
 * Re-run the highlight transform over one code node.
 *
 * `markDirty` is the whole mechanism: `registerCodeHighlighting` registers a
 * node transform on `CodeNode`, and a dirty node is what runs one. Tagged
 * `history-merge` so a grammar arriving 200 ms after the paste does not become
 * an undo step that appears to do nothing.
 */
function rehighlight(editor: LexicalEditor, key: NodeKey) {
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (node !== null) node.markDirty();
  }, { tag: "history-merge" });
}

/**
 * The tokenizer, bound to an editor.
 *
 * It needs the editor for exactly one thing: when a grammar has to be fetched,
 * something has to come back and redraw the node that wanted it. `tokenize` is
 * synchronous by contract, so the miss is unavoidable — one frame of plain code
 * on the first use of a language outside {@link PRELOAD}.
 */
export function createShikiTokenizer(editor: LexicalEditor): CodeTokenizer {
  /**
   * The narrow half, kept separate from the `tokenize` method because the
   * interface widens the return to `(string | Token)[]` — `Token.content` is
   * recursive and `alias` may be an array, neither of which we ever emit.
   * `$mapTokens` wants the narrow shape, so `$tokenize` calls this rather than
   * going back through the contract and losing the type.
   */
  const shape = (
    code: string,
    language: string | undefined,
  ): (string | PrismShapedToken)[] => {
    const id = grammarIdFor(language ?? DEFAULT_CODE_LANGUAGE);
    if (id === null || highlighter === null || !loaded.has(id)) return [code];
    const grammar = highlighter.getLanguage(id);
    const tokens: (string | PrismShapedToken)[] = [];
    const lines = code.split("\n");
    let stack = null as Parameters<typeof grammar.tokenizeLine>[1];
    for (let i = 0; i < lines.length; i++) {
      // `tokenizeLine` is given one line at a time and the newlines are not in
      // its output, so they go back in here; `$mapTokens` turns each into a
      // `LineBreakNode`.
      if (i > 0) tokens.push("\n");
      stack = tokensForLine(grammar, lines[i], stack, tokens);
    }
    return tokens;
  };

  return {
    defaultLanguage: DEFAULT_CODE_LANGUAGE,

    tokenize: (code, language) => shape(code, language),

    $tokenize(codeNode, language) {
      const lang = language ?? this.defaultLanguage ?? undefined;
      const id = grammarIdFor(lang);
      if (id !== null && !loaded.has(id)) {
        const key = codeNode.getKey();
        void requestGrammar(id).then((ok) => {
          if (ok) rehighlight(editor, key);
        });
      }
      return $mapTokens(shape(codeNode.getTextContent(), lang));
    },
  };
}
