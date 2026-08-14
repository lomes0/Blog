"use client";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { $createCodeNode } from "@lexical/code";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@/editor/nodes/HorizontalRuleNode";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND, TableNode } from "@/editor/nodes/TableNode";
import {
  $getSelection,
  $isRangeSelection,
  ElementFormatType,
  FORMAT_ELEMENT_COMMAND,
  TextNode,
} from "lexical";
import { JSX, useCallback, useMemo, useState } from "react";
import * as ReactDOM from "react-dom";

import { INSERT_MATH_COMMAND } from "../MathPlugin";
import { INSERT_STICKY_COMMAND } from "../StickyPlugin";
import { INSERT_KANBAN_COMMAND } from "../KanbanPlugin";

import { SET_DIALOGS_COMMAND } from "../ToolbarPlugin/Dialogs/commands";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { GraphNode } from "@/editor/nodes/GraphNode";
import { SketchNode } from "@/editor/nodes/SketchNode";
import { StickyNode } from "@/editor/nodes/StickyNode";
import { KanbanNode } from "@/editor/nodes/KanbanNode";
import { CanvasNode } from "@/editor/nodes/CanvasNode";
import { INSERT_CANVAS_COMMAND } from "@/editor/plugins/CanvasPlugin";
import { NestedDocNode } from "@/editor/nodes/NestedDocNode";
import { INSERT_NESTED_DOC_COMMAND } from "@/editor/plugins/NestedDocPlugin";
import { PageBreakNode } from "@/editor/nodes/PageBreakNode";
import { INSERT_PAGE_BREAK } from "../PageBreakPlugin";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Brush,
  ChevronDown,
  Code,
  Columns2,
  Globe,
  Image,
  Kanban,
  LayoutDashboard,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  NotebookText,
  Paperclip,
  Quote,
  ScanSearch,
  Scissors,
  Sigma,
  StickyNote,
  Table,
} from "lucide-react";
import { IFrameNode } from "@/editor/nodes/IFrameNode";
import { LayoutContainerNode } from "@/editor/nodes/LayoutNode";
import { DetailsContainerNode } from "@/editor/nodes/DetailsNode";
import { AttachmentNode } from "@/editor/nodes/AttachmentNode";
import { INSERT_DETAILS_COMMAND } from "../DetailsPlugin";
import { ICON_SIZE } from "@/theme/icons";
import * as css from "./picker.css";

/**
 * The six hand-drawn glyphs, off `SvgIcon`. Size is left to the stylesheet:
 * `picker.css.ts` sizes every icon in a row alike, which is the job
 * `ListItemIcon` used to do and the reason the old `fontSize="small"` (20px)
 * disagreed with the lucide icons beside it (24px).
 */
const Glyph = ({ path, viewBox }: { path: string; viewBox: string }) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    viewBox={viewBox}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d={path} />
  </svg>
);

const H1 = () => (
  <Glyph
    viewBox="0 96 960 960"
    path="M200 776V376h60v170h180V376h60v400h-60V606H260v170h-60Zm500 0V436h-80v-60h140v400h-60Z"
  />
);
const H2 = () => (
  <Glyph
    viewBox="96 96 960 960"
    path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm420 0V606q0-24.75 17.625-42.375T600 546h180V436H540v-60h240q25 0 42.5 17.625T840 436v110q0 24.75-17.625 42.375T780 606H600v110h240v60H540Z"
  />
);
const H3 = () => (
  <Glyph
    viewBox="96 96 960 960"
    path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm420 0v-60h240V606H620v-60h160V436H540v-60h240q25 0 42.5 17.625T840 436v280q0 24.75-17.625 42.375T780 776H540Z"
  />
);
const H4 = () => (
  <Glyph
    viewBox="96 96 960 960"
    path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm620 0V646H540V376h60v210h140V376h60v210h80v60h-80v130h-60Z"
  />
);

const Heading = (level: number) =>
  level === 1 ? <H1 /> : level === 2 ? <H2 /> : level === 3 ? <H3 /> : <H4 />;

const GraphIcon = (
  <Glyph
    viewBox="0 0 512 512"
    path="M500.364,244.365h-37.248c12.695-18.223,27.124-31.674,42.415-39.273c5.76-2.851,8.099-9.844,5.248-15.593    c-2.851-5.76-9.821-8.122-15.593-5.248c-24.041,11.927-45.894,34.804-63.185,66.129c-22.726,41.146-52.166,63.802-82.909,63.802    c-26.077,0-51.188-16.465-72.087-46.545H384c6.423,0,11.636-5.201,11.636-11.636c0-6.435-5.213-11.636-11.636-11.636H267.636v-128    h11.636c4.701,0,8.948-2.828,10.752-7.18s0.803-9.356-2.525-12.684l-23.273-23.273c-4.55-4.55-11.904-4.55-16.454,0L224.5,96.502    c-3.328,3.328-4.329,8.332-2.525,12.684s6.051,7.18,10.752,7.18h11.636V218.09c-23.599-28.323-51.7-43.543-81.455-43.543    c-37.876,0-72.972,24.879-99.607,69.818H11.636C5.213,244.365,0,249.567,0,256.001c0,6.435,5.213,11.636,11.636,11.636h37.248    C36.189,285.86,21.76,299.312,6.47,306.911c-5.76,2.851-8.099,9.844-5.248,15.593c2.025,4.108,6.144,6.47,10.426,6.47    c1.734,0,3.503-0.384,5.167-1.21C40.855,315.836,62.708,292.959,80,261.633c22.726-41.158,52.166-63.814,82.909-63.814    c26.077,0,51.188,16.465,72.087,46.545H128c-6.423,0-11.636,5.201-11.636,11.636c0,6.435,5.213,11.636,11.636,11.636h116.364    v162.909c0,6.435,5.213,11.636,11.636,11.636s11.636-5.201,11.636-11.636V293.913c23.599,28.323,51.7,43.543,81.455,43.543    c37.876,0,72.972-24.879,99.607-69.818h51.665c6.423,0,11.636-5.201,11.636-11.636C512,249.567,506.787,244.365,500.364,244.365z"
  />
);

const FormatAlignIcon = (alignment: string) =>
  alignment === "left"
    ? <AlignLeft />
    : alignment === "center"
    ? <AlignCenter />
    : alignment === "right"
    ? <AlignRight />
    : <AlignJustify />;

function IconMenu(
  { options, selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }: {
    options: ComponentPickerOption[];
    selectedIndex: number | null;
    selectOptionAndCleanUp: (option: ComponentPickerOption) => void;
    setHighlightedIndex: (index: number) => void;
  },
) {
  /*
   * `selectedIndex`, the ref that scrolls the current row into view, the click
   * and the hover are all carried over verbatim: they are the contract with
   * `LexicalTypeaheadMenuPlugin`, which owns the keyboard entirely. Only the
   * elements changed — `Paper`/`MenuList`/`MenuItem` for the shared popup
   * rules, and `data-highlighted` for `selected`, because that is the
   * attribute the kit's item styles already answer to.
   */
  return (
    <div className={css.popup} role="menu">
      {options.map((option, i: number) => (
        <div
          key={option.key}
          className={css.item}
          data-highlighted={selectedIndex === i ? "" : undefined}
          onClick={() => {
            setHighlightedIndex(i);
            selectOptionAndCleanUp(option);
          }}
          onMouseEnter={() => {
            setHighlightedIndex(i);
          }}
          ref={(el) => {
            if (selectedIndex === i) {
              el?.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }
          }}
          role="menuitem"
          tabIndex={-1}
        >
          {option.icon}
          <span className={css.label}>{option.title}</span>
          <span className={css.shortcut}>{option.keyboardShortcut}</span>
        </div>
      ))}
    </div>
  );
}

class ComponentPickerOption extends MenuOption {
  // What shows up in the editor
  title: string;
  // Icon for display
  icon?: JSX.Element;
  // For extra searching.
  keywords: Array<string>;
  // TBD
  keyboardShortcut?: string;
  // What happens when you select this option?
  onSelect: (queryString: string) => void;

  constructor(
    title: string,
    options: {
      icon?: JSX.Element;
      keywords?: Array<string>;
      keyboardShortcut?: string;
      onSelect: (queryString: string) => void;
    },
  ) {
    super(title);
    this.title = title;
    this.keywords = options.keywords || [];
    this.icon = options.icon;
    this.keyboardShortcut = options.keyboardShortcut;
    this.onSelect = options.onSelect.bind(this);
  }
}

export default function ComponentPickerMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const openImageDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { image: { open: true } }),
    [editor],
  );
  const openTableDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { table: { open: true } }),
    [editor],
  );
  const openGraphDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { graph: { open: true } }),
    [editor],
  );
  const openSketchDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { sketch: { open: true } }),
    [editor],
  );
  const openIFrameDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { iframe: { open: true } }),
    [editor],
  );
  const openLayoutDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, { layout: { open: true } }),
    [editor],
  );
  const openAttachmentDialog = useCallback(
    () =>
      editor.dispatchCommand(SET_DIALOGS_COMMAND, {
        attachment: { open: true },
      }),
    [editor],
  );
  const openOCRDialog = useCallback(
    () => editor.dispatchCommand(SET_DIALOGS_COMMAND, { ocr: { open: true } }),
    [editor],
  );

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  });

  const getDynamicOptions = useCallback(() => {
    const options: Array<ComponentPickerOption> = [];
    if (!editor.hasNode(TableNode)) return options;
    if (queryString == null) {
      return options;
    }

    const fullTableRegex = new RegExp(/^([1-9]|10)x([1-9]|10)$/);
    const partialTableRegex = new RegExp(/^([1-9]|10)x?$/);

    const fullTableMatch = fullTableRegex.exec(queryString);
    const partialTableMatch = partialTableRegex.exec(queryString);

    if (fullTableMatch) {
      const [rows, columns] = fullTableMatch[0]
        .split("x")
        .map((n: string) => parseInt(n, 10));

      options.push(
        new ComponentPickerOption(`${rows}x${columns} Table`, {
          icon: <Table />,
          keywords: ["table"],
          keyboardShortcut: `${rows}x${columns}`,
          onSelect: () =>
            editor.dispatchCommand(INSERT_TABLE_COMMAND, {
              columns: columns.toString(),
              rows: rows.toString(),
            }),
        }),
      );
    } else if (partialTableMatch) {
      const rows = parseInt(partialTableMatch[0], 10);

      options.push(
        ...Array.from({ length: 5 }, (_, i) => i + 1).map(
          (columns) =>
            new ComponentPickerOption(`${rows}x${columns} Table`, {
              icon: <Table />,
              keywords: ["table"],
              keyboardShortcut: `${rows}x${columns}`,
              onSelect: () =>
                editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                  columns: columns.toString(),
                  rows: rows.toString(),
                }),
            }),
        ),
      );
    }

    return options;
  }, [editor, queryString]);

  const options = useMemo(() => {
    const baseOptions = [
      ...Array.from({ length: 4 }, (_, i) => i + 1).map(
        (n) =>
          new ComponentPickerOption(`Heading ${n}`, {
            icon: Heading(n),
            keywords: ["heading", "header", `h${n}`],
            keyboardShortcut: "#".repeat(n),
            onSelect: () =>
              editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                  $setBlocksType(selection, () =>
                    // @ts-expect-error Correct types, but since they're dynamic TS doesn't like it.
                    $createHeadingNode(`h${n}`));
                }
              }),
          }),
      ),
      new ComponentPickerOption("Numbered List", {
        icon: <ListOrdered />,
        keywords: ["numbered list", "ordered list", "ol"],
        keyboardShortcut: "1.",
        onSelect: () =>
          editor.dispatchCommand(
            INSERT_ORDERED_LIST_COMMAND,
            undefined,
          ),
      }),
      new ComponentPickerOption("Bulleted List", {
        icon: <List />,
        keywords: ["bulleted list", "unordered list", "ul"],
        keyboardShortcut: "*",
        onSelect: () =>
          editor.dispatchCommand(
            INSERT_UNORDERED_LIST_COMMAND,
            undefined,
          ),
      }),
      new ComponentPickerOption("Check List", {
        icon: <ListChecks />,
        keywords: ["check list", "todo list"],
        keyboardShortcut: "[x]",
        onSelect: () =>
          editor.dispatchCommand(
            INSERT_CHECK_LIST_COMMAND,
            undefined,
          ),
      }),
      new ComponentPickerOption("Quote", {
        icon: <Quote />,
        keywords: ["block quote"],
        keyboardShortcut: ">",
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createQuoteNode());
            }
          }),
      }),
      new ComponentPickerOption("Code", {
        icon: <Code />,
        keywords: ["javascript", "python", "js", "codeblock"],
        keyboardShortcut: "```",
        onSelect: () =>
          editor.update(() => {
            const selection = $getSelection();

            if ($isRangeSelection(selection)) {
              if (selection.isCollapsed()) {
                $setBlocksType(
                  selection,
                  () => $createCodeNode(),
                );
              } else {
                const textContent = selection.getTextContent();
                const codeNode = $createCodeNode();
                selection.insertNodes([codeNode]);
                selection.insertRawText(textContent);
              }
            }
          }),
      }),
      new ComponentPickerOption("Divider", {
        icon: <Minus />,
        keywords: ["horizontal rule", "divider", "hr"],
        keyboardShortcut: "---",
        onSelect: () =>
          editor.dispatchCommand(
            INSERT_HORIZONTAL_RULE_COMMAND,
            undefined,
          ),
      }),
      new ComponentPickerOption("Math", {
        icon: <Sigma />,
        keywords: ["equation", "latex", "math"],
        keyboardShortcut: "$$",
        onSelect: () =>
          editor.dispatchCommand(INSERT_MATH_COMMAND, { value: "" }),
      }),
      new ComponentPickerOption("OCR", {
        icon: <ScanSearch />,
        keywords: ["ocr", "image", "text"],
        keyboardShortcut: "/ocr",
        onSelect: openOCRDialog,
      }),
      // new ComponentPickerOption('Graph', {
      //   icon: GraphIcon,
      //   keywords: ['geogebra', 'graph', 'plot', '2d', '3d'],
      //   keyboardShortcut: '/plot',
      //   onSelect: openGraphDialog,
      // }),
      // new ComponentPickerOption('Sketch', {
      //   icon: <Brush />,
      //   keywords: ['excalidraw', 'sketch', 'drawing', 'diagram'],
      //   keyboardShortcut: '/sketch',
      //   onSelect: openSketchDialog,
      // }),
      // new ComponentPickerOption('Image', {
      //   icon: <Image />,
      //   keywords: ['image', 'photo', 'picture', 'img'],
      //   keyboardShortcut: '/img',
      //   onSelect: openImageDialog
      // }),
      // new ComponentPickerOption('Table', {
      //   icon: <TableChart />,
      //   keywords: ['table', 'grid', 'spreadsheet', 'rows', 'columns'],
      //   keyboardShortcut: '/3x3',
      //   onSelect: openTableDialog,
      // }),
      // new ComponentPickerOption('Note', {
      //   icon: <StickyNote2 />,
      //   keywords: ['sticky', 'note', 'sticky note'],
      //   keyboardShortcut: '/note',
      //   onSelect: () =>
      //     editor.dispatchCommand(INSERT_STICKY_COMMAND, undefined),
      // }),
      ...["left", "center", "right", "justify"].map(
        (alignment) =>
          new ComponentPickerOption(`Align ${alignment}`, {
            icon: FormatAlignIcon(alignment),
            keywords: ["align", alignment],
            keyboardShortcut: `/${alignment}`,
            onSelect: () =>
              editor.dispatchCommand(
                FORMAT_ELEMENT_COMMAND,
                alignment as ElementFormatType,
              ),
          }),
      ),
    ];

    if (editor.hasNode(ImageNode)) {
      baseOptions.push(
        new ComponentPickerOption("Image", {
          icon: <Image />,
          keywords: ["image", "photo", "picture", "img"],
          keyboardShortcut: "/img",
          onSelect: openImageDialog,
        }),
      );
    }

    if (editor.hasNode(GraphNode)) {
      baseOptions.push(
        new ComponentPickerOption("Graph", {
          icon: GraphIcon,
          keywords: ["geogebra", "graph", "plot", "2d", "3d"],
          keyboardShortcut: "/plot",
          onSelect: openGraphDialog,
        }),
      );
    }

    if (editor.hasNode(SketchNode)) {
      baseOptions.push(
        new ComponentPickerOption("Sketch", {
          icon: <Brush size={ICON_SIZE.dense} />,
          keywords: ["excalidraw", "sketch", "drawing", "diagram"],
          keyboardShortcut: "/sketch",
          onSelect: openSketchDialog,
        }),
      );
    }

    if (editor.hasNode(StickyNode)) {
      baseOptions.push(
        new ComponentPickerOption("Note", {
          icon: <StickyNote />,
          keywords: ["sticky", "note", "sticky note"],
          keyboardShortcut: "/note",
          onSelect: () =>
            editor.dispatchCommand(
              INSERT_STICKY_COMMAND,
              undefined,
            ),
        }),
      );
    }

    if (editor.hasNode(KanbanNode)) {
      baseOptions.push(
        new ComponentPickerOption("Kanban Board", {
          icon: <Kanban />,
          keywords: ["kanban", "board", "tasks", "workflow", "todo", "backlog"],
          keyboardShortcut: "/kanban",
          onSelect: () =>
            editor.dispatchCommand(
              INSERT_KANBAN_COMMAND,
              undefined,
            ),
        }),
      );
    }

    if (editor.hasNode(CanvasNode)) {
      baseOptions.push(
        new ComponentPickerOption("Notes Canvas", {
          icon: <LayoutDashboard />,
          keywords: [
            "canvas",
            "notes",
            "board",
            "sticky",
            "whiteboard",
            "corkboard",
          ],
          keyboardShortcut: "/canvas",
          onSelect: () =>
            editor.dispatchCommand(
              INSERT_CANVAS_COMMAND,
              undefined,
            ),
        }),
      );
    }

    if (editor.hasNode(NestedDocNode)) {
      baseOptions.push(
        new ComponentPickerOption("Nested Document", {
          icon: <NotebookText />,
          keywords: ["nested", "document", "doc", "sub-document", "embed"],
          keyboardShortcut: "/doc",
          onSelect: () =>
            editor.dispatchCommand(INSERT_NESTED_DOC_COMMAND, undefined),
        }),
      );
    }

    if (editor.hasNode(TableNode)) {
      baseOptions.push(
        new ComponentPickerOption("Table", {
          icon: <Table />,
          keywords: [
            "table",
            "grid",
            "spreadsheet",
            "rows",
            "columns",
          ],
          keyboardShortcut: "/3x3",
          onSelect: openTableDialog,
        }),
      );
    }

    if (editor.hasNode(LayoutContainerNode)) {
      baseOptions.push(
        new ComponentPickerOption("Columns", {
          icon: <Columns2 />,
          keywords: ["columns", "layout", "col"],
          keyboardShortcut: "/col",
          onSelect: openLayoutDialog,
        }),
      );
    }

    if (editor.hasNode(PageBreakNode)) {
      baseOptions.push(
        new ComponentPickerOption("Page Break", {
          icon: <Scissors />,
          keywords: ["page break", "break", "page"],
          keyboardShortcut: "/page",
          onSelect: () => editor.dispatchCommand(INSERT_PAGE_BREAK, undefined),
        }),
      );
    }

    if (editor.hasNode(IFrameNode)) {
      baseOptions.push(
        new ComponentPickerOption("IFrame", {
          icon: <Globe />,
          keywords: ["iframe", "embed"],
          keyboardShortcut: "/iframe",
          onSelect: openIFrameDialog,
        }),
      );
    }

    if (editor.hasNode(DetailsContainerNode)) {
      baseOptions.push(
        new ComponentPickerOption("Details", {
          icon: <ChevronDown />,
          keywords: ["details", "summary", "expand", "collapse"],
          keyboardShortcut: "/details",
          onSelect: () =>
            editor.dispatchCommand(
              INSERT_DETAILS_COMMAND,
              undefined,
            ),
        }),
      );
    }

    if (editor.hasNode(AttachmentNode)) {
      baseOptions.push(
        new ComponentPickerOption("Attachment", {
          icon: <Paperclip />,
          keywords: ["attachment", "attach", "file", "upload"],
          keyboardShortcut: "/attach",
          onSelect: openAttachmentDialog,
        }),
      );
    }
    const dynamicOptions = getDynamicOptions();

    return queryString
      ? [
        ...dynamicOptions,
        ...baseOptions.filter((option) => {
          return new RegExp(queryString, "gi").exec(option.title) ||
              option.keywords != null
            ? option.keywords.some((keyword) =>
              new RegExp(queryString, "gi").exec(keyword)
            )
            : false;
        }),
      ]
      : baseOptions;
  }, [
    editor,
    getDynamicOptions,
    queryString,
    openAttachmentDialog,
    openGraphDialog,
    openIFrameDialog,
    openImageDialog,
    openLayoutDialog,
    openOCRDialog,
    openSketchDialog,
    openTableDialog,
  ]);

  const onSelectOption = useCallback(
    (
      selectedOption: ComponentPickerOption,
      nodeToRemove: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        if (nodeToRemove) {
          nodeToRemove.remove();
        }
        selectedOption.onSelect(matchingString);
        closeMenu();
      });
    },
    [editor],
  );

  return (
    <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        anchorElement,
        props,
      ) =>
        anchorElement.current && options.length
          ? ReactDOM.createPortal(
            <IconMenu {...props} />,
            anchorElement.current,
          )
          : null}
    />
  );
}
