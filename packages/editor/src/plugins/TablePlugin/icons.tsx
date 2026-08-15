/**
 * The Material Symbols marks the table surfaces draw, as plain `<svg>`.
 *
 * These were inline in `ToolbarPlugin/Tools/TableTools.tsx` and moved here when
 * the hover handles became a second surface for the same operations: the point
 * of a shared icon vocabulary is that "insert row above" looks the same
 * wherever it is offered.
 *
 * Two things came from MUI's `SvgIcon` wrapper and are now attributes: the
 * glyph size (`fontSize="small"`) and, for four of them, a rotation that was an
 * `sx`. Everything else was already the raw path.
 *
 * The size passed here is only the intrinsic one — inside a menu row
 * `ui/menu.css`'s `applyItemSvgStyles` sizes the icon column, and that is
 * deliberate: the caller sizes a toolbar glyph, the menu sizes its own.
 */
import { ICON_SIZE } from "@/theme/icons";

export const Mark = (
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

export const CellMerge = () => (
  <Mark d="M120-120v-240h80v160h160v80H120Zm480 0v-80h160v-160h80v240H600ZM287-327l-57-56 57-57H80v-80h207l-57-57 57-56 153 153-153 153Zm386 0L520-480l153-153 57 56-57 57h207v80H673l57 57-57 56ZM120-600v-240h240v80H200v160h-80Zm640 0v-160H600v-80h240v240h-80Z" />
);

export const AddRowAbove = () => (
  <Mark d="M200-160h560v-240H200v240Zm640 80H120v-720h160v80h-80v240h560v-240h-80v-80h160v720ZM480-480Zm0 80v-80 80Zm0 0Zm-40-240v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

export const AddRowBelow = () => (
  <Mark d="M200-560h560v-240H200v240Zm-80 400v-720h720v720H680v-80h80v-240H200v240h80v80H120Zm360-320Zm0-80v80-80Zm0 0ZM440-80v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

export const AddColumnLeft = () => (
  <Mark d="M800-200v-560H560v560h240Zm-640 80v-160h80v80h240v-560H240v80h-80v-160h720v720H160Zm320-360Zm80 0h-80 80Zm0 0ZM160-360v-80H80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

export const AddColumnRight = () => (
  <Mark d="M160-760v560h240v-560H160ZM80-120v-720h720v160h-80v-80H480v560h240v-80h80v160H80Zm400-360Zm-80 0h80-80Zm0 0Zm320 120v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
);

export const RemoveRow = () => (
  <Mark d="M560-280H120v-400h720v120h-80v-40H200v240h360v80Zm-360-80v-240 240Zm440 104 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83-56-56Z" />
);

export const RemoveColumn = () => (
  <Mark
    d="M560-280H120v-400h720v120h-80v-40H200v240h360v80Zm-360-80v-240 240Zm440 104 84-84-84-84 56-56 84 84 84-84 56 56-83 84 83 84-56 56-84-83-84 83-56-56Z"
    rotate={90}
  />
);

export const RemoveRowHeader = () => (
  <Mark d="M120-280v-400h720v400H120Zm80-80h560v-240H200v240Zm0 0v-240 240Z" />
);

export const RemoveColumnHeader = () => (
  <Mark
    d="M120-280v-400h720v400H120Zm80-80h560v-240H200v240Zm0 0v-240 240Z"
    rotate={90}
  />
);

export const AddRowHeader = () => (
  <Mark
    d="m272-104-38-38-42 42q-19 19-46.5 19.5T100-100q-19-19-19-46t19-46l42-42-38-40 554-554q12-12 29-12t29 12l112 112q12 12 12 29t-12 29L272-104Zm172-396L216-274l58 58 226-228-56-56Z"
    rotate={45}
  />
);

export const AddColumnHeader = () => (
  <Mark
    d="m272-104-38-38-42 42q-19 19-46.5 19.5T100-100q-19-19-19-46t19-46l42-42-38-40 554-554q12-12 29-12t29 12l112 112q12 12 12 29t-12 29L272-104Zm172-396L216-274l58 58 226-228-56-56Z"
    rotate={-45}
  />
);
