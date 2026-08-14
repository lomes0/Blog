"use client";
/**
 * NodeSelectionPlugin
 *
 * Allows selecting entire ElementNodes (like tables, code blocks, and attachments)
 * by clicking on their left edge. Once selected, the node can be cut/copied/deleted/pasted.
 */

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $setSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  ElementNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  Klass,
  LexicalNode,
  PASTE_COMMAND,
  type PasteCommandType,
  SerializedElementNode,
  SerializedLexicalNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { $generateHtmlFromNodes } from "@lexical/html";
import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import { CARD_CHROME_ATTR } from "@/editor/nodes/CodeNode/card";

interface NodeSelectionPluginProps {
  /**
   * Node classes that should be selectable.
   * Defaults to [CodeNode, TableNode, AttachmentNode] if not provided.
   */
  selectableNodes?: Array<Klass<LexicalNode>>;
}

/**
 * Type guard generator for checking if a node is of a selectable type
 */
function createIsSelectableNode(
  selectableNodes: Array<Klass<LexicalNode>>,
) {
  return (node: LexicalNode | null | undefined): boolean => {
    if (!node) return false;
    return selectableNodes.some((NodeClass) => node instanceof NodeClass);
  };
}

/**
 * Gets the gutter width from CSS custom property or falls back to default
 */
function getGutterWidth(element: HTMLElement): number {
  const computedStyle = getComputedStyle(element);
  const cssValue = computedStyle.getPropertyValue("--code-gutter-width").trim();
  if (cssValue) {
    const parsed = parseInt(cssValue, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 32; // Fallback
}

/**
 * Checks if click is within the left edge threshold for selection
 */
function isClickOnLeftEdge(
  event: MouseEvent,
  element: HTMLElement,
  threshold: number,
): boolean {
  const rect = element.getBoundingClientRect();
  const clickX = event.clientX;
  return clickX - rect.left <= threshold;
}

/**
 * Finds a selectable node element from the clicked target
 */
function getSelectableNodeFromElement(
  element: HTMLElement,
): { nodeKey: string | null; element: HTMLElement } | null {
  // A code block is selected by clicking within the gutter's width of its left
  // edge — and since docs/plans/code-block-card.md the card's header shares
  // that edge, so the language dropdown sits inside the hit area. Chrome is
  // never a node-selection gesture.
  if (element.closest(`[${CARD_CHROME_ATTR}]`)) {
    return null;
  }

  // Check for code block
  const codeElement = element.closest(
    "code.LexicalTheme__code",
  ) as HTMLElement;
  if (codeElement) {
    return { nodeKey: null, element: codeElement };
  }

  // Check for table
  const tableElement = element.closest(
    "table.LexicalTheme__table",
  ) as HTMLElement;
  if (tableElement) {
    const key = tableElement.getAttribute("data-lexical-node-key");
    return { nodeKey: key, element: tableElement };
  }

  // Check for decorator node (attachment, etc.)
  const decoratorSpan = element.closest(
    "span[data-lexical-decorator]",
  ) as HTMLElement;
  if (decoratorSpan) {
    const key = decoratorSpan.getAttribute("data-lexical-node-key");
    return { nodeKey: key, element: decoratorSpan };
  }

  return null;
}

/**
 * Recursively exports a node with all its children.
 * Note: This is necessary because Lexical's exportJSON() doesn't automatically
 * include children for ElementNodes like CodeNode. Without this, copied code
 * blocks would lose their line content.
 */
function exportNodeRecursively(node: LexicalNode): SerializedLexicalNode {
  const serialized = node.exportJSON();

  if ("getChildren" in node && typeof node.getChildren === "function") {
    const children = (node as ElementNode).getChildren();
    (serialized as SerializedElementNode).children = children.map((child) =>
      exportNodeRecursively(child)
    );
  }

  return serialized;
}

export default function NodeSelectionPlugin({
  selectableNodes,
}: NodeSelectionPluginProps = {}): null {
  const [editor] = useLexicalComposerContext();
  const selectedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Lazy import to avoid circular dependencies
    const getDefaultNodes = async () => {
      if (selectableNodes && selectableNodes.length > 0) {
        return selectableNodes;
      }

      // Import default selectable nodes
      const [{ CodeNode }, { TableNode }, { AttachmentNode }] = await Promise
        .all([
          import("@lexical/code"),
          import("@/editor/nodes/TableNode"),
          import("@/editor/nodes/AttachmentNode"),
        ]);

      return [CodeNode, TableNode, AttachmentNode];
    };

    let unregister: (() => void) | undefined;

    getDefaultNodes().then((nodes) => {
      // Validate that nodes are registered
      const unregisteredNodes = nodes.filter(
        (NodeClass) => !editor.hasNodes([NodeClass as Klass<LexicalNode>]),
      );

      if (unregisteredNodes.length > 0) {
        throw new Error(
          `NodeSelectionPlugin: The following nodes are not registered: ${
            unregisteredNodes
              .map((n) => n.name)
              .join(", ")
          }`,
        );
      }

      const isSelectableNode = createIsSelectableNode(nodes);

      // Handle click to select nodes
      const onClick = (event: MouseEvent): boolean => {
        const target = event.target as HTMLElement;
        const result = getSelectableNodeFromElement(target);

        if (!result) {
          return false;
        }

        const { element, nodeKey: directNodeKey } = result;

        // Check if this is a decorator node (like attachment) - they don't require left edge click
        const isDecoratorClick = element.hasAttribute("data-lexical-decorator");

        // Only require left edge click for code blocks and tables, not attachments
        if (!isDecoratorClick) {
          const threshold = element.classList.contains("LexicalTheme__code")
            ? getGutterWidth(element)
            : 32;

          if (!isClickOnLeftEdge(event, element, threshold)) {
            return false;
          }
        }

        // Prevent default behavior early to avoid cursor placement
        event.preventDefault();
        event.stopPropagation();

        // Get the node - either from direct key or by finding it from DOM
        let foundNodeKey: string | null = directNodeKey;

        editor.update(() => {
          if (!foundNodeKey) {
            const node = $getNearestNodeFromDOMNode(element);
            if (node && isSelectableNode(node)) {
              foundNodeKey = node.getKey();
            }
          }

          if (foundNodeKey) {
            const node = $getNodeByKey(foundNodeKey);

            if (node && isSelectableNode(node)) {
              const nodeSelection = $createNodeSelection();
              nodeSelection.add(foundNodeKey);
              $setSelection(nodeSelection);

              // Visual feedback is handled by the update listener
              // Decorator nodes handle their own selection styling
            }
          }
        });

        return foundNodeKey !== null;
      };

      // Handle delete/backspace
      const onDelete = (event: KeyboardEvent): boolean => {
        const selection = $getSelection();
        if (!$isNodeSelection(selection)) {
          return false;
        }

        const nodes = selection.getNodes();
        let handled = false;

        for (const node of nodes) {
          if (isSelectableNode(node)) {
            event.preventDefault();
            node.remove();
            handled = true;
          }
        }

        return handled;
      };

      // Handle cut via DOM event (actual clipboard manipulation)
      const handleCut = (event: ClipboardEvent) => {
        const selection = editor.getEditorState().read(() => $getSelection());

        if (!$isNodeSelection(selection)) {
          return;
        }

        const nodes = selection.getNodes();
        const selectableNodesInSelection = nodes.filter(isSelectableNode);

        if (selectableNodesInSelection.length === 0) {
          return;
        }

        editor.getEditorState().read(() => {
          const htmlString = $generateHtmlFromNodes(editor, selection);
          const jsonNodes = selectableNodesInSelection.map((node) =>
            exportNodeRecursively(node)
          );

          const lexicalData = JSON.stringify({
            namespace: editor._config.namespace,
            nodes: jsonNodes,
          });

          if (event.clipboardData) {
            event.clipboardData.setData("text/html", htmlString);
            event.clipboardData.setData(
              "text/plain",
              selectableNodesInSelection
                .map((n) => n.getTextContent())
                .join("\n"),
            );
            event.clipboardData.setData(
              "application/x-lexical-editor",
              lexicalData,
            );
            event.preventDefault();
          }
        });

        // Remove nodes after copying
        editor.update(() => {
          const currentSelection = $getSelection();
          if ($isNodeSelection(currentSelection)) {
            const nodesToRemove = currentSelection
              .getNodes()
              .filter(isSelectableNode);
            for (const node of nodesToRemove) {
              node.remove();
            }
          }
        });
      };

      // Handle copy via DOM event
      const handleCopy = (event: ClipboardEvent) => {
        const selection = editor.getEditorState().read(() => $getSelection());

        if (!$isNodeSelection(selection)) {
          return;
        }

        const nodes = selection.getNodes();
        const selectableNodesInSelection = nodes.filter(isSelectableNode);

        if (selectableNodesInSelection.length === 0) {
          return;
        }

        editor.getEditorState().read(() => {
          const htmlString = $generateHtmlFromNodes(editor, selection);
          const jsonNodes = selectableNodesInSelection.map((node) =>
            exportNodeRecursively(node)
          );

          const lexicalData = JSON.stringify({
            namespace: editor._config.namespace,
            nodes: jsonNodes,
          });

          if (event.clipboardData) {
            event.clipboardData.setData("text/html", htmlString);
            event.clipboardData.setData(
              "text/plain",
              selectableNodesInSelection
                .map((n) => n.getTextContent())
                .join("\n"),
            );
            event.clipboardData.setData(
              "application/x-lexical-editor",
              lexicalData,
            );
            event.preventDefault();
          }
        });
      };

      // Handle paste via Lexical command. PASTE_COMMAND's payload is
      // `PasteCommandType` (ClipboardEvent | InputEvent | KeyboardEvent) and
      // the payload type became invariant in 0.49, so this cannot narrow to
      // ClipboardEvent in the signature — only in the body.
      const onPaste = (event: PasteCommandType): boolean => {
        const clipboardData = "clipboardData" in event
          ? event.clipboardData
          : null;
        if (!clipboardData) return false;

        const lexicalData = clipboardData.getData(
          "application/x-lexical-editor",
        );
        if (!lexicalData) {
          return false;
        }

        try {
          const parsed = JSON.parse(lexicalData);

          // Check if this contains our selectable nodes
          const hasSelectableNodes = parsed.nodes?.some(
            (serializedNode: SerializedLexicalNode) => {
              // Check if the serialized node matches any of our selectable types
              return nodes.some(
                (NodeClass) =>
                  serializedNode.type ===
                    (NodeClass as Klass<LexicalNode>).getType?.() ||
                  serializedNode.type ===
                    NodeClass.name.replace("Node", "").toLowerCase(),
              );
            },
          );

          if (!hasSelectableNodes) {
            return false;
          }

          // Generate nodes from serialized data
          const generatedNodes = $generateNodesFromSerializedNodes(
            parsed.nodes,
          );

          // Filter to only top-level selectable nodes
          const topLevelNodes = generatedNodes.filter(isSelectableNode);

          if (topLevelNodes.length === 0) {
            return false;
          }

          // Insert the nodes
          $insertNodes(topLevelNodes);

          return true;
        } catch (error) {
          console.error(
            "NodeSelectionPlugin: Failed to parse paste data",
            error,
          );
          return false;
        }
      };

      // Update visual feedback when selection changes
      const removeSelectionListener = editor.registerUpdateListener(
        ({ editorState }) => {
          editorState.read(() => {
            // Remove selected class from previously selected elements
            selectedKeysRef.current.forEach((key) => {
              const element = editor.getElementByKey(key);
              if (element) {
                element.classList.remove("LexicalTheme__nodeSelected");
              }
            });
            selectedKeysRef.current.clear();

            // Add selected class to currently selected nodes
            const selection = $getSelection();
            if ($isNodeSelection(selection)) {
              const nodes = selection.getNodes();
              for (const node of nodes) {
                if (isSelectableNode(node)) {
                  const key = node.getKey();
                  const element = editor.getElementByKey(key);
                  if (element) {
                    // Skip decorator nodes - they handle their own selection styling
                    const isDecorator = element.hasAttribute(
                      "data-lexical-decorator",
                    );
                    if (!isDecorator) {
                      element.classList.add("LexicalTheme__nodeSelected");
                      selectedKeysRef.current.add(key);
                    }
                  }
                }
              }
            }
          });
        },
      );

      // Attach DOM event listeners for cut/copy
      const rootElement = editor.getRootElement();
      if (rootElement) {
        rootElement.addEventListener("cut", handleCut as EventListener);
        rootElement.addEventListener("copy", handleCopy as EventListener);
      }

      // Register commands
      unregister = mergeRegister(
        editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          onDelete,
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          onDelete,
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(PASTE_COMMAND, onPaste, COMMAND_PRIORITY_HIGH),
        removeSelectionListener,
        () => {
          if (rootElement) {
            rootElement.removeEventListener("cut", handleCut as EventListener);
            rootElement.removeEventListener(
              "copy",
              handleCopy as EventListener,
            );
          }
        },
      );
    });

    return () => {
      unregister?.();
    };
  }, [editor, selectableNodes]);

  return null;
}
