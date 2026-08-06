/**
 * The gate on §4.5 of docs/plans/claude-code-lexical.md.
 *
 * `set_text` is only safe if a block's inline formatting survives being
 * rendered to Markdown and parsed back. Ten marks is more than Markdown was
 * built to carry, so this asserts `parse(render(x)) === normalize(x)` over a
 * corpus that deliberately includes literal marker characters — the case where
 * a naive escaping scheme quietly eats the author's text.
 */
import {
  IS_BOLD,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from "lexical";
import {
  normalizeInline,
  parseInline,
  renderInline,
} from "@/lib/content-bridge/inline";
import type { SerializedNode } from "@/lib/content-bridge/types";

const t = (text: string, format = 0): SerializedNode => ({
  type: "text",
  version: 1,
  text,
  detail: 0,
  format,
  mode: "normal",
  style: "",
});

const math = (value: string): SerializedNode => ({
  type: "math",
  version: 1,
  value,
  style: "",
  id: "",
});

const link = (url: string, children: SerializedNode[]): SerializedNode => ({
  type: "link",
  version: 1,
  url,
  children,
  direction: null,
  format: "",
  indent: 0,
  rel: null,
  target: null,
  title: null,
});

/** Assert the round-trip is an identity, and report the Markdown when it isn't. */
const roundTrips = (children: SerializedNode[]) => {
  const markdown = renderInline(children);
  expect(markdown).not.toBeNull();
  expect({ markdown, nodes: parseInline(markdown!) }).toEqual({
    markdown,
    nodes: normalizeInline(children),
  });
};

describe("inline round-trip", () => {
  it("preserves every mark on its own", () => {
    const marks = [
      IS_BOLD,
      IS_ITALIC,
      IS_STRIKETHROUGH,
      IS_UNDERLINE,
      IS_CODE,
      IS_SUBSCRIPT,
      IS_SUPERSCRIPT,
      IS_HIGHLIGHT,
    ];
    for (const format of marks) {
      roundTrips([t("before "), t("marked", format), t(" after")]);
    }
  });

  it("preserves the four marks Markdown cannot spell", () => {
    // The reason §4.5 exists: a bold/italic/code/strike-only vocabulary would
    // drop each of these silently on the way back.
    roundTrips([t("underlined", IS_UNDERLINE)]);
    roundTrips([t("highlighted", IS_HIGHLIGHT)]);
    roundTrips([t("x", IS_SUPERSCRIPT)]);
    roundTrips([t("n", IS_SUBSCRIPT)]);
  });

  it("preserves combined marks", () => {
    roundTrips([t("both", IS_BOLD | IS_ITALIC)]);
    roundTrips([t("three", IS_BOLD | IS_UNDERLINE | IS_HIGHLIGHT)]);
    roundTrips([t("code+bold", IS_CODE | IS_BOLD)]);
    roundTrips([t("sup+strike", IS_SUPERSCRIPT | IS_STRIKETHROUGH)]);
  });

  it("preserves literal marker characters in plain text", () => {
    const literals = [
      "2 * 3 = 6",
      "a + b = c",
      "2 + 2 = 4 and 3 == 3",
      "snake_case_name",
      "arr[0] and arr[1]",
      "cost: $40, not $50",
      "tilde ~ and double ~~",
      "italic __markers__ literal",
      "comma,, doubled",
      "caret ^ exponent",
      "back\\slash",
      "a `backtick` in prose",
      "++plus++ and ==equals==",
      "**not bold** literally",
      "[not a link] (really)",
      "mixed *~^`$[]\\=_,+ chars",
    ];
    for (const text of literals) roundTrips([t(text)]);
  });

  it("keeps code spans literal without escaping their contents", () => {
    roundTrips([t("arr[0] * 2", IS_CODE)]);
    roundTrips([t("a `nested` tick", IS_CODE)]);
    roundTrips([t("$not math$", IS_CODE)]);
    // Content touching a backtick at either end would run into its own fence.
    roundTrips([t("`leading", IS_CODE)]);
    roundTrips([t("trailing`", IS_CODE)]);
    roundTrips([t("`both`", IS_CODE)]);
    // Code content should read naturally rather than come out escaped.
    expect(renderInline([t("arr[0]", IS_CODE)])).toBe("`arr[0]`");
  });

  it("preserves links, including formatted link text", () => {
    roundTrips([link("/x", [t("here")])]);
    roundTrips([t("see "), link("https://a.example/b?c=1", [t("this")])]);
    roundTrips([link("/x", [t("bold link", IS_BOLD)])]);
    roundTrips([link("/paren(s)", [t("odd url")])]);
  });

  it("preserves math, backslashes intact", () => {
    roundTrips([math("\\nabla f(x)^T d < 0")]);
    roundTrips([t("inline "), math("x_k"), t(" and prose")]);
    roundTrips([math("\\frac{1}{2}")]);
    // LaTeX must survive readably, not as an escaped mess.
    expect(renderInline([math("\\nabla f(x)")])).toBe("$\\nabla f(x)$");
  });

  it("preserves linebreaks and tabs", () => {
    roundTrips([t("one"), { type: "linebreak", version: 1 }, t("two")]);
  });

  it("refuses content it cannot spell, rather than dropping it", () => {
    // An inline text colour has no spelling here — the block goes text-opaque.
    expect(renderInline([{ ...t("coloured"), style: "color: #f00" }])).toBeNull();
    // So does an inline node type with no codec.
    expect(renderInline([{ type: "sticky", version: 1 }])).toBeNull();
    // And a format bit outside the mark set.
    expect(renderInline([{ ...t("odd"), format: 1 << 20 }])).toBeNull();
  });

  it("survives randomized runs", () => {
    // Deterministic PRNG: a flake here would be unreproducible otherwise.
    let seed = 0x2f6e2b1;
    const rand = () => {
      seed = (Math.imul(seed, 48271) + 11) >>> 0;
      return seed / 0xffffffff;
    };
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

    const fragments = [
      "plain",
      "with *star",
      "under_score",
      "a[b]c",
      "$dollar",
      "tick`mark",
      "eq==eq",
      "plus++plus",
      "tilde~t",
      "caret^c",
      "back\\slash",
      " ",
    ];
    const bits = [
      0,
      IS_BOLD,
      IS_ITALIC,
      IS_CODE,
      IS_UNDERLINE,
      IS_HIGHLIGHT,
      IS_STRIKETHROUGH,
      IS_SUPERSCRIPT,
      IS_SUBSCRIPT,
      IS_BOLD | IS_ITALIC,
      IS_HIGHLIGHT | IS_BOLD,
    ];

    for (let iteration = 0; iteration < 400; iteration++) {
      const children: SerializedNode[] = [];
      const length = 1 + Math.floor(rand() * 5);
      for (let i = 0; i < length; i++) {
        const roll = rand();
        if (roll < 0.15) children.push(math(pick(["x", "\\alpha", "a_1"])));
        else if (roll < 0.3) {
          children.push(link(pick(["/a", "https://e.example"]), [t(pick(fragments))]));
        } else children.push(t(pick(fragments), pick(bits)));
      }
      roundTrips(children);
    }
  });
});
