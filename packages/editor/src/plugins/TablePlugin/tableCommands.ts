/**
 * The table operations, as `$` functions over a cell rather than as closures
 * over one menu's state.
 *
 * Everything here was inline in `ToolbarPlugin/Tools/TableTools.tsx` and had
 * exactly one caller. It moved when the hover handles
 * (`TableRowColumnHandles.tsx`) became a second surface for the same
 * operations: two copies of a header toggle is how the two surfaces start
 * disagreeing about what a header is.
 *
 * The shape is deliberate. A toolbar menu acts on **the cell the caret is in**;
 * a hover handle acts on **the cell the pointer is over**, which is usually not
 * the same cell and may be in a table the selection is nowhere near. So nothing
 * below reads the selection to find its subject — the subject arrives as an
 * argument, and the two callers each resolve it their own way. The exceptions
 * are the three that are *about* the selection (`$canUnmerge`,
 * `$mergeCellsAtSelection`, `$getSelectedTableCell`), and they say so in the
 * name.
 *
 * `$selectCell` is what lets a hover handle use upstream's selection-driven
 * insert/delete helpers: place a collapsed selection in the anchor cell, then
 * call them, both inside one `editor.update` so the helpers see the pending
 * selection rather than the previous one.
 */
import type { ElementNode, LexicalEditor } from "lexical";
import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
} from "lexical";
import {
  $getNodeTriplet,
  $getTableCellNodeFromLexicalNode,
  $getTableColumnIndexFromTableCellNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowIndexFromTableCellNode,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  $unmergeCell,
  TableCellHeaderStates,
  LexicalTableNode,
  TableCellNode,
  TableRowNode,
  TableSelection,
} from "@/editor/nodes/TableNode";

export function computeSelectionCount(selection: TableSelection): {
  columns: number;
  rows: number;
} {
  const selectionShape = selection.getShape();
  return {
    columns: selectionShape.toX - selectionShape.fromX + 1,
    rows: selectionShape.toY - selectionShape.fromY + 1,
  };
}

/**
 * Whether the cell at the selection anchor is a merged one.
 *
 * The proof that the anchor is inside a table is not ceremony:
 * `$getNodeTriplet` *throws* when it is not, and a hover handle can be opened
 * while the caret sits in an ordinary paragraph three blocks away. The toolbar
 * menu could never reach that state, which is why the original had no such
 * check.
 */
export function $canUnmerge(): boolean {
  const selection = $getSelection();
  if (
    ($isRangeSelection(selection) && !selection.isCollapsed()) ||
    ($isTableSelection(selection) && !selection.anchor.is(selection.focus)) ||
    (!$isRangeSelection(selection) && !$isTableSelection(selection))
  ) {
    return false;
  }
  const anchorCell = $getTableCellNodeFromLexicalNode(
    selection.anchor.getNode(),
  );
  if (!$isTableCellNode(anchorCell)) {
    return false;
  }
  const [cell] = $getNodeTriplet(selection.anchor);
  return cell.__colSpan > 1 || cell.__rowSpan > 1;
}

/** Whether the current selection spans more than one cell. */
export function $canMerge(): boolean {
  const selection = $getSelection();
  if (!$isTableSelection(selection)) return false;
  const { columns, rows } = computeSelectionCount(selection);
  return columns > 1 || rows > 1;
}

function $cellContainsEmptyParagraph(cell: TableCellNode): boolean {
  if (cell.getChildrenSize() !== 1) {
    return false;
  }
  const firstChild = cell.getFirstChildOrThrow();
  if (!$isParagraphNode(firstChild) || !firstChild.isEmpty()) {
    return false;
  }
  return true;
}

function $selectLastDescendant(node: ElementNode): void {
  const lastDescendant = node.getLastDescendant();
  if ($isTextNode(lastDescendant)) {
    lastDescendant.select();
  } else if ($isElementNode(lastDescendant)) {
    lastDescendant.selectEnd();
  } else if (lastDescendant !== null) {
    lastDescendant.selectNext();
  }
}

/** Collapse the merged cells of a `TableSelection` into the first of them. */
export function $mergeCellsAtSelection(): void {
  const selection = $getSelection();
  if (!$isTableSelection(selection)) return;

  const { columns, rows } = computeSelectionCount(selection);
  const nodes = selection.getNodes();
  let firstCell: null | TableCellNode = null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if ($isTableCellNode(node)) {
      if (firstCell === null) {
        node.setColSpan(columns).setRowSpan(rows);
        firstCell = node;
        const isEmpty = $cellContainsEmptyParagraph(node);
        let firstChild;
        if (isEmpty && $isParagraphNode(firstChild = node.getFirstChild())) {
          firstChild.remove();
        }
      } else if ($isTableCellNode(firstCell)) {
        const isEmpty = $cellContainsEmptyParagraph(node);
        if (!isEmpty) {
          firstCell.append(...node.getChildren());
        }
        node.remove();
      }
    }
  }
  if (firstCell !== null) {
    if (firstCell.getChildrenSize() === 0) {
      firstCell.append($createParagraphNode());
    }
    $selectLastDescendant(firstCell);
  }
}

/** Split the merged cell at the selection anchor back into its own cells. */
export function $unmergeCellAtSelection(): void {
  $unmergeCell();
}

/**
 * The cell the caret is in, or `null`.
 *
 * Was duplicated verbatim in `TableTools.tsx` and `TableCellResizer.tsx`; both
 * now import it.
 */
export function $getSelectedTableCell(
  editor: LexicalEditor,
): TableCellNode | null {
  const selection = $getSelection();
  const nativeSelection = window.getSelection();
  const activeElement = document.activeElement;

  if (selection == null) {
    return null;
  }

  const rootElement = editor.getRootElement();

  if (
    $isRangeSelection(selection) &&
    rootElement !== null &&
    nativeSelection !== null &&
    rootElement.contains(nativeSelection.anchorNode)
  ) {
    const tableCellNodeFromSelection = $getTableCellNodeFromLexicalNode(
      selection.anchor.getNode(),
    );

    if (!$isTableCellNode(tableCellNodeFromSelection)) {
      return null;
    }

    const tableCellParentNodeDOM = editor.getElementByKey(
      tableCellNodeFromSelection.getKey(),
    );

    if (tableCellParentNodeDOM == null) {
      return null;
    }

    return tableCellNodeFromSelection;
  } else if (!activeElement) {
    return null;
  }
  return null;
}

/**
 * Put a collapsed selection at the start of `cell`.
 *
 * Upstream's insert/delete helpers all take their subject from the selection,
 * so this is the adapter between a pointer-anchored surface and a
 * caret-anchored API. Call it in the same `editor.update` as the helper.
 */
export function $selectCell(cell: TableCellNode): void {
  cell.selectStart();
}

export function $isRowHeader(cell: TableCellNode): boolean {
  return (cell.getHeaderStyles() & TableCellHeaderStates.ROW) ===
    TableCellHeaderStates.ROW;
}

export function $isColumnHeader(cell: TableCellNode): boolean {
  return (cell.getHeaderStyles() & TableCellHeaderStates.COLUMN) ===
    TableCellHeaderStates.COLUMN;
}

/** Toggle the header state of every cell in `cell`'s row. */
export function $toggleRowHeader(cell: TableCellNode): void {
  const tableNode = $getTableNodeFromLexicalNodeOrThrow(cell);
  const tableRowIndex = $getTableRowIndexFromTableCellNode(cell);
  const tableRows = tableNode.getChildren();

  if (tableRowIndex >= tableRows.length || tableRowIndex < 0) {
    throw new Error("Expected table cell to be inside of table row.");
  }

  const tableRow = tableRows[tableRowIndex];

  if (!$isTableRowNode(tableRow)) {
    throw new Error("Expected table row");
  }

  const newStyle = cell.getHeaderStyles() ^ TableCellHeaderStates.ROW;
  tableRow.getChildren().forEach((tableCell) => {
    if (!$isTableCellNode(tableCell)) {
      throw new Error("Expected table cell");
    }

    tableCell.setHeaderStyles(newStyle, TableCellHeaderStates.ROW);
  });
}

/** Toggle the header state of every cell in `cell`'s column. */
export function $toggleColumnHeader(cell: TableCellNode): void {
  const tableNode = $getTableNodeFromLexicalNodeOrThrow(cell);
  const tableColumnIndex = $getTableColumnIndexFromTableCellNode(cell);

  const tableRows = tableNode.getChildren<TableRowNode>();
  const maxRowsLength = Math.max(
    ...tableRows.map((row) => row.getChildren().length),
  );

  if (tableColumnIndex >= maxRowsLength || tableColumnIndex < 0) {
    throw new Error("Expected table cell to be inside of table row.");
  }

  const newStyle = cell.getHeaderStyles() ^ TableCellHeaderStates.COLUMN;
  for (let r = 0; r < tableRows.length; r++) {
    const tableRow = tableRows[r];

    if (!$isTableRowNode(tableRow)) {
      throw new Error("Expected table row");
    }

    const tableCells = tableRow.getChildren();
    if (tableColumnIndex >= tableCells.length) {
      // if cell is outside of bounds for the current row (for example various merge cell cases) we shouldn't highlight it
      continue;
    }

    const tableCell = tableCells[tableColumnIndex];

    if (!$isTableCellNode(tableCell)) {
      throw new Error("Expected table cell");
    }

    tableCell.setHeaderStyles(newStyle, TableCellHeaderStates.COLUMN);
  }
}

export function $toggleRowStriping(table: LexicalTableNode): void {
  table.setRowStriping(!table.getRowStriping());
}

/**
 * The table `cell` belongs to.
 *
 * Typed as upstream's `TableNode` rather than ours: `$getTableNodeFrom
 * LexicalNodeOrThrow` is upstream's, so that is what it can promise. Every
 * table in this editor is in fact our subclass — `registration.ts` replaces
 * them — but nothing here needs the `id`/`style` half of it.
 */
export function $getTableFromCell(cell: TableCellNode): LexicalTableNode {
  return $getTableNodeFromLexicalNodeOrThrow(cell);
}
