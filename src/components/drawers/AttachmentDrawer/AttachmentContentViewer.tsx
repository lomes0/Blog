"use client";
import { Alert, Box, CircularProgress, IconButton } from "@mui/material";
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

const codeBoxSx = {
  m: 0,
  p: 2,
  bgcolor: "grey.50",
  minHeight: "100%",
  fontSize: "0.85rem",
  fontFamily: "monospace",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  "& .token.comment, & .token.prolog, & .token.doctype, & .token.cdata": {
    color: "#6a737d",
  },
  "& .token.punctuation": { color: "#24292e" },
  "& .token.property, & .token.tag, & .token.boolean, & .token.number, & .token.constant, & .token.symbol, & .token.deleted":
    { color: "#005cc5" },
  "& .token.selector, & .token.attr-name, & .token.string, & .token.char, & .token.builtin, & .token.inserted":
    { color: "#22863a" },
  "& .token.operator, & .token.entity, & .token.url": { color: "#d73a49" },
  "& .token.atrule, & .token.attr-value, & .token.keyword": {
    color: "#d73a49",
  },
  "& .token.function, & .token.class-name": { color: "#6f42c1" },
  "& .token.regex, & .token.important, & .token.variable": { color: "#e36209" },
} as const;

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
