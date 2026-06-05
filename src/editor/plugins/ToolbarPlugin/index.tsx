"use client";
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
import { $isParentElementRTL } from "@lexical/selection";
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
import { BlockFormatSelect } from "./Menus/BlockFormatSelect";
import InsertToolMenu from "./Menus/InsertToolMenu";
import TextFormatToggles from "./Tools/TextFormatToggles";
import AlignTextMenu from "./Menus/AlignTextMenu";
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
  AppBar,
  Box,
  Container,
  IconButton,
  Toolbar,
  useScrollTrigger,
} from "@mui/material";
import { Redo, Undo } from "lucide-react";
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
  onSave?: () => void;
  onDiscard?: () => void;
}

function ToolbarPlugin(
  { onSave: _onSave, onDiscard: _onDiscard }: ToolbarPluginProps,
) {
  const [editor] = useLexicalComposerContext();
  const [activeEditor, setActiveEditor] = useState(editor);

  const [blockType, setBlockType] = useState<
    keyof typeof blockTypeToBlockName
  >("paragraph");
  const [isRTL, setIsRTL] = useState(false);
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
  const [containerBounds, setContainerBounds] = useState<
    { left: number; width: number } | null
  >(null);

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

      setIsRTL($isParentElementRTL(selection));

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

  const toolbarTrigger = useScrollTrigger({
    disableHysteresis: true,
    threshold: 32,
  });

  useEffect(() => {
    const lightThemeMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    );
    const darkThemeMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    );
    if (lightThemeMeta && darkThemeMeta) {
      lightThemeMeta.setAttribute(
        "content",
        toolbarTrigger ? "#ffffff" : "#1976d2",
      );
      darkThemeMeta.setAttribute(
        "content",
        toolbarTrigger ? "#121212" : "#272727",
      );
    }
  }, [toolbarTrigger]);

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

  // Track the editor container bounds for floating toolbar positioning
  useEffect(() => {
    const container = document.getElementById("editor-main-container");
    if (!container) return;

    const updateBounds = () => {
      const rect = container.getBoundingClientRect();
      setContainerBounds({ left: rect.left, width: rect.width });
    };

    updateBounds();
    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(container);
    window.addEventListener("resize", updateBounds);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

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

  return (
    <>
      <AppBar
        elevation={toolbarTrigger ? 0 : 0}
        position={toolbarTrigger ? "fixed" : "static"}
        sx={{
          ...(toolbarTrigger && containerBounds && {
            // Center relative to the editor container
            left: containerBounds.left + containerBounds.width / 2,
            transform: "translateX(-50%)",
            width: Math.min(containerBounds.width - 24, 1400),
            maxWidth: 1400,
            top: 12,
            borderRadius: 2,
            boxShadow: 4,
          }),
          background: toolbarTrigger
            ? "rgba(var(--mui-palette-background-defaultChannel) / 0.92) !important"
            : "var(--mui-palette-background-default) !important",
          backdropFilter: toolbarTrigger ? "blur(12px)" : "none",
          border: toolbarTrigger ? 1 : 0,
          borderColor: "divider",
          transition: "none",
        }}
      >
        <Toolbar
          className="editor-toolbar"
          sx={{
            position: "relative",
            displayPrint: "none",
            alignItems: "center",
            px: "0 !important",
            py: 1,
          }}
        >
          <Container
            maxWidth={false}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              px: toolbarTrigger ? 2 : "0 !important",
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <IconButton
                title={IS_APPLE ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
                aria-label="Undo"
                disabled={!canUndo}
                onClick={() => {
                  activeEditor.dispatchCommand(
                    UNDO_COMMAND,
                    undefined,
                  );
                }}
              >
                <Undo size={18} />
              </IconButton>
              <IconButton
                title={IS_APPLE ? "Redo (⌘Y)" : "Redo (Ctrl+Y)"}
                aria-label="Redo"
                disabled={!canRedo}
                onClick={() => {
                  activeEditor.dispatchCommand(
                    REDO_COMMAND,
                    undefined,
                  );
                }}
              >
                <Redo size={18} />
              </IconButton>
            </Box>
            <Box
              sx={{
                display: "flex",
                gap: 0.5,
                overflow: "auto",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                minWidth: 0,
                "&::-webkit-scrollbar": { display: "none" },
                scrollbarWidth: "none",
              }}
            >
              {showMathTools && (
                <MathTools
                  editor={activeEditor}
                  node={selectedNode}
                />
              )}
              {showImageTools && (
                <ImageTools
                  editor={activeEditor}
                  node={selectedNode}
                />
              )}
              {showTextTools && (
                <>
                  {blockType in blockTypeToBlockName && (
                    <BlockFormatSelect
                      blockType={blockType}
                      editor={activeEditor}
                    />
                  )}
                  {showCodeTools && (
                    <CodeTools
                      editor={activeEditor}
                      node={selectedNode}
                    />
                  )}
                  {showTextFormatTools && <FontSelect editor={activeEditor} />}
                  <AITools editor={activeEditor} />
                  {showTableTools && (
                    <TableTools
                      editor={activeEditor}
                      node={selectedTable}
                    />
                  )}
                  {showNoteTools && (
                    <NoteTools
                      editor={editor}
                      node={selectedSticky}
                    />
                  )}
                  {showTextFormatTools && (
                    <TextFormatToggles
                      editor={activeEditor}
                      sx={{
                        display: {
                          xs: "none",
                          md: "flex",
                        },
                        flexShrink: 0,
                      }}
                    />
                  )}
                </>
              )}
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                flexShrink: 0,
              }}
            >
              <InsertToolMenu editor={activeEditor} />
              <AlignTextMenu
                editor={activeEditor}
                isRTL={isRTL}
              />

            </Box>
          </Container>
        </Toolbar>
      </AppBar>
      {toolbarTrigger && (
        <Box
          sx={(theme) => ({
            ...theme.mixins.toolbar,
            displayPrint: "none",
          })}
        />
      )}
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
