"use client";
import {
  $addUpdateTag,
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  BLUR_COMMAND,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  type RangeSelection,
  SELECTION_CHANGE_COMMAND,
  SerializedParagraphNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  Mic,
  Monitor,
  ScanSearch,
  Send,
  Sparkles,
} from "lucide-react";
import { useCompletion } from "@ai-sdk/react";
import { SET_DIALOGS_COMMAND } from "../Dialogs/commands";
import { ANNOUNCE_COMMAND, UPDATE_DOCUMENT_COMMAND } from "@/editor/commands";
import { Announcement } from "@/types";
import { throttle } from "@/editor/utils/throttle";
import {
  $convertFromMarkdownString,
  createTransformers,
} from "../../MarkdownPlugin";
import { createHeadlessEditor } from "@lexical/headless";
import { $generateNodesFromSerializedNodes } from "@lexical/clipboard";
import {
  AI_MODELS,
  AI_TONES,
  AI_TOOLBAR_ACTIONS,
  type AIActionToolbar,
  getModelById,
  type SelectionAIAction,
} from "@/lib/ai";
import { AI_ACTION_ICON } from "@/lib/ai/actionIcons";
import useLocalStorage from "@/hooks/useLocalStorage";
import { ICON_SIZE } from "@/theme/icons";
import {
  AutoResizeTextArea,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  getActionButtonClassName,
  Spinner,
} from "@/editor/ui";
import * as menuCss from "../Menus/menus.css";
import * as css from "./tools.css";

/**
 * The prose leading up to the caret, oldest first, capped at ~1KB.
 *
 * What `input: "precedingText"` actions are given instead of the selection:
 * "continue writing" and a typed request both need the run-up, not the words
 * under the cursor. Must be called inside an editor read or update.
 */
const $precedingText = (selection: RangeSelection): string => {
  let currentNode: LexicalNode | null | undefined = selection.anchor.getNode();
  let textContent = "";
  while (currentNode && textContent.length < 1024) {
    textContent = currentNode.getTextContent() + "\n\n" + textContent;
    currentNode = currentNode.getPreviousSibling() ||
      currentNode.getParent()?.getPreviousSibling();
  }
  return textContent;
};

const serializedParagraph: SerializedParagraphNode = {
  children: [],
  direction: null,
  format: "",
  indent: 0,
  type: "paragraph",
  version: 1,
  textFormat: 0,
  textStyle: "",
};

/**
 * Keys the prompt field keeps for itself while it is mounted inside the menu
 * popup — the same rule, and the same two exceptions, as the font-size stepper
 * inside the font popup. Base UI runs typeahead and list navigation on the
 * popup, so an unguarded keystroke would both type and move the highlight.
 */
const POPUP_KEYS = new Set(["Escape", "Tab"]);

/** The same labelled trigger as `Insert`, `Table` and `Note` — see `menus.css`. */
const triggerClass = cx(
  getActionButtonClassName({ variant: "outline", size: "lg" }),
  menuCss.menuTrigger,
);

const sendButtonClass = cx(
  getActionButtonClassName({ size: "md", icon: true }),
  css.promptSend,
);

export default function AITools({ editor }: { editor: LexicalEditor }) {
  const [llmConfig, setLlmConfig] = useLocalStorage("llm", {
    provider: "google",
    model: "gemini-2.5-flash",
  });

  /*
   * `useMenuState` is gone from this file — and, with it, from the package.
   * Base UI's `Menu.Root` owns the open state and its positioner anchors to the
   * trigger, so the anchor element the hook existed to hold has nowhere to go.
   * What is still local state is only what the *editor* needs to know: the menu
   * is open, so hold the selection and put it back on the way out.
   */
  const [open, setOpen] = useState(false);

  const handleModelSelect = (modelId: string) => {
    const model = getModelById(modelId);
    if (model) {
      setLlmConfig({ provider: model.provider, model: model.id });
    }
  };

  const restoreSelection = useCallback(() => {
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

  /**
   * Closing from something that is *not* a menu item — the send button, or
   * Enter in the prompt field. A `Menu.Item` closes the menu itself, and that
   * path lands in `handleOpenChange` instead.
   */
  const handleClose = useCallback(() => {
    setOpen(false);
    restoreSelection();
  }, [restoreSelection]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) restoreSelection();
  };

  const promptRef = useRef<HTMLTextAreaElement>(null);

  const annouunce = useCallback((announcement: Announcement) => {
    editor.dispatchCommand(ANNOUNCE_COMMAND, announcement);
  }, [editor]);

  const handleError = useCallback(() => {
    annouunce({
      message: {
        title: "Something went wrong",
        subtitle: "Please try again later",
      },
    });
  }, [annouunce]);

  const { completion, complete, isLoading, stop } = useCompletion({
    api: "/api/completion",
    streamProtocol: "text",
    onError: handleError,
  });

  const [isCollapsed, setIsCollapsed] = useState(true);
  const offsetRef = useRef(0);

  const handlePrompt = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!POPUP_KEYS.has(e.key)) e.stopPropagation();
    const command = e.currentTarget.value;
    const isSubmit = e.key === "Enter" && !e.shiftKey &&
      command.trim().length > 0;
    if (!isSubmit) return;
    e.preventDefault();
    handleSubmit();
  };

  /**
   * Read the text an action acts on and start the stream.
   *
   * One function for what used to be seven near-identical handlers. The two
   * things that genuinely varied are now the action's own `toolbar` descriptor:
   *
   * - `input` — the selected text, or the prose leading up to the caret.
   * - `result` — `"append"` collapses the selection to its end first, so the
   *   stream lands *after* the selected text rather than replacing it. That
   *   needs `editor.update`, because it moves the selection; `"replace"` reads
   *   only, since the insertion effect writes over the selection as it stands.
   */
  const runCompletion = useCallback(
    (
      { input, result }: AIActionToolbar,
      body: Record<string, string>,
    ) => {
      const run = (fn: () => void) =>
        result === "append"
          ? editor.update(fn)
          : editor.getEditorState().read(fn);
      run(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const textContent = input === "selection"
          ? selection.getTextContent()
          : $precedingText(selection);
        if (result === "append" && !selection.isCollapsed()) {
          (selection.isBackward() ? selection.anchor : selection.focus)
            .getNode().selectEnd();
        }
        const { provider, model } = llmConfig;
        complete(textContent, { body: { ...body, provider, model } });
      });
    },
    [editor, complete, llmConfig],
  );

  /*
   * The `handleClose()` these three used to open with is gone: they are all
   * reached from a `Menu.Item`, which closes the menu on click, and the
   * selection restore that was the other half of it now runs from
   * `handleOpenChange` on *every* close. The restore is still scheduled in a
   * timeout, so the completion below it reads the live selection first — the
   * ordering the old code depended on, unchanged.
   */
  const handleAction = (action: SelectionAIAction) => {
    runCompletion(action.toolbar, { action: action.id });
  };

  // The free-text field, not a registry action: the instruction is typed, so
  // the id it sends is `custom` and the request carries the words with it. It
  // reads the run-up rather than the selection, and still replaces.
  const handleSubmit = () => {
    const command = promptRef.current?.value;
    if (!command) return;
    handleClose();
    runCompletion({ input: "precedingText", result: "replace" }, {
      action: "custom",
      command,
    });
  };

  const handleChangeTone = (tone: string) => {
    runCompletion({ input: "selection", result: "replace" }, {
      action: "tone",
      tone,
    });
  };

  const handleOCR = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { ocr: { open: true } });
  };

  const convertMarkdownToJSON = useCallback((markdown: string) => {
    const transformers = createTransformers(editor);
    const nodes = Array.from(editor._nodes.values()).map((registry) =>
      registry.klass
    );
    const config = { nodes };
    const headlessEditor = createHeadlessEditor(config);
    headlessEditor.update(() => {
      $convertFromMarkdownString(markdown, transformers);
    }, { discrete: true });
    return headlessEditor.getEditorState().toJSON();
  }, [editor]);

  const updateDocument = useMemo(
    () =>
      throttle(() => {
        editor.dispatchCommand(UPDATE_DOCUMENT_COMMAND, undefined);
      }, 1000),
    [editor],
  );

  useEffect(() => {
    if (completion.length === 0) return;
    if (!isLoading) {
      offsetRef.current = 0;
      return;
    }
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const offset = offsetRef.current;
      if (offset) $addUpdateTag("history-merge");
      if (offset) {
        selection.anchor.getNode().getTopLevelElement()
          ?.getPreviousSibling()?.remove();
      }

      const isAtNewline = selection.anchor.offset === 0 &&
        selection.focus.offset === 0;
      if (!offset && !isAtNewline) selection.insertParagraph();

      const serializedEditorState = convertMarkdownToJSON(completion);
      const serializedChildren = serializedEditorState.root.children;
      const serializedNodes = serializedChildren.slice(
        offsetRef.current - 1,
      );
      serializedNodes.push(serializedParagraph);
      if (serializedNodes.length === 0) return;
      offsetRef.current = serializedChildren.length;

      const nodes = $generateNodesFromSerializedNodes(serializedNodes);
      selection.insertNodes(nodes);
      const lastChild = nodes[nodes.length - 1];
      lastChild.selectStart();
    }, { onUpdate: updateDocument });
  }, [completion, isLoading, convertMarkdownToJSON, editor, updateDocument]);

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if (isLoading) return false;
          const selection = $getSelection();
          setIsCollapsed(selection?.isCollapsed() ?? true);
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        CLICK_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          if (isLoading) stop();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, isLoading, stop]);

  const currentModel = getModelById(llmConfig.model);

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "google":
        return (
          <Image
            src="/icons/google.svg"
            alt="Google"
            width={18}
            height={18}
          />
        );
      case "anthropic":
        return (
          <Image
            src="/icons/anthropic.svg"
            alt="Anthropic"
            width={18}
            height={18}
          />
        );
      case "azure":
        return (
          <Image
            src="/icons/azure.svg"
            alt="Azure"
            width={18}
            height={18}
          />
        );
      case "ollama":
        return <Monitor size={ICON_SIZE.dense} />;
      default:
        return <Sparkles size={ICON_SIZE.dense} />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label="AI"
        className={triggerClass}
        disabled={isLoading}
      >
        <Sparkles size={ICON_SIZE.inline} />
        AI
        {isLoading
          ? <Spinner size="sm" />
          : <ChevronDown size={ICON_SIZE.inline} />}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        aria-label="Formatting options for ai"
        side="bottom"
      >
        {/*
          The model picker was a second `<Menu>` anchored by hand to this row.
          It is a real submenu now — see `DropdownMenuSub` for why an unrelated
          popup cannot be opened from inside a menu.
        */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={css.modelRow}>
            <span className={css.modelName}>
              {currentModel && getProviderIcon(currentModel.provider)}
              {currentModel?.name || "Model"}
            </span>
            <span className={css.modelChange}>Change</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuContent align="start" side="right">
            {AI_MODELS.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => handleModelSelect(model.id)}
              >
                {getProviderIcon(model.provider)}
                {model.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenuSub>

        {/*
          Not a `Menu.Item`: Base UI moves DOM focus between items, and a field
          that joins that list is one the keyboard cannot type into. Same
          reasoning as the font-size stepper in `Menus/menus.css.ts`.
        */}
        <div className={css.promptRow}>
          <AutoResizeTextArea
            aria-label="What to do?"
            autoComplete="off"
            className={css.promptInput}
            disabled={isLoading}
            placeholder="What to do?"
            ref={promptRef}
            spellCheck="false"
            onKeyDown={handlePrompt}
          />
          <button
            aria-label="Send"
            className={sendButtonClass}
            disabled={isLoading}
            type="button"
            onClick={handleSubmit}
          >
            <Send size={ICON_SIZE.dense} />
          </button>
        </div>

        {
          /* One item per selection-scoped action, from the shared registry.
            An action that reads the preceding prose rather than the selection
            still runs on a bare caret, so only the selection-reading ones are
            disabled when nothing is selected. */
        }
        {AI_TOOLBAR_ACTIONS.map((action) => {
          const Icon = AI_ACTION_ICON[action.id];
          return (
            <DropdownMenuItem
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={isLoading ||
                (action.toolbar.input === "selection" && isCollapsed)}
            >
              <Icon size={ICON_SIZE.default} />
              {action.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isLoading || isCollapsed}>
            <Mic size={ICON_SIZE.dense} />
            Change Tone
          </DropdownMenuSubTrigger>
          <DropdownMenuContent align="start" side="right">
            {AI_TONES.map((tone) => (
              <DropdownMenuItem
                key={tone}
                onClick={() => handleChangeTone(tone)}
              >
                {tone}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          disabled={isLoading || !isCollapsed}
          onClick={handleOCR}
        >
          <ScanSearch size={ICON_SIZE.dense} />
          Image to Text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
