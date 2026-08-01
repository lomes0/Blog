import { createHeadlessEditor } from "@lexical/headless";
import {
  LegacyTableCellNode,
  LegacyTableNode,
  LexicalTableRowNode,
  TableCellNode,
  TableNode,
} from "..";
import { LEGACY_TABLE_CELL_TYPE, LEGACY_TABLE_TYPE } from "../legacyTypes";

/**
 * The table nodes carry the app's own `type` strings, which Lexical writes into
 * every serialized table. They were renamed to `blog-*` when the fork's identity
 * was scrubbed; `LegacyTableNode`/`LegacyTableCellNode` are what keep content
 * written before that rename readable — in Revision rows, in a guest's
 * IndexedDB, and in `.zip` backups already on someone's disk.
 *
 * The old strings come from `../legacyTypes` rather than being retyped here, so
 * that a test asserting the aliases still work cannot drift from the aliases.
 *
 * Headless and DOM-free: parsing runs `importJSON`, never `createDOM`.
 */
const editor = () =>
  createHeadlessEditor({
    namespace: "legacy-types-test",
    nodes: [
      TableNode,
      TableCellNode,
      LegacyTableNode,
      LegacyTableCellNode,
      LexicalTableRowNode,
    ],
    onError: (e) => {
      throw e;
    },
  });

const cell = (type: string, text: string) => ({
  type,
  version: 1,
  format: "",
  indent: 0,
  direction: "ltr",
  style: "",
  headerState: 0,
  colSpan: 1,
  rowSpan: 1,
  backgroundColor: null,
  children: [{
    type: "paragraph",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    textFormat: 0,
    textStyle: "",
    children: [{
      type: "text",
      version: 1,
      detail: 0,
      format: 0,
      mode: "normal",
      style: "",
      text,
    }],
  }],
});

const oneRowTable = (tableType: string, cellType: string) => ({
  root: {
    type: "root",
    version: 1,
    format: "",
    indent: 0,
    direction: "ltr",
    children: [{
      type: tableType,
      version: 1,
      format: "",
      indent: 0,
      direction: "ltr",
      style: "",
      id: "",
      rowStriping: false,
      children: [{
        type: "tablerow",
        version: 1,
        format: "",
        indent: 0,
        direction: "ltr",
        children: [cell(cellType, "A"), cell(cellType, "B")],
      }],
    }],
  },
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const parseToJSON = (state: object) =>
  editor().parseEditorState(JSON.stringify(state)).toJSON() as any;

describe("table node type strings", () => {
  // The only assertion here that spells the old strings out. Everything else
  // imports them, which keeps the aliases and their test from drifting apart —
  // but it also means a typo in `legacyTypes.ts` would move both sides at once
  // and pass. These are not names that may be corrected: they are values
  // already written into files this codebase cannot reach, so the constants are
  // pinned to them literally, once.
  it("pins the pre-rename strings", () => {
    expect(LEGACY_TABLE_TYPE).toBe("matheditor-table");
    expect(LEGACY_TABLE_CELL_TYPE).toBe("matheditor-tablecell");
  });

  it("reads a table stored under the current type strings", () => {
    const json = parseToJSON(oneRowTable("blog-table", "blog-tablecell"));
    expect(json.root.children[0].type).toBe("blog-table");
    expect(json.root.children[0].children[0].children[0].type).toBe(
      "blog-tablecell",
    );
  });

  it("reads a table stored under the pre-rename type strings", () => {
    expect(() =>
      parseToJSON(oneRowTable(LEGACY_TABLE_TYPE, LEGACY_TABLE_CELL_TYPE))
    ).not.toThrow();
  });

  it("upgrades pre-rename content in place, losing no cells", () => {
    const json = parseToJSON(
      oneRowTable(LEGACY_TABLE_TYPE, LEGACY_TABLE_CELL_TYPE),
    );
    const table = json.root.children[0];
    const cells = table.children[0].children;

    // The legacy classes are import entry points only: what lands in the editor
    // is a real TableNode, so the next save writes the current type. Nothing
    // rewrites the database — old rows simply keep parsing until they are saved.
    expect(table.type).toBe("blog-table");
    expect(cells.map((c: any) => c.type)).toEqual([
      "blog-tablecell",
      "blog-tablecell",
    ]);
    expect(cells.map((c: any) => c.children[0].children[0].text)).toEqual([
      "A",
      "B",
    ]);
  });

  it("would fail loudly on an unregistered type, which is why the aliases exist", () => {
    expect(() => parseToJSON(oneRowTable("some-other-table", "blog-tablecell")))
      .toThrow();
  });
});
