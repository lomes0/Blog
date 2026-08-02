"use client";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "./toolbar.css";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  CLEAR_HISTORY_COMMAND,
  LexicalNode,
} from "lexical";
import { $isListNode, ListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { useHash } from "react-use";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToolbarSlot } from "@/contexts/ToolbarSlotContext";
import { BlockFormatSelect } from "./Menus/BlockFormatSelect";
import InsertToolMenu from "./Menus/InsertToolMenu";
import TextFormatToggles from "./Tools/TextFormatToggles";
import { $isMathNode } from "@/editor/nodes/MathNode";
import MathTools from "./Tools/MathTools";
import { $isImageNode } from "@/editor/nodes/ImageNode";
import ImageTools from "./Tools/ImageTools";
import { $isGraphNode } from "@/editor/nodes/GraphNode";
import {
  AIDialog,
  AttachmentDialog,
  GraphDialog,
  IFrameDialog,
  ImageDialog,
  LayoutDialog,
  LinkDialog,
  OCRDialog,
  SketchDialog,
  TableDialog,
} from "./Dialogs";
import { $isStickyNode, StickyNode } from "@/editor/nodes/StickyNode";
import {
  Box,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Link, Redo, RotateCcw, Undo } from "lucide-react";
import { $isIFrameNode } from "@/editor/nodes/IFrameNode";
import { $findMatchingParent, IS_APPLE } from "@lexical/utils";
import { $isTableNode, TableNode } from "@/editor/nodes/TableNode";
import TableTools from "./Tools/TableTools";
import { $isLinkNode } from "@lexical/link";
import {
  EditorDialogs,
  SET_DIALOGS_COMMAND,
  SetDialogsPayload,
} from "./Dialogs/commands";
import { getSelectedNode } from "@/editor/utils/getSelectedNode";
import AITools from "./Tools/AITools";
import FontSelect from "./Menus/FontSelect";
import CodeTools from "./Tools/CodeTools";
import NoteTools from "./Tools/NoteTools";
import { $isCodeNode } from "@/editor/nodes/CodeNode";
import { ICON_SIZE } from "@/theme/icons";

const blockTypeToBlockName = {
  bullet: "Bulleted List",
  check: "Check List",
  code: "Code Block",
  quote: "Quote",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  number: "Numbered List",
  paragraph: "Normal",
};

interface ToolbarPluginProps {
  isActive?: boolean;
  onReset?: () => void;
}

function ToolbarPlugin(
  { isActive = true, onReset }: ToolbarPluginProps,
) {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);

  const [blockType, setBlockType] = useState<
    keyof typeof blockTypeToBlockName
  >("paragraph");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedNode, setSelectedNode] = useState<LexicalNode | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableNode | null>(null);
  const [selectedSticky, setSelectedSticky] = useState<StickyNode | null>(
    null,
  );
  const [dialogs, setDialogs] = useState<EditorDialogs>({});
  const isTouched = useRef<boolean>(false);
  const [hash] = useHash();
  const { slotEl } = useToolbarSlot();

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isNodeSelection(selection)) {
      const node = selection.getNodes()[0];
      setSelectedNode(node);
      if ($isStickyNode(node)) setSelectedSticky(node);
      setBlockType("paragraph");
    } else {
      setSelectedNode(null);
    }
    if ($isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      if ($isLinkNode(node)) setSelectedNode(node);
      const parent = node.getParent();
      if ($isLinkNode(parent)) setSelectedNode(parent);

      const tableNode = $findMatchingParent(node, $isTableNode);
      setSelectedTable(tableNode);
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === "root"
        ? anchorNode
        : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = activeEditor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = $getNearestNodeOfType<ListNode>(
            anchorNode,
            ListNode,
          );
          const type = parentList
            ? parentList.getListType()
            : element.getListType();
          setBlockType(type);
        } else {
          const type = $isHeadingNode(element)
            ? element.getTag()
            : element.getType();
          if (type in blockTypeToBlockName) {
            setBlockType(type as keyof typeof blockTypeToBlockName);
          }
          if ($isCodeNode(element)) {
            setSelectedNode(element);
            return;
          }
        }
      }
      const parentEditor = activeEditor._parentEditor;
      if (parentEditor) {
        const rootElement = activeEditor.getRootElement();
        parentEditor.getEditorState().read(() => {
          const keyToDomMap = parentEditor._keyToDOMMap;
          const parentNodeKey = [...keyToDomMap.keys()].findLast((
            key,
          ) => keyToDomMap.get(key)?.contains(rootElement));
          if (!parentNodeKey) return setSelectedSticky(null);
          const parentNode = $getNodeByKey(parentNodeKey);
          setSelectedSticky(
            $isStickyNode(parentNode) ? parentNode : null,
          );
        });
      } else {
        setSelectedSticky(null);
      }
    } else if (selection === null) {
      setBlockType("paragraph");
      setSelectedNode(null);
      setSelectedSticky(null);
      setSelectedTable(null);
    }
  }, [activeEditor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, newEditor) => {
          setActiveEditor(newEditor);
          $updateToolbar();
          if (!isTouched.current) {
            isTouched.current = true;
          }
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, $updateToolbar]);

  useEffect(() => {
    activeEditor.getEditorState().read(() => {
      $updateToolbar();
    });
  }, [activeEditor, $updateToolbar]);

  useEffect(() => {
    return mergeRegister(
      activeEditor.registerUpdateListener(({ editorState, tags }) => {
        editorState.read(() => {
          $updateToolbar();
        });
        const tagValue = tags.values().next().value as string | undefined;
        if (tagValue && tagValue.startsWith("{")) {
          try {
            const revision = JSON.parse(tagValue);
            if (revision.id) {
              isTouched.current = false;
            }
          } catch (e) {
            console.error("Failed to parse revision tag:", e);
          }
        }
      }),
      activeEditor.registerCommand<boolean>(
        CAN_UNDO_COMMAND,
        (payload) => {
          if (payload && !isTouched.current) {
            editor.dispatchCommand(
              CLEAR_HISTORY_COMMAND,
              undefined,
            );
            return false;
          }
          setCanUndo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      activeEditor.registerCommand<boolean>(
        CAN_REDO_COMMAND,
        (payload) => {
          if (payload && !isTouched.current) {
            editor.dispatchCommand(
              CLEAR_HISTORY_COMMAND,
              undefined,
            );
            return false;
          }
          setCanRedo(payload);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [activeEditor, $updateToolbar, editor]);

  useEffect(() => {
    return activeEditor.registerCommand<SetDialogsPayload>(
      SET_DIALOGS_COMMAND,
      (payload) => {
        setDialogs({ ...dialogs, ...payload });
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [activeEditor, dialogs]);

  useEffect(() => {
    if (!hash) return;
    const scrollIntoView = (behavior?: ScrollBehavior) => {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        return target.scrollIntoView({ block: "start", behavior });
      }
      const decodedHash = decodeURIComponent(hash.slice(1));
      const anchor = Array.from(document.querySelectorAll("a")).find(
        (a) =>
          a.getAttribute("href") === `#${decodedHash}` &&
          a.getAttribute("target") === "_self",
      );
      anchor?.scrollIntoView({ block: "start", behavior });
    };
    scrollIntoView();
    setTimeout(() => scrollIntoView("smooth"), 0);
  }, [hash]);

  const showMathTools = $isMathNode(selectedNode);
  const showImageTools = $isImageNode(selectedNode);
  const showCodeTools = $isCodeNode(selectedNode);
  const showTableTools = !!selectedTable;
  const showTextTools = (!showMathTools && !showImageTools) ||
    $isStickyNode(selectedNode);
  const showTextFormatTools = showTextTools && !showCodeTools;
  const showNoteTools = !!selectedSticky;
  const isDialogOpen = Object.values(dialogs).some((dialog) => dialog?.open);

  useEffect(() => {
    if (isDialogOpen) return;
    const selection = activeEditor.getEditorState().read($getSelection);
    if (!selection) return;
    setTimeout(() => {
      activeEditor.update(() => {
        $setSelection(selection.clone());
      });
      activeEditor.getRootElement()?.focus({ preventScroll: true });
    }, 0);
  }, [isDialogOpen, activeEditor]);

  const toolbarContent = (
    <Box
      className="editor-toolbar"
      sx={{
        display: "flex",
        alignItems: "center",
        px: 1.5,
        py: 0.5,
        bgcolor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
        displayPrint: "none",
        overflow: "hidden",
      }}
    >
      {/* Left spacer — centers the toolbar content */}
      <Box sx={{ flex: 1 }} />

      {/* Undo / Redo */}
      <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        {onReset && (
          <Tooltip title="Reset to last saved">
            <span>
              <IconButton
                aria-label="Reset to last saved"
                onClick={onReset}
              >
                <RotateCcw
                  size={ICON_SIZE.dense}
                  style={{ transform: "translateY(1px)" }}
                />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <IconButton
          title={IS_APPLE ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
          aria-label="Undo"
          disabled={!canUndo}
          onClick={() => activeEditor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo size={ICON_SIZE.dense} />
        </IconButton>
        <IconButton
          title={IS_APPLE ? "Redo (⌘Y)" : "Redo (Ctrl+Y)"}
          aria-label="Redo"
          disabled={!canRedo}
          onClick={() => activeEditor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo size={ICON_SIZE.dense} />
        </IconButton>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 0.75 }} />

      {/* Scrollable center section */}
      <Box
        sx={{
          display: "flex",
          gap: 0.5,
          overflow: "auto",
          alignItems: "center",
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        {showMathTools && (
          <MathTools editor={activeEditor} node={selectedNode} />
        )}
        {showImageTools && (
          <ImageTools editor={activeEditor} node={selectedNode} />
        )}
        {showTextTools && (
          <>
            {blockType in blockTypeToBlockName && (
              <BlockFormatSelect blockType={blockType} editor={activeEditor} />
            )}
            {showCodeTools && (
              <CodeTools editor={activeEditor} node={selectedNode} />
            )}
            {showTextFormatTools && <FontSelect editor={activeEditor} />}
            {showTableTools && (
              <TableTools editor={activeEditor} node={selectedTable} />
            )}
            {showNoteTools && (
              <NoteTools editor={editor} node={selectedSticky} />
            )}
            {showTextFormatTools && (
              <TextFormatToggles
                editor={activeEditor}
                sx={{ flexShrink: 0 }}
              />
            )}
          </>
        )}
      </Box>

      {/* Insert + Link + AI — always visible alongside text tools */}
      {showTextTools && showTextFormatTools && (
        <>
          <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 0.75 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              flexShrink: 0,
            }}
          >
            <InsertToolMenu editor={activeEditor} />
            <Tooltip
              title={IS_APPLE ? "Insert Link (⌘K)" : "Insert Link (Ctrl+K)"}
            >
              <IconButton
                size="small"
                aria-label="Insert link"
                onClick={() =>
                  activeEditor.dispatchCommand(SET_DIALOGS_COMMAND, {
                    link: { open: true },
                  })}
              >
                <Link size={ICON_SIZE.dense} />
              </IconButton>
            </Tooltip>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 0.75 }} />
          <Box sx={{ flexShrink: 0 }}>
            <AITools editor={activeEditor} />
          </Box>
        </>
      )}

      {/* Right spacer */}
      <Box sx={{ flex: 1 }} />
    </Box>
  );

  return (
    <>
      {slotEl && isActive && createPortal(toolbarContent, slotEl)}
      {dialogs.image?.open && (
        <ImageDialog
          editor={activeEditor}
          node={$isImageNode(selectedNode) ? selectedNode : null}
        />
      )}
      {dialogs.graph?.open && (
        <GraphDialog
          editor={activeEditor}
          node={$isGraphNode(selectedNode) ? selectedNode : null}
        />
      )}
      {dialogs.sketch?.open && (
        <SketchDialog
          editor={activeEditor}
          node={$isImageNode(selectedNode) ? selectedNode : null}
        />
      )}
      {dialogs.table?.open && <TableDialog editor={activeEditor} />}
      {dialogs.iframe?.open && (
        <IFrameDialog
          editor={activeEditor}
          node={$isIFrameNode(selectedNode) ? selectedNode : null}
        />
      )}
      {dialogs.link?.open && (
        <LinkDialog
          editor={activeEditor}
          node={$isLinkNode(selectedNode) ? selectedNode : null}
        />
      )}
      {dialogs.layout?.open && <LayoutDialog editor={activeEditor} />}
      {dialogs.ocr?.open && <OCRDialog editor={activeEditor} />}
      {dialogs.ai?.open && <AIDialog editor={activeEditor} />}
      {dialogs.attachment?.open && <AttachmentDialog editor={activeEditor} />}
    </>
  );
}

export default ToolbarPlugin;
