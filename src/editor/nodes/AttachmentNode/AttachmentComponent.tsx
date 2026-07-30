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
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
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
import AttachmentPreview from "./AttachmentPreview";
import { actions, useDispatch } from "@/store";
import { ICON_SIZE } from "@/theme/icons";

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

function isTextFile(mimetype: string, filename: string): boolean {
  if (mimetype.startsWith("text/")) return true;
  if (
    mimetype.includes("json") || mimetype.includes("javascript") ||
    mimetype.includes("typescript") || mimetype.includes("xml")
  ) {
    return true;
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const textExtensions = new Set([
    "txt",
    "md",
    "markdown",
    "js",
    "jsx",
    "ts",
    "tsx",
    "json",
    "html",
    "css",
    "scss",
    "py",
    "sh",
    "bash",
    "yaml",
    "yml",
  ]);
  return textExtensions.has(ext);
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

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
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
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "40%",
        minWidth: 400,
        my: 0.5,
        userSelect: "none",
      }}
    >
      <Box
        // `grey.*` is spread once at the top of MUI's createPalette, outside
        // the light/dark blocks, so grey.50 is #fafafa in both schemes — this
        // chip rendered near-white on the dark canvas. `primary.50`/`.100` are
        // worse than wrong: augmentColor only emits main/light/dark/
        // contrastText, so `--mui-palette-primary-50` never exists and the
        // selected fill silently dropped in *both* schemes. The action.* tints
        // and alpha() below are scheme-aware and always defined.
        sx={(theme) => ({
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: isSelected
            ? alpha(theme.palette.primary.main, 0.12)
            : theme.palette.action.hover,
          border: 1,
          borderColor: isSelected ? "primary.main" : "divider",
          borderBottom: expanded ? 0 : 1,
          borderRadius: expanded ? "8px 8px 0 0" : 2,
          cursor: "pointer",
          transition: "all 0.15s ease",
          "&:hover": {
            bgcolor: isSelected
              ? alpha(theme.palette.primary.main, 0.2)
              : theme.palette.action.selected,
            borderColor: isSelected ? "primary.main" : "text.disabled",
            "& .attachment-actions": {
              opacity: 1,
            },
          },
        })}
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
        <Box
          sx={{
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            fontSize: 20,
          }}
        >
          {getFileIcon(mimetype)}
        </Box>

        {/* File Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            noWrap
            sx={{
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            {filename}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              lineHeight: 1.2,
            }}
          >
            {getFileType(mimetype, filename)} • {formatSize(size)}
          </Typography>
        </Box>

        {/* Actions */}
        <Box
          className="attachment-actions"
          sx={{
            display: "flex",
            gap: 0.25,
            opacity: isSelected ? 1 : 0.3,
            transition: "opacity 0.15s ease",
          }}
        >
          {isTextFile(mimetype, filename) && (
            <IconButton
              size="small"
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy to clipboard"}
              sx={{ p: 0.5 }}
            >
              <Copy size={ICON_SIZE.dense} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={handleDownload}
            title="Download file"
            disabled={isDownloading}
            sx={{ p: 0.5 }}
          >
            {isDownloading
              ? <CircularProgress size={16} />
              : <Download size={ICON_SIZE.dense} />}
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenInSidebar();
            }}
            title="Open in sidebar"
            sx={{ p: 0.5 }}
          >
            <ExternalLink size={ICON_SIZE.dense} />
          </IconButton>
          {!editing && isTextFile(mimetype, filename) && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit();
              }}
              title="Edit file"
              sx={{
                p: 0.5,
                opacity: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Pencil size={ICON_SIZE.dense} />
            </IconButton>
          )}
          {isSelected && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              color="error"
              title="Delete attachment"
              sx={{ p: 0.5 }}
            >
              <Trash2 size={ICON_SIZE.dense} />
            </IconButton>
          )}
          <IconButton
            size="small"
            onClick={handleToggleExpand}
            title={expanded ? "Collapse preview" : "Expand preview"}
            sx={{ p: 0.5 }}
          >
            {expanded
              ? <ChevronUp size={ICON_SIZE.dense} />
              : <ChevronDown size={ICON_SIZE.dense} />}
          </IconButton>
        </Box>
      </Box>

      {/* Preview section */}
      {(expanded || editing) && (
        <Box>
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
        </Box>
      )}
    </Box>
  );
}
