"use client";
import {
  $createParagraphNode,
  $getPreviousSelection,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  ElementFormatType,
  ElementNode,
  LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getNodeTriplet,
  $getTableCellNodeFromLexicalNode,
  $getTableColumnIndexFromTableCellNode,
  $getTableNodeFromLexicalNodeOrThrow,
  $getTableRowIndexFromTableCellNode,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  $unmergeCell,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
  TableSelection,
} from "@/editor/nodes/TableNode";
import {
  $getNodeStyleValueForProperty,
  $patchStyle,
  getStyleObjectFromCSS,
} from "@/editor/nodes/utils";
import ColorPicker from "./ColorPicker";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Grid3x3,
  Table,
  Trash2,
} from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import {
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  getActionButtonClassName,
} from "@/editor/ui";
import * as menuCss from "../Menus/menus.css";
import * as css from "./tools.css";

/** The same labelled trigger as `Insert`, `Note` and `AI` — see `menus.css`. */
const triggerClass = cx(
  getActionButtonClassName({ variant: "outline", size: "lg" }),
  menuCss.menuTrigger,
);

const toggleClass = getActionButtonClassName({ size: "md", icon: true });

function computeSelectionCount(selection: TableSelection): {
  columns: number;
  rows: number;
} {
  const selectionShape = selection.getShape();
  return {
    columns: selectionShape.toX - selectionShape.fromX + 1,
    rows: selectionShape.toY - selectionShape.fromY + 1,
  };
}

function $canUnmerge(): boolean {
  const selection = $getSelection();
  if (
    ($isRangeSelection(selection) && !selection.isCollapsed()) ||
    ($isTableSelection(selection) &&
      !selection.anchor.is(selection.focus)) ||
    (!$isRangeSelection(selection) && !$isTableSelection(selection))
  ) {
    return false;
  }
  const [cell] = $getNodeTriplet(selection.anchor);
  return cell.__colSpan > 1 || cell.__rowSpan > 1;
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

/**
 * The Material Symbols marks this menu uses, as plain `<svg>` rather than MUI's
 * `SvgIcon`. Two things came from that wrapper and both are now attributes:
 * the glyph size (`fontSize="small"`) and, for four of them, a rotation that
 * was an `sx`. Everything else was already the raw path.
 *
 * The size passed here is only the intrinsic one — inside a menu row
 * `ui/menu.css`'s `applyItemSvgStyles` sizes the icon column, and that is
 * deliberate: the caller sizes a toolbar glyph, the menu sizes its own.
 */
const Mark = (
  { d, rotate }: { d: string; rotate?: number },
) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
    viewBox="0 -960 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d={d} />
  </svg>
);

const FormatImageRight = () => (
  <Mark d="M450-285v-390h390v390H450Zm60-60h270v-270H510v270ZM120-120v-60h720v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h720v60H120Z" />
);

const FormatImageLeft = () => (
  <Mark d="M120-285v-390h390v390H120Zm60-60h270v-270H180v270Zm-60-435v-60h720v60H120Zm450 165v-60h270v60H570Zm0 165v-60h270v60H570Zm0 165v-60h270v60H570ZM120-120v-60h720v60H120Z" />
);

const CellMerge = () => (
  <Mark d="M120-120v-240h80v160h160v80H120Zm480 0v-80h160v-160h80v240H600ZM287-327l-57-56 57-57H80v-80h207l-57-57 57-56 153 153-153 153Zm386 0L520-480l153-153 57 56-57 57h207v80H673l57 57-57 56ZM120-600v-240h240v80H200v160h-80Zm640 0v-160H600v-80h240v240h-80Z" />
);

const TextRotationNone = () => (
  <Mark d="M160-200v-80h528l-42-42 56-56 138 138-138 138-56-56 42-42H160Zm116-200 164-440h80l164 440h-76l-38-112H392l-40 112h-76Zm138-176h132l-64-182h-4l-64 182Z" />
);

const TextRotationVertical = () => (
  <Mark d="m436-320 164-440h80l164 440h-76l-40-112H552l-40 112h-76Zm138-176h132l-64-182h-4l-64 182ZM240-160 100-300l56-56 44 42v-526h80v526l44-42 56 56-140 140Z" />
);

const AddRowAbove = () => (
  <Mark d="M200-160h560v-240H200v240Zm640 80H120v-720h160v80h-80v240h560v-240h-80v-80h160v720ZM480-480Zm0 80v-80 80Zm0 0Zm-40-240v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

const AddRowBelow = () => (
  <Mark d="M200-560h560v-240H200v240Zm-80 400v-720h720v720H680v-80h80v-240H200v240h80v80H120Zm360-320Zm0-80v80-80Zm0 0ZM440-80v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

const AddColumnLeft = () => (
  <Mark d="M800-200v-560H560v560h240Zm-640 80v-160h80v80h240v-560H240v80h-80v-160h720v720H160Zm320-360Zm80 0h-80 80Zm0 0ZM160-360v-80H80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

const AddColumnRight = () => (
  <Mark d="M160-760v560h240v-560H160ZM80-120v-720h720v160h-80v-80H480v560h240v-80h80v160H80Zm400-360Zm-80 0h80-80Zm0 0Zm320 120v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

const RemoveRow = () => (
  <Mark d="M560-280H120v-400h720v120h-80v-40H200v240h360v80Zm-360-80v-240 240Zm440 104 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83-56-56Z" />
);

const RemoveColumn = () => (
  <Mark
    d="M560-280H120v-400h720v120h-80v-40H200v240h360v80Zm-360-80v-240 240Zm440 104 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83-56-56Z"
    rotate={90}
  />
);

const RemoveRowHeader = () => (
  <Mark d="M120-280v-400h720v400H120Zm80-80h560v-240H200v240Zm0 0v-240 240Z" />
);

const RemoveColumnHeader = () => (
  <Mark
    d="M120-280v-400h720v400H120Zm80-80h560v-240H200v240Zm0 0v-240 240Z"
    rotate={90}
  />
);

const AddRowHeader = () => (
  <Mark
    d="m272-104-38-38-42 42q-19 19-46.5 19.5T100-100q-19-19-19-46t19-46l42-42-38-40 554-554q12-12 29-12t29 12l112 112q12 12 12 29t-12 29L272-104Zm172-396L216-274l58 58 226-228-56-56Z"
    rotate={45}
  />
);

const AddColumnHeader = () => (
  <Mark
    d="m272-104-38-38-42 42q-19 19-46.5 19.5T100-100q-19-19-19-46t19-46l42-42-38-40 554-554q12-12 29-12t29 12l112 112q12 12 12 29t-12 29L272-104Zm172-396L216-274l58 58 226-228-56-56Z"
    rotate={-45}
  />
);

const $getSelectedTableCell = (editor: LexicalEditor): TableCellNode | null => {
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
};

export default function TableTools(
  { editor, node }: { editor: LexicalEditor; node: TableNode },
) {
  const [formatType, setFormatType] = useState<ElementFormatType>();
  const [float, setFloat] = useState<string>();
  const [selectionCounts, setSelectionCounts] = useState({
    columns: 1,
    rows: 1,
  });
  const [canMergeCells, setCanMergeCells] = useState(false);
  const [canUnmergeCell, setCanUnmergeCell] = useState(false);
  const [tableCellNode, setTableCellNode] = useState<TableCellNode | null>(
    null,
  );
  const [tableCellStyle, setTableCellStyle] = useState<
    Record<string, string> | null
  >(null);
  const [open, setOpen] = useState(false);
  const textColor = tableCellStyle?.color;
  const backgroundColor = tableCellStyle?.["background-color"];

  const getCellStyle = useCallback((): Record<string, string> | null => {
    return editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) || $isTableSelection(selection)) {
        const [cell] = $getNodeTriplet(selection.anchor);
        if ($isTableCellNode(cell)) {
          const css = cell.getStyle();
          const style = getStyleObjectFromCSS(css);
          return style;
        }
      }
      return null;
    });
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        const tableCell = $getSelectedTableCell(editor);
        setTableCellNode(tableCell);
      });
    });
  }, [editor]);

  useEffect(() => {
    if (tableCellNode === null) return;
    return editor.registerMutationListener(
      TableCellNode,
      (nodeMutations) => {
        const nodeUpdated =
          nodeMutations.get(tableCellNode.getKey()) === "updated";

        if (nodeUpdated) {
          editor.getEditorState().read(() => {
            setTableCellNode(tableCellNode.getLatest());
          });
          const cellStyle = getCellStyle();
          setTableCellStyle(cellStyle);
        }
      },
    );
  }, [editor, tableCellNode, getCellStyle]);

  useEffect(() => {
    if (!open) return;
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      // Merge cells
      if ($isTableSelection(selection)) {
        const currentSelectionCounts = computeSelectionCount(selection);
        setSelectionCounts(currentSelectionCounts);
        setCanMergeCells(
          currentSelectionCounts.columns > 1 ||
            currentSelectionCounts.rows > 1,
        );
      } else {
        setSelectionCounts({ columns: 1, rows: 1 });
        setCanMergeCells(false);
      }
      // Unmerge cell
      setCanUnmergeCell($canUnmerge());
    });
  }, [editor, open, tableCellNode]);

  const mergeTableCellsAtSelection = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isTableSelection(selection)) {
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
              if (
                isEmpty &&
                $isParagraphNode(
                  firstChild = node.getFirstChild(),
                )
              ) {
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
    });
  };

  const unmergeTableCellsAtSelection = () => {
    editor.update(() => {
      $unmergeCell();
    });
  };

  const handleCellMerge = () => {
    if (canMergeCells) {
      mergeTableCellsAtSelection();
    } else if (canUnmergeCell) {
      unmergeTableCellsAtSelection();
    }
  };

  const insertTableRowAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        $insertTableRow__EXPERIMENTAL(shouldInsertAfter);
      });
    },
    [editor],
  );

  const insertTableColumnAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        for (let i = 0; i < selectionCounts.columns; i++) {
          $insertTableColumn__EXPERIMENTAL(shouldInsertAfter);
        }
      });
    },
    [editor, selectionCounts.columns],
  );

  const restoreFocus = useCallback(() => {
    setTimeout(() => {
      editor.update(() => {
        const selection = $getSelection() || $getPreviousSelection();
        if (!selection) return;
        $setSelection(selection.clone());
      }, {
        discrete: true,
        onUpdate() {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        },
      });
    }, 0);
  }, [editor]);

  /*
   * The three deletes used to call `handleClose()` from inside their
   * `editor.update` — that call was `closeMenu()` plus `restoreFocus()`, and
   * closing is now the menu's own job: `Menu.Item` closes on click. What is
   * left of it lives in `handleOpenChange` below, which runs on *every* close
   * (item, Escape, outside press) rather than only on the three that
   * remembered to ask. The table commands themselves are untouched.
   */
  const deleteTableRowAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableRow__EXPERIMENTAL();
    });
  }, [editor]);

  const deleteTableAtSelection = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => {
      node.selectPrevious();
      node.remove();
    });
  }, [editor, node, tableCellNode]);

  const deleteTableColumnAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableColumn__EXPERIMENTAL();
    });
  }, [editor]);

  const getTableRowHeaderState = useCallback(() => {
    if (tableCellNode === null) return TableCellHeaderStates.NO_STATUS;
    return tableCellNode.__headerState & TableCellHeaderStates.ROW;
  }, [tableCellNode]);

  const getTableColumnHeaderState = useCallback(() => {
    if (tableCellNode === null) return TableCellHeaderStates.NO_STATUS;
    return tableCellNode.__headerState & TableCellHeaderStates.COLUMN;
  }, [tableCellNode]);

  const getTableRowStriping = useCallback(() => {
    return editor.getEditorState().read(() => {
      if (node.isAttached()) {
        return node.getRowStriping();
      }
      return node.__rowStriping;
    });
  }, [editor, node]);

  const toggleTableRowIsHeader = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(
        tableCellNode,
      );

      const tableRowIndex = $getTableRowIndexFromTableCellNode(
        tableCellNode,
      );

      const tableRows = tableNode.getChildren();

      if (tableRowIndex >= tableRows.length || tableRowIndex < 0) {
        throw new Error(
          "Expected table cell to be inside of table row.",
        );
      }

      const tableRow = tableRows[tableRowIndex];

      if (!$isTableRowNode(tableRow)) {
        throw new Error("Expected table row");
      }

      const newStyle = tableCellNode.getHeaderStyles() ^
        TableCellHeaderStates.ROW;
      tableRow.getChildren().forEach((tableCell) => {
        if (!$isTableCellNode(tableCell)) {
          throw new Error("Expected table cell");
        }

        tableCell.setHeaderStyles(newStyle, TableCellHeaderStates.ROW);
      });
    });
  }, [editor, tableCellNode]);

  const toggleTableColumnIsHeader = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(
        tableCellNode,
      );

      const tableColumnIndex = $getTableColumnIndexFromTableCellNode(
        tableCellNode,
      );

      const tableRows = tableNode.getChildren<TableRowNode>();
      const maxRowsLength = Math.max(
        ...tableRows.map((row) => row.getChildren().length),
      );

      if (tableColumnIndex >= maxRowsLength || tableColumnIndex < 0) {
        throw new Error(
          "Expected table cell to be inside of table row.",
        );
      }

      const newStyle = tableCellNode.getHeaderStyles() ^
        TableCellHeaderStates.COLUMN;
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

        tableCell.setHeaderStyles(
          newStyle,
          TableCellHeaderStates.COLUMN,
        );
      }
    });
  }, [editor, tableCellNode]);

  const toggleRowStriping = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => {
      if (tableCellNode.isAttached()) {
        const tableNode = $getTableNodeFromLexicalNodeOrThrow(
          tableCellNode,
        );
        if (tableNode) {
          tableNode.setRowStriping(!tableNode.getRowStriping());
        }
      }
    });
  }, [editor, tableCellNode]);

  const applyCellStyle = useCallback(
    (styles: Record<string, string>) => {
      editor.update(() => {
        const selection = $getSelection();
        if (
          $isRangeSelection(selection) || $isTableSelection(selection)
        ) {
          const [cell] = $getNodeTriplet(selection.anchor);
          if ($isTableCellNode(cell)) {
            $patchStyle(cell, styles);
          }

          if ($isTableSelection(selection)) {
            const nodes = selection.getNodes();
            const cells = nodes.filter($isTableCellNode);
            $patchStyle(cells, styles);
          }
        }
      });
    },
    [editor],
  );

  const updateCellColor = useCallback(
    (key: string, value: string) => {
      const styleKey = key === "text" ? "color" : "background-color";
      applyCellStyle({ [styleKey]: value });
    },
    [applyCellStyle],
  );

  const getCellWritingMode = useCallback(() => {
    return tableCellStyle?.["writing-mode"] ?? "";
  }, [tableCellStyle]);

  const toggleCellWritingMode = useCallback(
    () => {
      const value = getCellWritingMode() === "" ? "vertical-rl" : "";
      applyCellStyle({ "writing-mode": value });
    },
    [applyCellStyle, getCellWritingMode],
  );

  const getNodeFormatType = useCallback((): ElementFormatType => {
    return editor.getEditorState().read(() => {
      return node.getFormatType();
    });
  }, [editor, node]);

  const getNodeFloat = useCallback((): string => {
    return editor.getEditorState().read(() => {
      return $getNodeStyleValueForProperty(node, "float", "none");
    });
  }, [editor, node]);

  useEffect(() => {
    setFormatType(getNodeFormatType());
    setFloat(getNodeFloat());
  }, [node, getNodeFormatType, getNodeFloat]);

  useEffect(() => {
    if (tableCellNode === null) return;
    const cellStyle = getCellStyle();
    setTableCellStyle(cellStyle);
  }, [tableCellNode, getCellStyle]);

  function updateFloat(newFloat: "left" | "right" | "none") {
    setFloat(newFloat);
    editor.update(() => {
      node.setFormat("");
      $patchStyle(node, { float: newFloat });
    });
  }

  function updateFormat(newFormat: ElementFormatType) {
    setFormatType(newFormat);
    editor.update(() => {
      node.setFormat(newFormat);
      $patchStyle(node, { float: "none" });
    });
  }

  /**
   * What `handleClick` was: reading the cell under the caret at the moment the
   * menu opens, because everything in the menu acts on that cell. It moves onto
   * the open transition so it also runs when the menu is opened from the
   * keyboard, which the click handler never covered.
   */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      editor.getEditorState().read(() => {
        setTableCellNode($getSelectedTableCell(editor));
      });
    } else {
      restoreFocus();
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger aria-label="Table options" className={triggerClass}>
          <Table size={ICON_SIZE.inline} />
          <span className={menuCss.triggerLabel}>Table</span>
          <ChevronDown size={ICON_SIZE.inline} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          aria-label="Formatting options for table"
          side="bottom"
        >
          {/*
            The two icon rows are plain rows rather than menu items — a row of
            three buttons cannot also be one stop in Base UI's composite list.
            See `menuToggleRow` in `tools.css.ts`.
          */}
          <div
            aria-label="table alignment"
            className={css.menuToggleRow}
            role="group"
          >
            <button
              aria-label="Align left"
              aria-pressed={formatType === "left"}
              className={toggleClass}
              type="button"
              onClick={() => updateFormat("left")}
            >
              <AlignLeft size={ICON_SIZE.dense} />
            </button>
            <button
              aria-label="Align center"
              aria-pressed={formatType === "center"}
              className={toggleClass}
              type="button"
              onClick={() => updateFormat("center")}
            >
              <AlignCenter size={ICON_SIZE.dense} />
            </button>
            <button
              aria-label="Align right"
              aria-pressed={formatType === "right"}
              className={toggleClass}
              type="button"
              onClick={() => updateFormat("right")}
            >
              <AlignRight size={ICON_SIZE.dense} />
            </button>
          </div>
          <div
            aria-label="table position"
            className={css.menuToggleRow}
            role="group"
          >
            <button
              aria-label="Float left"
              aria-pressed={float === "left"}
              className={toggleClass}
              type="button"
              onClick={() => updateFloat("left")}
            >
              <FormatImageLeft />
            </button>
            <button
              aria-label="Justify"
              className={toggleClass}
              type="button"
              aria-pressed={formatType === "justify" ||
                (formatType === "" && float === "none")}
              onClick={() => updateFormat("justify")}
            >
              <AlignLeft size={ICON_SIZE.dense} />
            </button>
            <button
              aria-label="Float right"
              aria-pressed={float === "right"}
              className={toggleClass}
              type="button"
              onClick={() => updateFloat("right")}
            >
              <FormatImageRight />
            </button>
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canMergeCells && !canUnmergeCell}
            onClick={handleCellMerge}
          >
            <CellMerge />
            {canUnmergeCell ? "Unmerge cell" : "Merge cells"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleCellWritingMode}>
            {getCellWritingMode() === ""
              ? <TextRotationVertical />
              : <TextRotationNone />}
            Make {getCellWritingMode() === "" ? "Vertical" : "Horizontal"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleTableRowIsHeader()}>
            {(getTableRowHeaderState() & TableCellHeaderStates.ROW) ===
                TableCellHeaderStates.ROW
              ? <RemoveRowHeader />
              : <AddRowHeader />}
            {(getTableRowHeaderState() & TableCellHeaderStates.ROW) ===
                TableCellHeaderStates.ROW
              ? "Remove"
              : "Add"} row header
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toggleTableColumnIsHeader()}>
            {(getTableColumnHeaderState() & TableCellHeaderStates.COLUMN) ===
                TableCellHeaderStates.COLUMN
              ? <RemoveColumnHeader />
              : <AddColumnHeader />}
            {(getTableColumnHeaderState() & TableCellHeaderStates.COLUMN) ===
                TableCellHeaderStates.COLUMN
              ? "Remove"
              : "Add"} column header
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleRowStriping}>
            <Grid3x3
              size={ICON_SIZE.dense}
              style={{ transform: "rotate(45deg)" }}
            />
            {getTableRowStriping() ? "Remove" : "Add"} row striping
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => insertTableRowAtSelection(false)}>
            <AddRowAbove />
            Insert {selectionCounts.rows === 1
              ? "row"
              : `${selectionCounts.rows} rows`} above
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertTableRowAtSelection(true)}>
            <AddRowBelow />
            Insert {selectionCounts.rows === 1
              ? "row"
              : `${selectionCounts.rows} rows`} below
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertTableColumnAtSelection(false)}>
            <AddColumnLeft />
            Insert {selectionCounts.columns === 1
              ? "column"
              : `${selectionCounts.columns} columns`} left
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertTableColumnAtSelection(true)}>
            <AddColumnRight />
            Insert {selectionCounts.columns === 1
              ? "column"
              : `${selectionCounts.columns} columns`} right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteTableColumnAtSelection}>
            <RemoveColumn />
            Delete column
          </DropdownMenuItem>
          <DropdownMenuItem onClick={deleteTableRowAtSelection}>
            <RemoveRow />
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem onClick={deleteTableAtSelection}>
            <Trash2 size={ICON_SIZE.dense} />
            Delete Table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/*
        Out of the menu and into the toolbar row — a `Popover` opened from
        inside a `Menu.Popup` closes the menu under it. See the header of
        `ColorPicker.tsx`.
      */}
      <ColorPicker
        backgroundColor={backgroundColor}
        label="Cell"
        onClose={restoreFocus}
        onColorChange={updateCellColor}
        textColor={textColor}
      />
    </>
  );
}
