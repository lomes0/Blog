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
  SELECTION_CHANGE_COMMAND,
  SerializedParagraphNode,
} from "lexical";
import { mergeRegister } from "@lexical/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useMenuState } from "@/hooks/useMenuState";
import {
  Button,
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Mic,
  Minimize2,
  Monitor,
  Play,
  RefreshCcw,
  ScanSearch,
  Send,
  Sparkles,
} from "lucide-react";
import { SxProps, Theme } from "@mui/material/styles";
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
import { AI_MODELS, getModelById } from "@/lib/ai";
import useLocalStorage from "@/hooks/useLocalStorage";

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

export default function AITools(
  { editor, sx: _sx }: { editor: LexicalEditor; sx?: SxProps<Theme> },
) {
  const [llmConfig, setLlmConfig] = useLocalStorage("llm", {
    provider: "google",
    model: "gemini-2.5-flash",
  });

  const { anchorEl, menuOpen: open, openMenu, closeMenu } = useMenuState();
  const {
    anchorEl: modelMenuAnchor,
    menuOpen: modelMenuOpen,
    openMenu: handleModelMenuClick,
    closeMenu: handleModelMenuClose,
  } = useMenuState();
  const {
    anchorEl: toneMenuAnchor,
    menuOpen: toneMenuOpen,
    openMenu: handleToneMenuOpen,
    closeMenu: handleToneMenuClose,
  } = useMenuState();

  const TONES = [
    "Professional",
    "Casual",
    "Friendly",
    "Academic",
    "Persuasive",
    "Direct",
  ];

  const handleModelSelect = (modelId: string) => {
    const model = getModelById(modelId);
    if (model) {
      setLlmConfig({ provider: model.provider, model: model.id });
    }
    handleModelMenuClose();
  };

  const handleClose = useCallback(() => {
    closeMenu();
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
  }, [editor, closeMenu]);

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
    const textarea = e.currentTarget;
    const isNavigatingUp = textarea.selectionStart === 0 &&
      e.key === "ArrowUp";
    const isNavigatingDown =
      textarea.selectionStart === textarea.value.length &&
      e.key === "ArrowDown";
    if (!isNavigatingUp && !isNavigatingDown) e.stopPropagation();
    if (isNavigatingDown) textarea.closest("li")?.focus();
    const command = textarea.value;
    const isSubmit = e.key === "Enter" && !e.shiftKey &&
      command.trim().length > 0;
    if (!isSubmit) return;
    e.preventDefault();
    handleSubmit();
  };

  const handleSubmit = () => {
    const command = promptRef.current?.value;
    if (!command) return;
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchorNode = selection.anchor.getNode();
      let currentNode: LexicalNode | null | undefined = anchorNode;
      let textContent = "";
      while (currentNode && textContent.length < 1024) {
        textContent = currentNode.getTextContent() + "\n\n" +
          textContent;
        currentNode = currentNode.getPreviousSibling() ||
          currentNode.getParent()?.getPreviousSibling();
      }
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "zap", command, provider, model },
      });
    });
  };

  const handleRewrite = () => {
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "improve", provider, model },
      });
    });
  };

  const handleShorter = () => {
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "shorter", provider, model },
      });
    });
  };

  const handleLonger = () => {
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "longer", provider, model },
      });
    });
  };

  const handleContinue = () => {
    handleClose();
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchorNode = selection.anchor.getNode();
      let currentNode: LexicalNode | null | undefined = anchorNode;
      let textContent = "";
      while (currentNode && textContent.length < 1024) {
        textContent = currentNode.getTextContent() + "\n\n" +
          textContent;
        currentNode = currentNode.getPreviousSibling() ||
          currentNode.getParent()?.getPreviousSibling();
      }
      const isCollapsed = selection.isCollapsed();
      if (!isCollapsed) {
        (selection.isBackward() ? selection.anchor : selection.focus)
          .getNode().selectEnd();
      }
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "continue", provider, model },
      });
    });
  };

  const handleOCR = () => {
    handleClose();
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { ocr: { open: true } });
  };

  const handleSummarize = () => {
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, { body: { option: "summarize", provider, model } });
    });
  };

  const handleChangeTone = (tone: string) => {
    handleToneMenuClose();
    handleClose();
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const textContent = selection.getTextContent();
      const { provider, model } = llmConfig;
      complete(textContent, {
        body: { option: "tone", tone, provider, model },
      });
    });
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
        return <Monitor size={18} />;
      default:
        return <Sparkles size={18} />;
    }
  };

  return (
    <>
      <Button
        id="ai-tools-button"
        aria-controls={open ? "ai-tools-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={open ? "true" : undefined}
        variant="outlined"
        onClick={openMenu}
        startIcon={
          <Sparkles
            style={{
              color: isLoading
                ? "var(--mui-palette-action-disabled)"
                : "var(--mui-palette-action-active)",
            }}
          />
        }
        endIcon={isLoading
          ? <CircularProgress size={16} color="inherit" />
          : open
          ? (
            <ChevronUp
              style={{
                color: isLoading
                  ? "var(--mui-palette-action-disabled)"
                  : "var(--mui-palette-action-active)",
              }}
            />
          )
          : (
            <ChevronDown
              style={{
                color: isLoading
                  ? "var(--mui-palette-action-disabled)"
                  : "var(--mui-palette-action-active)",
              }}
            />
          )}
        sx={{
          color: "text.primary",
          borderColor: "divider",
          p: 1,
          minWidth: 0,
          height: 36,
          "& .MuiButton-startIcon": { mr: { xs: 0, sm: 1 }, ml: 0 },
          "& .MuiButton-endIcon": { mr: 0, ml: isLoading ? 1 : 0 },
          "& .MuiButton-endIcon > svg": { fontSize: 20 },
        }}
        disabled={isLoading}
      >
        <Typography
          variant="button"
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          AI
        </Typography>
      </Button>
      <Button
        id="ai-model-button"
        aria-controls={modelMenuOpen ? "ai-model-menu" : undefined}
        aria-haspopup="true"
        aria-expanded={modelMenuOpen ? "true" : undefined}
        variant="outlined"
        onClick={handleModelMenuClick}
        endIcon={<ChevronDown size={18} />}
        sx={{
          color: "text.secondary",
          borderColor: "divider",
          p: 1,
          minWidth: 140,
          height: 36,
          ml: 0.5,
          textTransform: "none",
        }}
        disabled={isLoading}
      >
        <Typography variant="caption" sx={{ fontSize: "0.75rem" }}>
          {currentModel?.name || "Unknown"}
        </Typography>
      </Button>
      <Menu
        id="ai-tools-menu"
        aria-label="Formatting options for ai"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        sx={{
          "& .MuiList-root": { pt: 0 },
          "& .MuiBackdrop-root": { userSelect: "none" },
          "& .MuiMenuItem-root": { minHeight: 36 },
        }}
      >
        <MenuItem
          sx={{
            p: 0,
            mb: 1,
            flexDirection: "column",
            backgroundColor: "transparent !important",
          }}
          disableRipple
          disableTouchRipple
          onFocusVisible={(e) => {
            const currentTarget = e.currentTarget;
            const relatedTarget = e.relatedTarget;
            setTimeout(() => {
              const promptInput = promptRef.current;
              const isPromptFocused = document.activeElement === promptInput;
              if (isPromptFocused) return;
              if (relatedTarget !== promptInput) {
                promptInput?.focus();
              } else currentTarget.nextElementSibling?.focus();
            }, 0);
          }}
          disabled={isLoading}
        >
          <TextField
            multiline
            hiddenLabel
            variant="filled"
            size="small"
            placeholder="What to do?"
            inputRef={promptRef}
            autoComplete="off"
            spellCheck="false"
            sx={{
              flexGrow: 1,
              width: 256,
              "& .MuiInputBase-root": {
                paddingRight: 9,
                flexGrow: 1,
              },
            }}
            slotProps={{
              htmlInput: {
                onKeyDown: handlePrompt,
              },
            }}
          />
          <ListItemIcon
            sx={{ position: "absolute", right: 4, bottom: 6 }}
          >
            <IconButton
              onClick={handleSubmit}
              disabled={isLoading}
              size="small"
            >
              <Send />
            </IconButton>
          </ListItemIcon>
        </MenuItem>
        <MenuItem disabled={isLoading} onClick={handleContinue}>
          <ListItemIcon>
            <Play />
          </ListItemIcon>
          <ListItemText>Continue Writing</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isLoading || isCollapsed}
          onClick={handleRewrite}
        >
          <ListItemIcon>
            <RefreshCcw />
          </ListItemIcon>
          <ListItemText>Rewrite</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isLoading || isCollapsed}
          onClick={handleShorter}
        >
          <ListItemIcon>
            <ChevronsDownUp />
          </ListItemIcon>
          <ListItemText>Shorter</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isLoading || isCollapsed}
          onClick={handleLonger}
        >
          <ListItemIcon>
            <ChevronsUpDown />
          </ListItemIcon>
          <ListItemText>Longer</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isLoading || isCollapsed}
          onClick={handleSummarize}
        >
          <ListItemIcon>
            <Minimize2 />
          </ListItemIcon>
          <ListItemText>Summarize</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={isLoading || isCollapsed}
          onClick={handleToneMenuOpen}
        >
          <ListItemIcon>
            <Mic />
          </ListItemIcon>
          <ListItemText>Change Tone</ListItemText>
          <ChevronRight size={18} style={{ marginLeft: "auto" }} />
        </MenuItem>
        <MenuItem
          disabled={isLoading || !isCollapsed}
          onClick={handleOCR}
        >
          <ListItemIcon>
            <ScanSearch />
          </ListItemIcon>
          <ListItemText>Image to Text</ListItemText>
        </MenuItem>
      </Menu>
      <Menu
        anchorEl={toneMenuAnchor}
        open={toneMenuOpen}
        onClose={handleToneMenuClose}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {TONES.map((tone) => (
          <MenuItem
            key={tone}
            onClick={() => handleChangeTone(tone)}
          >
            <ListItemText>{tone}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
      <Menu
        id="ai-model-menu"
        anchorEl={modelMenuAnchor}
        open={modelMenuOpen}
        onClose={handleModelMenuClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        {AI_MODELS.map((model) => (
          <MenuItem
            key={model.id}
            selected={model.id === llmConfig.model}
            onClick={() => handleModelSelect(model.id)}
          >
            <ListItemIcon>
              {getProviderIcon(model.provider)}
            </ListItemIcon>
            <ListItemText>
              {model.name}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
