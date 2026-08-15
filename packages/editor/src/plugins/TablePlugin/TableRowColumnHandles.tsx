"use client";
/**
 * Row and column handles that follow the pointer around a table.
 *
 * Ported from haklex `rich-plugin-table/src/TableRowColumnHandlesPlugin.tsx`
 * (MIT, github.com/Innei/haklex). The affordance is the whole reason for the
 * port: until now every table operation in this editor lived behind the
 * toolbar's `Table` menu, which is only reachable with the caret already inside
 * a cell — so the operations existed and nothing announced them. A handle in
 * the gutter beside the row the pointer is on announces them where the pointer
 * already is.
 *
 * Four differences from theirs, each a defect there rather than a preference:
 *
 *  1. **The column controls insert columns.** All three of haklex's — insert
 *     left, insert right, and the quick-add — call `$insertTableRowAtSelection`
 *     and insert a *row*. Only their delete uses the column API.
 *  2. **`position: fixed`, viewport coordinates.** Theirs positions absolutely
 *     from `window.scrollY`, which is only right when the window is the
 *     scroller; here a document scrolls inside its pane. See `handles.css.ts`.
 *  3. **Gated on `useLexicalEditable`.** Theirs mounts the handles in read-only
 *     editors too, offering edits that cannot happen.
 *  4. **The handle survives its own menu.** Theirs hides the handle 300ms after
 *     the pointer leaves it, including when the pointer left *into the menu the
 *     handle just opened* — so the grip vanishes from under an open menu.
 *
 * What it gains from being ours: the operations come from `tableCommands.ts`,
 * shared with the toolbar menu, so the handles also carry header toggles, row
 * striping and merge/unmerge rather than the four items haklex offers.
 *
 * The subject of every action is the cell the pointer is over, which is
 * generally *not* the cell the caret is in. `runOnAnchorCell` is what bridges
 * that: it re-resolves the anchor cell from its DOM node and places a collapsed
 * selection in it before running an upstream helper, all in one `editor.update`
 * so the helper sees the pending selection. Merge and unmerge are the
 * exceptions — they are about the user's existing multi-cell selection, so they
 * must not disturb it, and they run through `runOnSelection` instead.
 */
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getNearestNodeFromDOMNode, type LexicalEditor } from "lexical";
import { Grid3x3, GripHorizontal, GripVertical, Plus } from "lucide-react";
import type { JSX, ReactPortal } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  $deleteTableColumn__EXPERIMENTAL,
  $deleteTableRow__EXPERIMENTAL,
  $getTableCellNodeFromLexicalNode,
  $insertTableColumn__EXPERIMENTAL,
  $insertTableRow__EXPERIMENTAL,
  $isTableCellNode,
  TableCellNode,
} from "@/editor/nodes/TableNode";
import {
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/editor/ui";
import { ICON_SIZE } from "@/theme/icons";
import * as css from "./handles.css";
import {
  AddColumnHeader,
  AddColumnLeft,
  AddColumnRight,
  AddRowAbove,
  AddRowBelow,
  AddRowHeader,
  CellMerge,
  RemoveColumn,
  RemoveColumnHeader,
  RemoveRow,
  RemoveRowHeader,
} from "./icons";
import {
  $canMerge,
  $canUnmerge,
  $getTableFromCell,
  $isColumnHeader,
  $isRowHeader,
  $mergeCellsAtSelection,
  $selectCell,
  $toggleColumnHeader,
  $toggleRowHeader,
  $toggleRowStriping,
  $unmergeCellAtSelection,
} from "./tableCommands";

/** How long the handles linger once the pointer is off both table and handle. */
const HIDE_DELAY = 300;
/** A handle is two 16px controls plus its gap, padding and border. */
const HANDLE_WIDTH = 38;
const HANDLE_HEIGHT = 20;
/** Clearance between a handle and the table edge it labels. */
const GAP = 6;
/** How close to the viewport edge a handle may be pushed before it stops. */
const EDGE = 4;

/**
 * The resizer's overlay bars are portaled to `document.body`, so the pointer
 * crossing one leaves the editor root entirely and would otherwise read as
 * "left the table". They are chrome, not an exit.
 */
const RESIZER_CLASS = "TableCellResizer__resizer";

type Point = { left: number; top: number };
type Positions = { column: Point; row: Point };

type CellFlags = {
  canMerge: boolean;
  canUnmerge: boolean;
  columnHeader: boolean;
  rowHeader: boolean;
  striping: boolean;
};

const ORIGIN: Positions = {
  column: { left: 0, top: 0 },
  row: { left: 0, top: 0 },
};

function samePositions(a: Positions, b: Positions): boolean {
  return a.row.top === b.row.top && a.row.left === b.row.left &&
    a.column.top === b.column.top && a.column.left === b.column.left;
}

const NO_FLAGS: CellFlags = {
  canMerge: false,
  canUnmerge: false,
  columnHeader: false,
  rowHeader: false,
  striping: false,
};

function TableRowColumnHandles({ editor }: { editor: LexicalEditor }) {
  const [positions, setPositions] = useState<Positions>(ORIGIN);
  const [visible, setVisible] = useState(false);
  const [flags, setFlags] = useState<CellFlags>(NO_FLAGS);

  const anchorRef = useRef<HTMLTableCellElement | null>(null);
  const lastTargetRef = useRef<EventTarget | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringHandleRef = useRef(false);
  const menuOpenRef = useRef(false);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /**
   * Re-read the anchor cell's geometry.
   *
   * Also the liveness check: an anchor whose cell has been detached — deleted
   * by the very menu item that was just clicked, or by a collaborator's edit —
   * is dropped rather than left pointing at a stale rectangle.
   */
  const measure = useCallback(() => {
    const cell = anchorRef.current;
    if (!cell || !cell.isConnected) {
      setVisible(false);
      return;
    }
    const table = cell.closest("table");
    if (!table) {
      setVisible(false);
      return;
    }

    const cellRect = cell.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    if (cellRect.width === 0 && cellRect.height === 0) {
      setVisible(false);
      return;
    }

    const next: Positions = {
      row: {
        top: cellRect.top + cellRect.height / 2 - HANDLE_HEIGHT / 2,
        left: Math.max(EDGE, tableRect.left - HANDLE_WIDTH - GAP),
      },
      column: {
        top: Math.max(EDGE, tableRect.top - HANDLE_HEIGHT - GAP),
        left: cellRect.left + cellRect.width / 2 - HANDLE_WIDTH / 2,
      },
    };
    // `measure` runs on every editor update — which is every keystroke — so it
    // returns the previous object when nothing moved rather than a fresh one
    // that says the same thing. React bails out on an identical reference; a
    // new one would re-render both handles and their menus per character.
    setPositions((prev) => (samePositions(prev, next) ? prev : next));
    setVisible(true);
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (hoveringHandleRef.current || menuOpenRef.current) return;
      anchorRef.current = null;
      setVisible(false);
    }, HIDE_DELAY);
  }, [clearHideTimer]);

  useEffect(() => {
    // Through `registerRootListener` rather than one `getRootElement()` read:
    // the root is swapped, not mutated, when the editor is remounted or its
    // editability changes, and a listener bound to the old element is a plugin
    // that silently stops working.
    let attached: HTMLElement | null = null;

    const onMouseMove = (event: MouseEvent) => {
      // The same cheap guard the resizer uses: a mousemove fires per pixel, and
      // the answer only changes when the element under the pointer does.
      if (event.target === lastTargetRef.current) return;
      lastTargetRef.current = event.target;

      const target = event.target as HTMLElement | null;
      const cell = target?.closest?.("td, th") as
        | HTMLTableCellElement
        | null
        | undefined;

      if (!cell || !attached?.contains(cell)) {
        if (!hoveringHandleRef.current && !menuOpenRef.current) scheduleHide();
        return;
      }

      clearHideTimer();
      anchorRef.current = cell;
      measure();
    };

    const onMouseLeave = (event: MouseEvent) => {
      const related = event.relatedTarget;
      if (
        related instanceof Element &&
        related.closest(`.${css.handle}, .${RESIZER_CLASS}`)
      ) {
        return;
      }
      if (!hoveringHandleRef.current && !menuOpenRef.current) scheduleHide();
    };

    const removeRootListener = editor.registerRootListener(
      (rootElement, prevRootElement) => {
        prevRootElement?.removeEventListener("mousemove", onMouseMove);
        prevRootElement?.removeEventListener("mouseleave", onMouseLeave);
        rootElement?.addEventListener("mousemove", onMouseMove);
        rootElement?.addEventListener("mouseleave", onMouseLeave);
        attached = rootElement;
      },
    );

    return () => {
      removeRootListener();
      // Unregistering does not replay the listener with `null`, so the last
      // root it handed us is still ours to detach.
      attached?.removeEventListener("mousemove", onMouseMove);
      attached?.removeEventListener("mouseleave", onMouseLeave);
      clearHideTimer();
    };
  }, [editor, measure, scheduleHide, clearHideTimer]);

  // Captured, so a document scrolling inside its pane is caught as well as the
  // window — see the note on `position: fixed` in `handles.css.ts`.
  useEffect(() => {
    const onViewportChange = () => measure();
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [measure]);

  useEffect(() => editor.registerUpdateListener(() => measure()), [
    editor,
    measure,
  ]);

  /**
   * Run `fn` against the cell under the pointer.
   *
   * The selection move is the point: every upstream insert/delete helper takes
   * its subject from the selection, and the caret is wherever the author left
   * it. Both happen in one update so the helper reads the pending selection.
   */
  const runOnAnchorCell = useCallback(
    (fn: (cell: TableCellNode) => void) => {
      const cellDom = anchorRef.current;
      if (!cellDom || !cellDom.isConnected) return;
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(cellDom);
        if (!node) return;
        const cell = $getTableCellNodeFromLexicalNode(node);
        if (!$isTableCellNode(cell)) return;
        $selectCell(cell);
        fn(cell);
      });
    },
    [editor],
  );

  /** For the two operations whose subject *is* the existing selection. */
  const runOnSelection = useCallback(
    (fn: () => void) => editor.update(fn),
    [editor],
  );

  const readFlags = useCallback(() => {
    const cellDom = anchorRef.current;
    if (!cellDom || !cellDom.isConnected) return;
    const next = editor.getEditorState().read(() => {
      const node = $getNearestNodeFromDOMNode(cellDom);
      const cell = node ? $getTableCellNodeFromLexicalNode(node) : null;
      if (!$isTableCellNode(cell)) return null;
      return {
        rowHeader: $isRowHeader(cell),
        columnHeader: $isColumnHeader(cell),
        striping: $getTableFromCell(cell).getRowStriping(),
        canMerge: $canMerge(),
        canUnmerge: $canUnmerge(),
      };
    }, { editor });
    if (next) setFlags(next);
  }, [editor]);

  const onMenuOpenChange = useCallback(
    (open: boolean) => {
      menuOpenRef.current = open;
      if (open) {
        clearHideTimer();
        readFlags();
      } else {
        scheduleHide();
      }
    },
    [clearHideTimer, readFlags, scheduleHide],
  );

  const onHandleEnter = useCallback(() => {
    hoveringHandleRef.current = true;
    clearHideTimer();
  }, [clearHideTimer]);

  const onHandleLeave = useCallback(() => {
    hoveringHandleRef.current = false;
    scheduleHide();
  }, [scheduleHide]);

  const mergeItem = (
    <DropdownMenuItem
      disabled={!flags.canMerge && !flags.canUnmerge}
      onClick={() =>
        runOnSelection(
          flags.canMerge ? $mergeCellsAtSelection : $unmergeCellAtSelection,
        )}
    >
      <CellMerge />
      {flags.canUnmerge && !flags.canMerge ? "Unmerge cell" : "Merge cells"}
    </DropdownMenuItem>
  );

  const handleStyle = (point: Point) => ({
    transform: `translate(${point.left}px, ${point.top}px)`,
  });

  return (
    <>
      <div
        className={cx(css.handle, visible && css.handleVisible)}
        data-table-handle="row"
        onMouseEnter={onHandleEnter}
        onMouseLeave={onHandleLeave}
        style={handleStyle(positions.row)}
      >
        <button
          aria-label="Insert row below"
          className={css.button}
          onClick={() => runOnAnchorCell(() => $insertTableRow__EXPERIMENTAL(true))}
          type="button"
        >
          <Plus size={ICON_SIZE.dense} />
        </button>
        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger aria-label="Row options" className={css.button}>
            <GripVertical size={ICON_SIZE.dense} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label="Row options"
            className={css.menu}
            side="right"
            sideOffset={GAP}
          >
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell(() => $insertTableRow__EXPERIMENTAL(false))}
            >
              <AddRowAbove />
              Insert row above
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell(() => $insertTableRow__EXPERIMENTAL(true))}
            >
              <AddRowBelow />
              Insert row below
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => runOnAnchorCell((cell) => $toggleRowHeader(cell))}
            >
              {flags.rowHeader ? <RemoveRowHeader /> : <AddRowHeader />}
              {flags.rowHeader ? "Remove" : "Add"} row header
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell((cell) =>
                  $toggleRowStriping($getTableFromCell(cell))
                )}
            >
              <Grid3x3
                size={ICON_SIZE.dense}
                style={{ transform: "rotate(45deg)" }}
              />
              {flags.striping ? "Remove" : "Add"} row striping
            </DropdownMenuItem>
            {mergeItem}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={css.destructiveItem}
              onClick={() =>
                runOnAnchorCell(() => $deleteTableRow__EXPERIMENTAL())}
            >
              <RemoveRow />
              Delete row
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={cx(css.handle, visible && css.handleVisible)}
        data-table-handle="column"
        onMouseEnter={onHandleEnter}
        onMouseLeave={onHandleLeave}
        style={handleStyle(positions.column)}
      >
        <button
          aria-label="Insert column right"
          className={css.button}
          onClick={() =>
            runOnAnchorCell(() => $insertTableColumn__EXPERIMENTAL(true))}
          type="button"
        >
          <Plus size={ICON_SIZE.dense} />
        </button>
        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger
            aria-label="Column options"
            className={css.button}
          >
            <GripHorizontal size={ICON_SIZE.dense} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            aria-label="Column options"
            className={css.menu}
            side="bottom"
            sideOffset={GAP}
          >
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell(() => $insertTableColumn__EXPERIMENTAL(false))}
            >
              <AddColumnLeft />
              Insert column left
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell(() => $insertTableColumn__EXPERIMENTAL(true))}
            >
              <AddColumnRight />
              Insert column right
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                runOnAnchorCell((cell) => $toggleColumnHeader(cell))}
            >
              {flags.columnHeader ? <RemoveColumnHeader /> : <AddColumnHeader />}
              {flags.columnHeader ? "Remove" : "Add"} column header
            </DropdownMenuItem>
            {mergeItem}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={css.destructiveItem}
              onClick={() =>
                runOnAnchorCell(() => $deleteTableColumn__EXPERIMENTAL())}
            >
              <RemoveColumn />
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export default function TableRowColumnHandlesPlugin(): JSX.Element | ReactPortal | null {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();

  if (!isEditable) return null;
  return createPortal(<TableRowColumnHandles editor={editor} />, document.body);
}
