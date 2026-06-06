"use client";
import { Alert, Box, CircularProgress, IconButton } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { RefreshCw } from "lucide-react";
import AttachmentEditor from "@/editor/nodes/AttachmentNode/AttachmentEditor";

interface AttachmentContentViewerProps {
  loading: boolean;
  error: string | null;
  content: string | null;
  highlightedContent: string | null;
  language: string;
  isEditing: boolean;
  filename: string | undefined;
  mimetype: string | undefined;
  url: string | undefined;
  onSave: (newContent: string) => Promise<void>;
  onCancel: () => void;
  onRefresh: () => void;
}

// Syntax token palette mirrors the editor's --tok-* scheme (see
// src/editor/theme.css) so attachment previews match in-editor code blocks
// and stay readable in dark mode.
const codeBoxSx: SxProps<Theme> = (theme) => ({
  m: 0,
  p: 2,
  bgcolor: "background.paper",
  minHeight: "100%",
  fontSize: "0.85rem",
  fontFamily: "monospace",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  "& .token.comment, & .token.prolog, & .token.doctype, & .token.cdata": {
    color: "#98a0ab",
  },
  "& .token.punctuation": { color: "#6b7280" },
  "& .token.property, & .token.tag, & .token.boolean, & .token.number, & .token.constant, & .token.symbol, & .token.deleted":
    { color: "#9a6700" },
  "& .token.selector, & .token.attr-name, & .token.string, & .token.char, & .token.builtin, & .token.inserted":
    { color: "#2c7a4d" },
  "& .token.operator, & .token.entity, & .token.url": { color: "#2c333d" },
  "& .token.atrule, & .token.attr-value, & .token.keyword": {
    color: "#c0392b",
  },
  "& .token.function, & .token.class-name": { color: "#2d6be6" },
  "& .token.regex, & .token.important, & .token.variable": { color: "#7a4bc2" },
  ...theme.applyStyles("dark", {
    "& .token.comment, & .token.prolog, & .token.doctype, & .token.cdata": {
      color: "#5d6875",
    },
    "& .token.punctuation": { color: "#8b96a4" },
    "& .token.property, & .token.tag, & .token.boolean, & .token.number, & .token.constant, & .token.symbol, & .token.deleted":
      { color: "#e2b878" },
    "& .token.selector, & .token.attr-name, & .token.string, & .token.char, & .token.builtin, & .token.inserted":
      { color: "#93cf8a" },
    "& .token.operator, & .token.entity, & .token.url": { color: "#c3ccd8" },
    "& .token.atrule, & .token.attr-value, & .token.keyword": {
      color: "#e58373",
    },
    "& .token.function, & .token.class-name": { color: "#82b4f2" },
    "& .token.regex, & .token.important, & .token.variable": {
      color: "#c6a2e8",
    },
  }),
});

export default function AttachmentContentViewer({
  loading,
  error,
  content,
  highlightedContent,
  language,
  isEditing,
  filename,
  mimetype,
  url,
  onSave,
  onCancel,
  onRefresh,
}: AttachmentContentViewerProps) {
  return (
    <Box sx={{ flex: 1, overflow: "auto", p: 0 }}>
      {loading && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            p: 4,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="error"
            action={
              <IconButton size="small" onClick={onRefresh}>
                <RefreshCw size={18} />
              </IconButton>
            }
          >
            {error}
          </Alert>
        </Box>
      )}

      {isEditing && content !== null && filename && mimetype && (
        <AttachmentEditor
          initialContent={content}
          filename={filename}
          mimetype={mimetype}
          language={language}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}

      {!isEditing && content && (
        <Box component="pre" sx={codeBoxSx}>
          {highlightedContent
            ? (
              <code
                className={`language-${language}`}
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
            )
            : <code>{content}</code>}
        </Box>
      )}

      {!isEditing && mimetype === "application/pdf" && url && (
        <iframe
          src={url}
          style={{ width: "100%", height: "100%", border: "none" }}
          title={filename || "PDF Preview"}
        />
      )}
    </Box>
  );
}
