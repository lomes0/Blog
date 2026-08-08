"use client";
import {
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  NodeKey,
} from "lexical";
import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import { $isAttachmentNode } from ".";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Code,
  Copy,
  Download,
  ExternalLink,
  File,
  FileText,
  Pencil,
  Trash2,
} from "lucide-react";
import { downloadFile } from "@/utils/downloadFile";
import { formatSize } from "@/utils/formatSize";
import { isTextFile } from "@/utils/languageDetection";
import AttachmentPreview from "./AttachmentPreview";
import { actions, useDispatch } from "@/store";
import { ICON_SIZE } from "@/theme/icons";
import { ActionButton, Spinner } from "../../ui";
import * as css from "./styles.css";

function getFileIcon(mimetype: string) {
  if (mimetype.startsWith("application/pdf")) return <FileText />;
  if (
    mimetype.includes("zip") || mimetype.includes("tar") ||
    mimetype.includes("rar")
  ) {
    return <Archive />;
  }
  if (mimetype.startsWith("text/") || mimetype.includes("script")) {
    return <Code />;
  }
  if (mimetype.includes("document") || mimetype.includes("word")) {
    return <FileText />;
  }
  return <File />;
}

function getFileType(mimetype: string, filename: string): string {
  // Get extension from filename
  const ext = filename.split(".").pop()?.toUpperCase();

  if (mimetype.startsWith("application/pdf")) return "PDF";
  if (mimetype.includes("zip")) return "ZIP";
  if (mimetype.includes("tar")) return "TAR";
  if (mimetype.includes("shell") || ext === "SH") return "Shell Script";
  if (mimetype.includes("javascript") || ext === "JS") return "JavaScript";
  if (mimetype.includes("typescript") || ext === "TS") return "TypeScript";
  if (mimetype.includes("python") || ext === "PY") return "Python";
  if (ext) return ext;

  return "File";
}

export default function AttachmentComponent({
  url,
  filename,
  mimetype,
  size,
  nodeKey,
  expanded,
  editing,
}: {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  nodeKey: NodeKey;
  expanded: boolean;
  editing: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const dispatch = useDispatch();
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(
    nodeKey,
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isAttachmentNode(node)) {
          node.remove();
        }
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  // KEY_ENTER_COMMAND's payload is `KeyboardEvent | null` — Lexical dispatches
  // it with null from programmatic paths — and the command payload type became
  // invariant in 0.49, so the handler must accept the null.
  const $onEnter = useCallback(
    (event: KeyboardEvent | null) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event?.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if ($isAttachmentNode(node)) {
          node.toggleExpanded();
        }
        return true;
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const onClick = useCallback(
    (event: MouseEvent) => {
      // Don't select if clicking on download button
      if ((event.target as HTMLElement).closest("a")) {
        return false;
      }
      return false;
    },
    [],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $onEnter,
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [
    clearSelection,
    editor,
    isSelected,
    nodeKey,
    $onDelete,
    $onEnter,
    onClick,
  ]);

  const handleDelete = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAttachmentNode(node)) {
        node.remove();
      }
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDownloading(true);

    try {
      await downloadFile(url, filename);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAttachmentNode(node)) {
        node.toggleExpanded();
      }
    });
  }, [editor, nodeKey]);

  const handleOpenInSidebar = useCallback(() => {
    dispatch(actions.openAttachmentPreview({
      nodeKey,
      url,
      filename,
      mimetype,
    }));
  }, [dispatch, nodeKey, url, filename, mimetype]);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${url}/content`);
      if (response.ok) {
        const data = await response.json();
        await navigator.clipboard.writeText(data.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error("Copy error:", error);
    }
  }, [url]);

  const handleEdit = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if ($isAttachmentNode(node)) {
        node.setEditing(true);
        node.setExpanded(true);
      }
    });
  }, [editor, nodeKey]);

  return (
    <div className={css.root}>
      {/*
        The selected and expanded fills used to be read off the MUI theme here.
        Two of them were bugs the tokens cannot reproduce: `grey.*` is spread
        outside MUI's light/dark blocks, so `grey.50` is `#fafafa` in dark too,
        and `primary.50`/`.100` resolve to nothing at all because
        `augmentColor` only emits main/light/dark/contrastText. What replaces
        them is the fill ladder and two mixes of `accent` — see
        `styles.css.ts`.
      */}
      <div
        className={css.chip}
        data-selected={isSelected}
        data-expanded={expanded}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) {
            return;
          }
          if (!isSelected) {
            setSelected(true);
          }
        }}
      >
        {/* File Icon */}
        <span className={css.fileIcon}>{getFileIcon(mimetype)}</span>

        {/* File Info */}
        <div className={css.fileInfo}>
          <p className={css.filename}>{filename}</p>
          <span className={css.meta}>
            {getFileType(mimetype, filename)} • {formatSize(size)}
          </span>
        </div>

        {/* Actions */}
        <div className={css.actions} data-selected={isSelected}>
          {isTextFile(mimetype, filename) && (
            <ActionButton
              icon
              size="md"
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy to clipboard"}
              aria-label="Copy to clipboard"
            >
              <Copy size={ICON_SIZE.dense} />
            </ActionButton>
          )}
          <ActionButton
            icon
            size="md"
            onClick={handleDownload}
            title="Download file"
            aria-label="Download file"
            disabled={isDownloading}
          >
            {isDownloading
              ? <Spinner size="sm" />
              : <Download size={ICON_SIZE.dense} />}
          </ActionButton>
          <ActionButton
            icon
            size="md"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenInSidebar();
            }}
            title="Open in sidebar"
            aria-label="Open in sidebar"
          >
            <ExternalLink size={ICON_SIZE.dense} />
          </ActionButton>
          {!editing && isTextFile(mimetype, filename) && (
            <ActionButton
              icon
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit();
              }}
              title="Edit file"
              aria-label="Edit file"
            >
              <Pencil size={ICON_SIZE.dense} />
            </ActionButton>
          )}
          {isSelected && (
            <ActionButton
              danger
              icon
              size="md"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              title="Delete attachment"
              aria-label="Delete attachment"
            >
              <Trash2 size={ICON_SIZE.dense} />
            </ActionButton>
          )}
          <ActionButton
            icon
            size="md"
            onClick={handleToggleExpand}
            title={expanded ? "Collapse preview" : "Expand preview"}
            aria-label={expanded ? "Collapse preview" : "Expand preview"}
          >
            {expanded
              ? <ChevronUp size={ICON_SIZE.dense} />
              : <ChevronDown size={ICON_SIZE.dense} />}
          </ActionButton>
        </div>
      </div>

      {/* Preview section */}
      {(expanded || editing) && (
        <div>
          <AttachmentPreview
            url={url}
            filename={filename}
            mimetype={mimetype}
            size={size}
            expanded={expanded}
            editing={editing}
            nodeKey={nodeKey}
            onOpenInSidebar={handleOpenInSidebar}
          />
        </div>
      )}
    </div>
  );
}
