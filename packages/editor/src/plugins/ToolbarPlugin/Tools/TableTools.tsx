"use client";
import {
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  ElementFormatType,
  LexicalEditor,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getNodeTriplet,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableCellNode,
  $isTableSelection,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
} from "@/editor/nodes/TableNode";
/*
 * The operations themselves, and the glyphs that name them, are shared with the
 * hover handles (`TablePlugin/TableRowColumnHandles.tsx`) — two surfaces onto
 * the same commands rather than two implementations of them.
 */
import {
  $canUnmerge,
  $getSelectedTableCell,
  $getTableFromCell,
  $mergeCellsAtSelection,
  $toggleColumnHeader,
  $toggleRowHeader,
  $toggleRowStriping,
  $unmergeCellAtSelection,
  computeSelectionCount,
} from "../../TablePlugin/tableCommands";
import {
  AddColumnHeader,
  AddColumnLeft,
  AddColumnRight,
  AddRowAbove,
  AddRowBelow,
  AddRowHeader,
  CellMerge,
  Mark,
  RemoveColumn,
  RemoveColumnHeader,
  RemoveRow,
  RemoveRowHeader,
} from "../../TablePlugin/icons";
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

/**
 * The two marks that are this menu's alone: a figure's float, which no hover
 * handle offers, and the cell writing-mode toggle. The rest of the table
 * vocabulary — and the `Mark` wrapper itself — is shared with the hover handles
 * and lives in `TablePlugin/icons.tsx`.
 */
const FormatImageRight = () => (
  <Mark d="M450-285v-390h390v390H450Zm60-60h270v-270H510v270ZM120-120v-60h720v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h270v60H120Zm0-165v-60h720v60H120Z" />
);

const FormatImageLeft = () => (
  <Mark d="M120-285v-390h390v390H120Zm60-60h270v-270H180v270Zm-60-435v-60h720v60H120Zm450 165v-60h270v60H570Zm0 165v-60h270v60H570Zm0 165v-60h270v60H570ZM120-120v-60h720v60H120Z" />
);

const TextRotationNone = () => (
  <Mark d="M160-200v-80h528l-42-42 56-56 138 138-138 138-56-56 42-42H160Zm116-200 164-440h80l164 440h-76l-38-112H392l-40 112h-76Zm138-176h132l-64-182h-4l-64 182Z" />
);

const TextRotationVertical = () => (
  <Mark d="m436-320 164-440h80l164 440h-76l-40-112H552l-40 112h-76Zm138-176h132l-64-182h-4l-64 182ZM240-160 100-300l56-56 44 42v-526h80v526l44-42 56 56-140 140Z" />
);

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

  const handleCellMerge = () => {
    if (canMergeCells) {
      editor.update($mergeCellsAtSelection);
    } else if (canUnmergeCell) {
      editor.update($unmergeCellAtSelection);
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
    editor.update(() => $toggleRowHeader(tableCellNode));
  }, [editor, tableCellNode]);

  const toggleTableColumnIsHeader = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => $toggleColumnHeader(tableCellNode));
  }, [editor, tableCellNode]);

  const toggleRowStriping = useCallback(() => {
    if (tableCellNode === null) return;
    editor.update(() => {
      if (!tableCellNode.isAttached()) return;
      $toggleRowStriping($getTableFromCell(tableCellNode));
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
