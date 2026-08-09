/**
 * Every content tool renders its own label (docs/plans/haklex-adoption.md §7.3).
 *
 * What is actually at stake is that a tool added to `READ_TOOLS`/`WRITE_TOOLS`
 * does not silently regress the transcript to its wire name. The `satisfies
 * Record<AgentToolName, …>` in `copilotAgentTools.ts` makes the *missing* case a
 * compile error; this pins the rest — that each label is real English about the
 * call's arguments, and that the fallback still catches a name only a persisted
 * thread has.
 */
import {
  type AgentToolName,
  describePendingToolCall,
  describeToolCall,
  READ_TOOLS,
  WRITE_TOOLS,
} from "../copilotAgentTools";

/**
 * A representative call per tool: enough arguments that a label reading them
 * differs from one that does not.
 *
 * `satisfies` rather than an annotation, for the same reason `codecs.test.ts`
 * uses it — the Record is what makes a tool with no fixture a compile error,
 * and it is the whole point of this file that the table stays total.
 */
const CALLS = {
  list_posts: {},
  list_series: {},
  search: { query: "fractional ranks" },
  outline: { id: "doc-1" },
  read_blocks: { blocks: ["b2", "b4.1"] },
  read_post: { id: "doc-1" },
  get_selection: {},
  apply_ops: {
    id: "doc-1",
    stateHash: "h1",
    ops: [
      { op: "set_text", id: "intro", text: "hello" },
      { op: "delete_block", id: "b7" },
      { op: "insert_blocks", after: "b9", blocks: [] },
    ],
  },
  create_post: { title: "On ranks", blocks: [] },
} satisfies Record<AgentToolName, Record<string, unknown>>;

const ALL: AgentToolName[] = [...READ_TOOLS, ...WRITE_TOOLS];

describe("describeToolCall", () => {
  it.each(ALL)("labels %s in English, not its wire name", (name) => {
    const label = describeToolCall(name, CALLS[name]);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe(name);
    expect(label).not.toBe(name.replace(/_/g, " "));
    expect(label).not.toContain("_");
    // Sentence-shaped: starts with a capital, carries no leftover placeholder.
    expect(label[0]).toBe(label[0].toUpperCase());
    expect(label).not.toContain("undefined");
  });

  it("has one entry per tool and no others", () => {
    expect(Object.keys(CALLS).sort()).toEqual([...ALL].sort());
  });

  it("reads the search query back", () => {
    expect(describeToolCall("search", { query: "ranks" })).toBe(
      "Searched “ranks”",
    );
  });

  it("counts blocks read, singular and plural", () => {
    expect(describeToolCall("read_blocks", { blocks: ["b1"] })).toBe(
      "Read 1 block",
    );
    expect(describeToolCall("read_blocks", { blocks: ["b1", "b2"] })).toBe(
      "Read 2 blocks",
    );
  });

  it("says which document a read acted on, or that it was the open one", () => {
    expect(describeToolCall("read_post", { id: "doc-1" })).toBe("Read doc-1");
    expect(describeToolCall("read_post", {})).toBe("Read this document");
    expect(describeToolCall("outline", {})).toBe("Outlined this document");
  });

  describe("apply_ops", () => {
    const ops = (...targets: string[]) => ({
      ops: targets.map((id) => ({ op: "set_text", id, text: "x" })),
    });

    it("reflects the op count and the target block", () => {
      expect(describeToolCall("apply_ops", ops("intro"))).toBe(
        "Proposed 1 edit to intro",
      );
    });

    it("names two targets, then counts the rest", () => {
      expect(describeToolCall("apply_ops", ops("intro", "b4"))).toBe(
        "Proposed 2 edits to intro and b4",
      );
      expect(describeToolCall("apply_ops", ops("b1", "b2", "b3"))).toBe(
        "Proposed 3 edits to b1, b2 and 1 other",
      );
      expect(describeToolCall("apply_ops", ops("b1", "b2", "b3", "b4"))).toBe(
        "Proposed 4 edits to b1, b2 and 2 others",
      );
    });

    it("counts a block once however many ops name it", () => {
      expect(describeToolCall("apply_ops", ops("intro", "intro"))).toBe(
        "Proposed 2 edits to intro",
      );
    });

    it("describes an insert by the anchor it lands against", () => {
      expect(
        describeToolCall("apply_ops", {
          ops: [{ op: "insert_blocks", after: "b3", blocks: [] }],
        }),
      ).toBe("Proposed 1 edit to b3");
      expect(
        describeToolCall("apply_ops", {
          ops: [{ op: "insert_blocks", appendTo: "root", blocks: [] }],
        }),
      ).toBe("Proposed 1 edit to root");
    });

    it("still counts when no op names anything", () => {
      expect(describeToolCall("apply_ops", { ops: [{ op: "bogus" }] })).toBe(
        "Proposed 1 edit",
      );
    });
  });

  it("names the created post, and copes with a call missing its title", () => {
    expect(describeToolCall("create_post", { title: "On ranks" })).toBe(
      "Created “On ranks”",
    );
    expect(describeToolCall("create_post", {})).toBe("Created a draft");
  });

  it("falls back readably for a name this build no longer has", () => {
    // A thread persisted before the §4.2 rename replays these.
    expect(describeToolCall("read_document", { id: "x" })).toBe(
      "read document",
    );
    expect(describeToolCall("edit_document", {})).toBe("edit document");
  });

  it("survives a call with no input at all", () => {
    for (const name of ALL) {
      expect(describeToolCall(name).length).toBeGreaterThan(0);
      expect(describeToolCall(name)).not.toContain("undefined");
    }
  });
});

describe("describePendingToolCall", () => {
  it("is progressive and input-aware for both writes", () => {
    expect(
      describePendingToolCall("apply_ops", {
        ops: [
          { op: "set_text", id: "intro", text: "x" },
          { op: "delete_block", id: "b4" },
        ],
      }),
    ).toBe("Proposing 2 edits to intro and b4…");
    expect(describePendingToolCall("create_post", { title: "On ranks" })).toBe(
      "Creating “On ranks”…",
    );
    expect(describePendingToolCall("create_post", {})).toBe(
      "Creating a draft…",
    );
  });

  it("differs from the completed label for every write", () => {
    for (const name of WRITE_TOOLS) {
      expect(describePendingToolCall(name, CALLS[name])).not.toBe(
        describeToolCall(name, CALLS[name]),
      );
    }
  });

  it("falls back to the completed label for anything else", () => {
    expect(describePendingToolCall("search", { query: "x" })).toBe(
      describeToolCall("search", { query: "x" }),
    );
    expect(describePendingToolCall("edit_document", {})).toBe("edit document");
  });
});
