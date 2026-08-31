"use client";
import { LexicalEditor } from "lexical";
import { MathNode } from "@/editor/nodes/MathNode";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  $getNodeStyleValueForProperty,
  $patchStyle,
} from "@/editor/nodes/utils";
import ColorPicker, { backgroundPalette, textPalette } from "./ColorPicker";
import type { MathfieldElement } from "mathlive";
import { Menu, Pencil, PenLine, Save, Trash2 } from "lucide-react";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { Announcement } from "@/types";

import dynamic from "next/dynamic";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import useOnlineStatus from "@/hooks/useOnlineStatus";
import { FontSizePicker } from "./FontSizePicker";
import { ICON_SIZE } from "@/theme/icons";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  getActionButtonClassName,
  TextAreaField,
  Tooltip,
  TooltipProvider,
} from "@/editor/ui";
import { useColorScheme } from "@/editor/utils/useColorScheme";
import { dismissRequest, IndeterminateProgress } from "../Dialogs/parts";
import * as dialogCss from "../Dialogs/styles.css";
import * as css from "./tools.css";

const Excalidraw = dynamic<ExcalidrawProps>(
  () =>
    import("@excalidraw/excalidraw").then((module) => ({
      default: module.Excalidraw,
    })),
  { ssr: false },
);

const WolframIcon = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 0 20 20"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M15.33 10l2.17-2.47-3.19-.71.33-3.29-3 1.33L10 2 8.35 4.86l-3-1.33.32 3.29-3.17.71L4.67 10 2.5 12.47l3.19.71-.33 3.29 3-1.33L10 18l1.65-2.86 3 1.33-.32-3.29 3.19-.71zm-2.83 1.5h-5v-1h5zm0-2h-5v-1h5z" />
  </svg>
);

/**
 * Wolfram's orange. It stays an inline literal, exactly where the `sx` that
 * preceded it was, because it is a brand mark rather than a theme colour — see
 * the note beside `drawPanel` in `tools.css.ts` for why it may not move into a
 * stylesheet.
 */
const WOLFRAM_ORANGE = "#f96932";

const buttonClass = getActionButtonClassName({ size: "md", icon: true });

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL;

const useCallbackRefState = () => {
  const [refValue, setRefValue] = useState<ExcalidrawImperativeAPI | null>(
    null,
  );
  const refCallback = useCallback(
    (value: ExcalidrawImperativeAPI | null) => setRefValue(value),
    [],
  );
  return [refValue, refCallback] as const;
};

export default function MathTools(
  { editor, node }: {
    editor: LexicalEditor;
    node: MathNode;
  },
) {
  const [value, setValue] = useState<string | null>(null);
  /*
   * The scheme off `html.dark` rather than `useTheme().palette.mode`. Excalidraw
   * cannot read our CSS, so it is one of the few places that genuinely needs
   * the answer in JS — see `utils/useColorScheme.ts`.
   */
  const colorScheme = useColorScheme();
  const isOnline = useOnlineStatus();
  const [excalidrawAPI, excalidrawAPIRefCallback] = useCallbackRefState();
  const [fontSize, setFontSize] = useState("16px");
  const [textColor, setTextColor] = useState<string>();
  const [backgroundColor, setBackgroundColor] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    editor.getEditorState().read(() => {
      const mathfield = editor.getElementByKey(node.__key)?.querySelector(
        "math-field",
      ) as MathfieldElement | null;
      if (!mathfield) return;
      const computedStyle = window.getComputedStyle(mathfield);
      const currentFontSize = computedStyle.getPropertyValue("font-size");
      const fontSize = $getNodeStyleValueForProperty(
        node,
        "font-size",
        currentFontSize,
      );
      setFontSize(fontSize);
      const mathTools = document.getElementById("math-tools");
      const virtualKeyboard = window.mathVirtualKeyboard;
      const container = (virtualKeyboard as { element?: HTMLElement })?.element
        ?.firstElementChild as HTMLElement;
      if (!container || !mathTools) return;
      document.documentElement.style.setProperty(
        "--keyboard-inset-height",
        container.clientHeight + "px",
      );
      if (getComputedStyle(mathTools).position === "fixed") {
        const mathToolsBounds = mathTools.getBoundingClientRect();
        const mathfieldBounds = mathfield.getBoundingClientRect();
        const kbdBounds = container.getBoundingClientRect();
        if (
          mathfieldBounds.bottom >
            kbdBounds.top - mathToolsBounds.height
        ) {
          scrollBy(
            0,
            mathfieldBounds.bottom - kbdBounds.top +
              mathToolsBounds.height + 8,
          );
        }
      }
    });
  }, [node, editor]);

  const applyStyleMath = useCallback(
    (styles: Record<string, string>) => {
      editor.update(() => {
        $patchStyle(node, styles);
      });
    },
    [editor, node],
  );

  const updateFontSize = useCallback(
    (fontSize: number) => {
      setFontSize(fontSize + "px");
      applyStyleMath({ "font-size": fontSize + "px" });
    },
    [applyStyleMath],
  );

  const onColorChange = useCallback((key: string, value: string) => {
    const styleKey = key === "text" ? "color" : "background-color";
    const mathfield = editor.getElementByKey(node.__key)?.querySelector(
      "math-field",
    ) as MathfieldElement | null;
    if (!mathfield) return;
    if (mathfield.selectionIsCollapsed) {
      applyStyleMath({ [styleKey]: value });
    } else {
      const style = key === "text"
        ? ({ color: value })
        : ({ backgroundColor: value });
      const selection = mathfield.selection;
      const range = selection.ranges[0];
      mathfield.applyStyle(style, range);
    }
    if (key === "text") setTextColor(value);
    else setBackgroundColor(value);
  }, [applyStyleMath, node, editor]);

  const readMathfieldColor = useCallback(() => {
    editor.getEditorState().read(() => {
      const mathfield = editor.getElementByKey(node.__key)?.querySelector(
        "math-field",
      ) as MathfieldElement | null;
      if (!mathfield) return;
      if (mathfield.selectionIsCollapsed) {
        const color = $getNodeStyleValueForProperty(node, "color");
        setTextColor(color);
        const backgroundColor = $getNodeStyleValueForProperty(
          node,
          "background-color",
        );
        setBackgroundColor(backgroundColor);
      } else {
        const color = textPalette.find((color) =>
          mathfield.queryStyle({ color }) === "all"
        ) || "";
        setTextColor(color);
        const backgroundColor = backgroundPalette.find((backgroundColor) =>
          mathfield.queryStyle({ backgroundColor }) === "all"
        ) || "";
        setBackgroundColor(backgroundColor);
      }
    });
  }, [node, editor]);

  const [open, setOpen] = useState(false);
  const mathfieldValueRef = useRef<HTMLTextAreaElement | null>(null);
  const openEditDialog = () => {
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      const textarea = mathfieldValueRef.current;
      if (!textarea) return;
      textarea.setSelectionRange(
        textarea.value.length,
        textarea.value.length,
      );
    }, 0);
  }, [open]);

  const restoreFocus = useCallback(() => {
    window.mathVirtualKeyboard.show();
    const mathfield = editor.getElementByKey(node.__key)?.querySelector(
      "math-field",
    ) as MathfieldElement | null;
    if (!mathfield) return;
    setTimeout(() => mathfield.focus(), 0);
  }, [editor, node]);

  const handleClose = useCallback(() => {
    setOpen(false);
    if (value === "draw") {
      setTimeout(() => window.mathVirtualKeyboard.hide(), 0);
    } else restoreFocus();
  }, [value, restoreFocus]);

  const mathfieldRef = useRef<MathfieldElement>(null);
  const [formData, setFormData] = useState({ value: node.getValue() });
  useEffect(() => {
    setFormData({ value: node.getValue() });
    if (value === "draw") {
      setTimeout(() => window.mathVirtualKeyboard.hide(), 0);
    }
  }, [node, value]);

  const updateFormData = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      e.target.focus();
      setFormData({ ...formData, [e.target.name]: e.target.value });
      if (mathfieldRef.current) {
        mathfieldRef.current.setValue(e.target.value);
      }
    },
    [formData],
  );
  const handleEdit = useCallback(
    (
      e:
        | React.FormEvent<HTMLFormElement>
        | React.MouseEvent<HTMLButtonElement>,
    ) => {
      e.preventDefault();
      const { value } = formData;
      const mathfield = editor.getElementByKey(node.__key)?.querySelector(
        "math-field",
      ) as MathfieldElement | null;
      if (!mathfield) return;
      mathfield.setValue(value, { selectionMode: "after" });
      handleClose();
    },
    [editor, formData, handleClose, node],
  );

  const openWolfram = useCallback(() => {
    const mathfield = editor.getElementByKey(node.__key)?.querySelector(
      "math-field",
    ) as MathfieldElement | null;
    if (!mathfield) return;
    const selection = mathfield.selection;
    const value = mathfield.getValue(selection, "latex-unstyled") ||
      mathfield.getValue("latex-unstyled");
    window.open(
      `https://www.wolframalpha.com/input?i=${encodeURIComponent(value)}`,
    );
    setTimeout(() => {
      setValue(null);
    }, 0);
  }, [node, editor]);

  const annouunce = useCallback((announcement: Announcement) => {
    editor.dispatchCommand(ANNOUNCE_COMMAND, announcement);
  }, [editor]);

  const ocr = useCallback(async (blob: Blob) => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", blob);

      const response = await fetch(`${FASTAPI_URL}/pix2text`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with status ${response.status}`,
        );
      }
      const result = await response.json();
      return result.generated_text;
    } catch (error: unknown) {
      annouunce({
        message: {
          title: "Something went wrong",
          subtitle: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [annouunce]);

  const handleFreeHand = useCallback(async () => {
    const exportToBlob = await import("@excalidraw/excalidraw").then((
      module,
    ) => module.exportToBlob).catch((e) => console.error(e));
    if (!exportToBlob) return;
    const blob = await exportToBlob({
      elements: excalidrawAPI!.getSceneElements(),
      files: excalidrawAPI!.getFiles(),
      mimeType: "image/png",
      exportPadding: 16,
    });
    const latex = await ocr(blob);
    if (!latex) return;
    const mathfield = editor.getElementByKey(node.__key)?.querySelector(
      "math-field",
    ) as MathfieldElement | null;
    if (!mathfield) return;
    mathfield.executeCommand(["insert", latex]);
    handleClose();
  }, [excalidrawAPI, node, ocr, editor, handleClose]);

  /**
   * What MUI's exclusive `ToggleButtonGroup.onChange` did, now called by the
   * one button that relied on it. `null` means "deselected", which is the
   * signal to give focus back to the math field.
   */
  const handleToggle = (next: string | null) => {
    setValue(next);
    if (next === "draw") {
      setTimeout(() => window.mathVirtualKeyboard.hide(), 0);
    }
    if (next === null) restoreFocus();
  };

  return (
    <TooltipProvider closeDelay={0} delay={500}>
      <div className={css.anchoredToolGroup}>
        <Tooltip content="Edit LaTeX">
          <button
            aria-label="Edit LaTeX"
            className={buttonClass}
            type="button"
            onClick={openEditDialog}
          >
            <Pencil size={ICON_SIZE.dense} />
          </button>
        </Tooltip>
        {/*
          Escape closes this one. It is the exception `dismissRequest`
          documents — the LaTeX box holds a draft of something the document
          already has, so dismissing it loses an edit, not the work.
        */}
        <Dialog
          open={open}
          onOpenChange={dismissRequest(handleClose, { escapeCloses: true })}
        >
          <DialogPopup initialFocus={mathfieldValueRef} size="md">
            <form onSubmit={handleEdit}>
              <DialogHeader>
                <DialogTitle>Edit LaTeX</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <div className={dialogCss.form}>
                  <TextAreaField
                    id="value"
                    label="Latex Value"
                    name="value"
                    ref={mathfieldValueRef}
                    value={formData.value}
                    onChange={updateFormData}
                  />
                  <div className={css.mathPreview}>
                    <h3 className={dialogCss.sectionHeading}>Preview</h3>
                    <math-field ref={mathfieldRef} value={formData.value}
                      read-only
                    >
                    </math-field>
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <ActionButton onClick={handleClose} size="lg" variant="outline">
                  Cancel
                </ActionButton>
                <ActionButton
                  onClick={handleEdit}
                  size="lg"
                  type="submit"
                  variant="accent"
                >
                  Save
                </ActionButton>
              </DialogFooter>
            </form>
          </DialogPopup>
        </Dialog>
        <Tooltip content="Delete">
          <button
            aria-label="Delete"
            className={buttonClass}
            type="button"
            onClick={() => {
              editor.update(() => {
                node.selectPrevious();
                node.remove();
              });
            }}
          >
            <Trash2 size={ICON_SIZE.dense} />
          </button>
        </Tooltip>
      </div>
      <div className={css.toolCluster} id="math-tools">
        <div className={css.toolGroup}>
          <Tooltip content="Open in WolframAlpha">
            <button
              aria-label="Open in WolframAlpha"
              className={buttonClass}
              disabled={!isOnline}
              style={isOnline ? { color: WOLFRAM_ORANGE } : undefined}
              type="button"
              onClick={openWolfram}
            >
              <WolframIcon />
            </button>
          </Tooltip>
          <Tooltip content="Draw an equation">
            <button
              aria-label="Draw an equation"
              aria-pressed={value === "draw"}
              className={buttonClass}
              disabled={!isOnline}
              type="button"
              onClick={() => handleToggle(value === "draw" ? null : "draw")}
            >
              <PenLine size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
          {value === "draw" && (
            <div className={css.drawPanel}>
              <Excalidraw
                excalidrawAPI={excalidrawAPIRefCallback}
                initialData={{
                  elements: [],
                  appState: {
                    activeTool: {
                      type: "freedraw",
                      lastActiveTool: null,
                      customType: null,
                      locked: true,
                    },
                    currentItemStrokeWidth: 0.5,
                  },
                }}
                langCode="en"
                theme={colorScheme}
              />
              <button
                aria-label="Recognise the drawing"
                className={`${buttonClass} ${css.drawSave}`}
                disabled={loading}
                type="button"
                onClick={handleFreeHand}
              >
                <Save size={ICON_SIZE.dense} />
              </button>
              <div className={css.drawProgress}>
                <IndeterminateProgress active={loading} />
              </div>
            </div>
          )}
        </div>
        <FontSizePicker
          fontSize={fontSize}
          onBlur={restoreFocus}
          updateFontSize={updateFontSize}
        />
        <div className={css.toolGroup}>
          <ColorPicker
            backgroundColor={backgroundColor}
            onClose={handleClose}
            onColorChange={onColorChange}
            onOpen={readMathfieldColor}
            textColor={textColor}
          />
          <Tooltip content="More math commands">
            <button
              aria-label="More math commands"
              className={buttonClass}
              type="button"
              onClick={(e) => {
                const mathfield = editor.getElementByKey(node.__key)
                  ?.querySelector("math-field") as
                    | MathfieldElement
                    | null;
                if (!mathfield) return;
                const x = e.currentTarget.getBoundingClientRect().left;
                const y = e.currentTarget.getBoundingClientRect().top + 40;
                mathfield.showMenu({
                  location: { x, y },
                  modifiers: {
                    alt: false,
                    control: false,
                    shift: false,
                    meta: false,
                  },
                });
                setTimeout(() => {
                  setValue(null);
                }, 0);
              }}
            >
              <Menu size={ICON_SIZE.dense} />
            </button>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
