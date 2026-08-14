/**
 * The scope→type table, which is the whole of live Shiki's correctness risk.
 *
 * Every scope string below was **captured from a real grammar**, not invented:
 * each is the innermost scope Shiki's TextMate tokenizer produced for the quoted
 * fragment of the quoted language, using the same JavaScript regex engine
 * `shikiTokenizer.ts` builds. Written by hand they would drift into scopes no
 * grammar emits, and the table would look covered while colouring nothing.
 *
 * The load-bearing assertion is the last one: every name the table can return
 * has to be a key of `theme.codeHighlight`. A name that is not renders with no
 * class at all — unstyled rather than mis-styled, which is the safe direction,
 * and therefore the direction nobody notices.
 */

import theme from "@/editor/theme";
import {
  type CodeTokenType,
  scopeToTokenType,
  tokenTypeForScopes,
  tokenTypesInUse,
} from "../shikiScopes";

/** `[innermost scope, expected type, the fragment it came from]`. */
type Case = [string, CodeTokenType | null, string];

const CORPUS: Record<string, Case[]> = {
  typescript: [
    ["comment.line.double-slash.ts", "comment", "// a note"],
    // The `//` is a *child* of the comment scope. Without an explicit arm it
    // resolves to `punctuation` and breaks out of the comment's grey italic.
    ["punctuation.definition.comment.ts", "comment", "//"],
    ["keyword.control.export.ts", "keyword", "export"],
    ["storage.type.class.ts", "keyword", "class"],
    ["storage.modifier.ts", "keyword", "extends"],
    ["variable.language.this.ts", "keyword", "this"],
    ["entity.name.type.class.ts", "class-name", "Foo"],
    ["entity.other.inherited-class.ts", "class-name", "Bar"],
    ["entity.name.function.ts", "function", "go"],
    ["support.type.primitive.ts", "builtin", "number"],
    ["variable.parameter.ts", "variable", "s"],
    ["variable.object.property.ts", "variable", "n"],
    ["constant.numeric.hex.ts", "number", "0x1f"],
    ["keyword.operator.type.annotation.ts", "operator", ":"],
    ["keyword.operator.logical.ts", "operator", "&&"],
    ["string.regexp.ts", "regex", "/a+/"],
    // Quotes belong to the string, as they did under prism.
    ["punctuation.definition.string.begin.ts", "string", '"'],
    ["punctuation.terminator.statement.ts", "punctuation", ";"],
    ["punctuation.accessor.ts", "punctuation", "."],
    ["meta.brace.round.ts", "punctuation", "("],
  ],
  javascript: [
    ["storage.type.function.js", "keyword", "function"],
    ["variable.other.constant.js", "variable", "re"],
    ["string.template.js", "string", "`hi ${a}`"],
    ["punctuation.definition.template-expression.begin.js", "punctuation", "${"],
  ],
  python: [
    ["comment.line.number-sign.python", "comment", "# note"],
    ["storage.type.function.python", "keyword", "def"],
    ["keyword.control.flow.python", "keyword", "return"],
    ["constant.language.python", "boolean", "True"],
    ["support.function.builtin.python", "builtin", "len"],
    ["support.type.python", "builtin", "int"],
    [
      "variable.parameter.function.language.special.self.python",
      "variable",
      "self",
    ],
    ["punctuation.section.function.begin.python", "punctuation", ":"],
  ],
  css: [
    // These four are why CSS gets its own arms: `.foo` and `#bar` are filed as
    // attribute names, which would otherwise land on `attr`.
    ["entity.other.attribute-name.class.css", "selector", ".foo"],
    ["entity.other.attribute-name.id.css", "selector", "#bar"],
    ["entity.other.attribute-name.pseudo-class.css", "selector", ":hover"],
    ["entity.other.attribute-name.pseudo-element.css", "selector", "::before"],
    ["support.type.property-name.css", "property", "color"],
    ["constant.other.color.rgb-value.hex.css", "constant", "#fff"],
    ["keyword.other.unit.px.css", "keyword", "px"],
    ["variable.css", "variable", "--x"],
    ["keyword.operator.combinator.css", "operator", ">"],
    ["comment.block.css", "comment", "/* c */"],
  ],
  html: [
    ["entity.name.tag.html", "tag", "div"],
    ["entity.other.attribute-name.html", "attr", "class"],
    ["string.quoted.double.html", "string", '"a"'],
    ["punctuation.definition.tag.begin.html", "punctuation", "<"],
    ["comment.block.html", "comment", "<!-- c -->"],
    ["constant.character.entity.named.amp.html", "char", "&amp;"],
    // Body text is not a token in any grammar's sense.
    ["text.html.basic", null, "text "],
  ],
  markdown: [
    ["entity.name.section.markdown", "important", "Title"],
    ["punctuation.definition.heading.markdown", "important", "#"],
    ["markup.bold.markdown", "important", "**bold**"],
    ["markup.italic.markdown", "important", "*em*"],
    ["markup.inline.raw.string.markdown", "string", "`code`"],
    ["markup.underline.link.markdown", "url", "http://x"],
    ["string.other.link.title.markdown", "url", "[link]"],
    ["punctuation.definition.list.begin.markdown", "punctuation", "-"],
  ],
  shellscript: [
    ["support.function.builtin.shell", "builtin", "echo"],
    ["entity.name.command.shell", "function", "grep"],
    ["string.quoted.double.shell", "string", '"hi $NAME"'],
    ["string.unquoted.argument.shell", "string", "/tmp"],
    ["variable.other.normal.shell", "variable", "$NAME"],
    ["constant.other.option.dash.shell", "constant", "-"],
    ["keyword.operator.pipe.shell", "operator", "|"],
  ],
  sql: [
    // Only reachable at all because the engine is pinned to `target: "ES2024"`
    // — see `shikiTokenizer.ts`. Under the default the whole DML pattern, which
    // is one `(?i:…)` group, silently stops matching and uppercase SQL is
    // entirely unhighlighted.
    ["keyword.other.DML.sql", "keyword", "SELECT"],
    ["support.function.aggregate.sql", "function", "COUNT"],
    ["comment.line.double-dash.sql", "comment", "-- c"],
    ["string.quoted.single.sql", "string", "'x'"],
    ["constant.numeric.sql", "number", "1"],
    ["keyword.operator.comparison.sql", "operator", "="],
  ],
  rust: [
    ["keyword.other.fn.rust", "keyword", "fn"],
    ["storage.type.rust", "keyword", "let"],
    ["entity.name.function.macro.rust", "function", "println!"],
    ["entity.name.type.rust", "class-name", "Result"],
    ["variable.other.rust", "variable", "x"],
    ["keyword.operator.arrow.skinny.rust", "operator", "->"],
    ["punctuation.brackets.curly.rust", "punctuation", "{"],
  ],
  go: [
    ["keyword.package.go", "keyword", "package"],
    ["storage.type.string.go", "keyword", "string"],
    ["constant.language.null.go", "boolean", "nil"],
    ["entity.name.function.go", "function", "f"],
    ["variable.parameter.go", "variable", "a"],
  ],
  java: [
    ["storage.modifier.java", "keyword", "public"],
    ["storage.type.primitive.java", "keyword", "int"],
    ["entity.name.type.class.java", "class-name", "A"],
    ["variable.other.definition.java", "variable", "N"],
    ["comment.block.java", "comment", "/* c */"],
  ],
  c: [
    ["keyword.control.directive.include.c", "keyword", "include"],
    ["storage.type.built-in.primitive.c", "keyword", "int"],
    ["entity.name.function.c", "function", "main"],
    ["string.quoted.other.lt-gt.include.c", "string", "<stdio.h>"],
    ["punctuation.section.block.begin.bracket.curly.c", "punctuation", "{"],
  ],
  cpp: [
    ["storage.type.template.cpp", "keyword", "template"],
    ["entity.name.type.template.cpp", "class-name", "T"],
    [
      "punctuation.section.angle-brackets.begin.template.definition.cpp",
      "punctuation",
      "<",
    ],
  ],
  csharp: [
    ["storage.type.namespace.cs", "keyword", "namespace"],
    ["keyword.type.int.cs", "keyword", "int"],
    ["entity.name.type.class.cs", "class-name", "A"],
    // Not under the `variable.*` root, which is why the table carries an
    // `entity.name.variable` arm.
    ["entity.name.variable.property.cs", "variable", "X"],
    ["keyword.operator.arrow.cs", "operator", "=>"],
  ],
  swift: [
    ["storage.type.function.swift", "keyword", "func"],
    ["support.type.swift", "builtin", "Int"],
    ["entity.name.function.swift", "function", "f"],
    ["punctuation.section.embedded.begin.swift", "punctuation", "\\("],
  ],
  powershell: [
    ["support.function.powershell", "function", "Get-Item"],
    ["variable.other.readwrite.powershell", "variable", "$x"],
    // The `$` sigil belongs with the variable it introduces.
    ["punctuation.definition.variable.powershell", "variable", "$"],
    ["support.variable.automatic.powershell", "variable", "$_"],
    ["comment.line.powershell", "comment", "# c"],
  ],
  xml: [
    ["entity.name.tag.localname.xml", "tag", "a"],
    ["entity.other.attribute-name.localname.xml", "attr", "b"],
    ["string.quoted.double.xml", "string", '"c"'],
    ["comment.block.xml", "comment", "<!-- d -->"],
    ["text.xml", null, "e"],
  ],
  "objective-c": [
    ["storage.type.objc", "keyword", "@interface"],
    ["entity.name.type.objc", "class-name", "A"],
    ["support.class.cocoa.objc", "class-name", "NSString"],
    ["entity.name.function.objc", "function", "go"],
    ["variable.parameter.function.objc", "variable", "s"],
  ],
  diff: [
    ["markup.inserted.diff", "inserted", "+new"],
    ["markup.deleted.diff", "deleted", "-old"],
    ["meta.diff.header.from-file", "comment", "--- a"],
    ["meta.diff.range.diff", "important", "@@ -1 +1 @@"],
    ["punctuation.definition.inserted.diff", "punctuation", "+"],
  ],
};

describe("scopeToTokenType", () => {
  for (const [language, cases] of Object.entries(CORPUS)) {
    describe(language, () => {
      for (const [scope, expected, fragment] of cases) {
        it(`${JSON.stringify(fragment)} → ${expected ?? "plain"}`, () => {
          expect(scopeToTokenType(scope)).toBe(expected);
        });
      }
    });
  }

  it("ignores the language suffix every real scope carries", () => {
    // The table is written without suffixes precisely so one arm covers every
    // language: these are the same rule reached from four grammars.
    for (const scope of [
      "comment.line.double-slash.ts",
      "comment.line.number-sign.python",
      "comment.block.java",
      "comment.line.double-dash.sql",
    ]) {
      expect(scopeToTokenType(scope)).toBe("comment");
    }
  });

  it("prefers the longest matching prefix", () => {
    // Both scopes start `keyword`; only one of them is an operator.
    expect(scopeToTokenType("keyword.control.flow.ts")).toBe("keyword");
    expect(scopeToTokenType("keyword.operator.assignment.ts")).toBe("operator");
    // Both start `punctuation`; the string delimiter is not grey.
    expect(scopeToTokenType("punctuation.terminator.statement.ts")).toBe(
      "punctuation",
    );
    expect(scopeToTokenType("punctuation.definition.string.begin.ts")).toBe(
      "string",
    );
  });

  it("returns null for a scope it has nothing to say about", () => {
    expect(scopeToTokenType("source.ts")).toBeNull();
    expect(scopeToTokenType("meta.var.expr.ts")).toBeNull();
    expect(scopeToTokenType("")).toBeNull();
    expect(scopeToTokenType("wat")).toBeNull();
  });
});

describe("tokenTypeForScopes", () => {
  it("takes the innermost scope that means anything", () => {
    // Real stack, from `const s = "a"`. Reading outermost-first would colour
    // the whole file by `source.ts`.
    expect(
      tokenTypeForScopes([
        "source.ts",
        "meta.var.expr.ts",
        "string.quoted.double.ts",
        "punctuation.definition.string.begin.ts",
      ]),
    ).toBe("string");
  });

  it("falls back outwards when the innermost scope is unknown", () => {
    // A markdown blockquote's prose: `meta.paragraph` says nothing, and the
    // answer comes from the `markup.quote` wrapper one level out.
    expect(
      tokenTypeForScopes([
        "text.html.markdown",
        "markup.quote.markdown",
        "meta.paragraph.markdown",
      ]),
    ).toBe("comment");
    // The same fallback with no arm to land on: a list item's text stays plain,
    // which is only true because the table deliberately has no `markup.list`.
    expect(
      tokenTypeForScopes([
        "text.html.markdown",
        "markup.list.unnumbered.markdown",
        "meta.paragraph.markdown",
      ]),
    ).toBeNull();
  });

  it("carries a shebang's path along with the comment it lives in", () => {
    expect(
      tokenTypeForScopes([
        "source.shell",
        "comment.line.number-sign.shell",
        "meta.shebang.shell",
      ]),
    ).toBe("comment");
  });

  it("returns null for an empty stack", () => {
    expect(tokenTypeForScopes([])).toBeNull();
  });
});

describe("the class channel", () => {
  /**
   * The guard the phase exists for on the *styling* side.
   *
   * A tokenizer emits type strings; Lexical looks each one up in
   * `theme.codeHighlight` to pick a class; the class resolves to a `--tok-*`
   * variable that `theme.css` redefines under `html.dark`. A type this table
   * can return but the theme has never heard of drops out of that chain
   * silently — the node renders, unstyled, in both schemes.
   */
  it("only returns names theme.codeHighlight maps", () => {
    const known = Object.keys(theme.codeHighlight ?? {});
    expect(known.length).toBeGreaterThan(0);
    for (const type of tokenTypesInUse()) {
      expect(known).toContain(type);
    }
  });

  it("covers every type the corpus expects", () => {
    // Catches the reverse mistake: an arm deleted from the table while the
    // corpus above still claims it, which would otherwise only surface as one
    // case flipping to null.
    const used = new Set(tokenTypesInUse());
    for (const cases of Object.values(CORPUS)) {
      for (const [, expected] of cases) {
        if (expected !== null) expect(used).toContain(expected);
      }
    }
  });
});
