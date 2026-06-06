"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Collapse,
  IconButton,
  Skeleton,
  Typography,
} from "@mui/material";
import { ExternalLink, RefreshCw } from "lucide-react";
import { NodeKey } from "lexical";
import { detectLanguage } from "@/utils/languageDetection";
import { AttachmentContentCache, attachmentContentDB } from "@/indexeddb";
import { RootState, useSelector } from "@/store";
import Prism from "prismjs";

// Import common Prism languages
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";

interface AttachmentPreviewProps {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  expanded: boolean;
  editing: boolean;
  nodeKey: NodeKey;
  onOpenInSidebar?: () => void;
}

interface ContentState {
  content: string | null;
  loading: boolean;
  error: string | null;
}

// Size thresholds
const TRUNCATE_MAX_SIZE = 1024 * 1024; // 1MB - truncated or sidebar only
const MAX_INLINE_LINES = 100;

// MIME types that can be previewed
const TEXT_PREVIEWABLE = new Set([
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/markdown",
  "text/xml",
  "text/javascript",
  "text/x-python",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/x-sh",
  "application/yaml",
]);

// File extensions that can be previewed
const PREVIEWABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

function isPreviewable(mimetype: string, filename: string): boolean {
  if (TEXT_PREVIEWABLE.has(mimetype) || mimetype.startsWith("text/")) {
    return true;
  }
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return PREVIEWABLE_EXTENSIONS.has(ext);
}

function extractFilename(url: string): string {
  // Extract filename from URL like /api/attachments/filename
  const parts = url.split("/");
  return parts[parts.length - 1];
}

export default function AttachmentPreview({
  url,
  filename,
  mimetype,
  size,
  expanded,
  editing,
  nodeKey: _nodeKey,
  onOpenInSidebar,
}: AttachmentPreviewProps) {
  const [contentState, setContentState] = useState<ContentState>({
    content: null,
    loading: false,
    error: null,
  });
  const [highlightedContent, setHighlightedContent] = useState<string | null>(
    null,
  );
  // Listen for attachment modifications from the drawer
  const attachmentModified = useSelector((state: RootState) =>
    state.ui.attachmentModified
  );

  const canPreview = isPreviewable(mimetype, filename);
  const isTooLarge = size > TRUNCATE_MAX_SIZE;
  const language = detectLanguage(filename, mimetype);

  // Cache key based on URL
  const cacheKey = extractFilename(url);

  const fetchContent = useCallback(async (skipCache = false) => {
    if (!canPreview || isTooLarge) return;

    setContentState({ content: null, loading: true, error: null });

    try {
      // Check cache first (unless skipping)
      if (!skipCache) {
        const cached = await attachmentContentDB.getByID(cacheKey);
        if (cached) {
          setContentState({
            content: cached.content,
            loading: false,
            error: null,
          });
          return;
        }
      } else {
        // Clear cache if skipping
        await attachmentContentDB.deleteByID(cacheKey).catch(() => {});
      }

      // Fetch from API
      const response = await fetch(`${url}/content`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Failed to load content: ${response.status}`,
        );
      }

      const data = await response.json();
      const content = data.content;

      // Cache the content
      const cacheEntry: AttachmentContentCache = {
        id: cacheKey,
        url,
        content,
        mimetype: data.mimetype,
        size: data.size,
        cachedAt: Date.now(),
      };
      await attachmentContentDB.add(cacheEntry).catch(() => {
        // Ignore cache errors
      });

      setContentState({ content, loading: false, error: null });
    } catch (error) {
      setContentState({
        content: null,
        loading: false,
        error: error instanceof Error
          ? error.message
          : "Failed to load content",
      });
    }
  }, [url, cacheKey, canPreview, isTooLarge]);

  // Fetch content when expanded
  useEffect(() => {
    if (
      (expanded || editing) && contentState.content === null &&
      !contentState.loading &&
      !contentState.error
    ) {
      fetchContent();
    }
  }, [expanded, editing, contentState, fetchContent]);

  // Refresh content when attachment is modified in the drawer
  useEffect(() => {
    if (attachmentModified && attachmentModified.url === url && expanded) {
      // Refetch with cache skip to get fresh content
      fetchContent(true);
    }
  }, [attachmentModified, url, expanded, fetchContent]);

  // Syntax highlighting
  useEffect(() => {
    if (contentState.content && language !== "text") {
      try {
        const grammar = Prism.languages[language];
        if (grammar) {
          const highlighted = Prism.highlight(
            contentState.content,
            grammar,
            language,
          );
          setHighlightedContent(highlighted);
        } else {
          setHighlightedContent(null);
        }
      } catch {
        setHighlightedContent(null);
      }
    } else {
      setHighlightedContent(null);
    }
  }, [contentState.content, language]);

  const handleRefresh = useCallback(async () => {
    // Clear cache and refetch
    await attachmentContentDB.deleteByID(cacheKey).catch(() => {});
    fetchContent();
  }, [cacheKey, fetchContent]);

  // Truncate content if too long
  const displayContent = contentState.content
    ? contentState.content.split("\n").slice(0, MAX_INLINE_LINES).join("\n")
    : null;
  const isTruncated = contentState.content
    ? contentState.content.split("\n").length > MAX_INLINE_LINES
    : false;

  // Non-previewable files
  if (!canPreview) {
    return null;
  }

  // Too large for inline preview
  if (isTooLarge) {
    return (
      <Box sx={{ mt: 1, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
        <Typography variant="body2" color="text.secondary">
          ⚠️ File too large for inline preview ({(size / 1024 / 1024).toFixed(
            1,
          )} MB)
        </Typography>
        {onOpenInSidebar && (
          <IconButton
            size="small"
            onClick={onOpenInSidebar}
            title="Open in sidebar"
          >
            <ExternalLink size={18} />
          </IconButton>
        )}
      </Box>
    );
  }

  return (
    <Collapse in={expanded} timeout="auto" unmountOnExit>
      <Box
        sx={{
          border: 1,
          borderColor: "grey.200",
          borderRadius: "0 0 8px 8px",
          bgcolor: "background.paper",
          overflow: "hidden",
        }}
      >
        {/* Content preview */}
        <Box>
          {/* Loading state */}
          {contentState.loading && (
            <Box sx={{ p: 2 }}>
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="80%" />
              <Skeleton variant="text" width="90%" />
            </Box>
          )}

          {/* Error state */}
          {contentState.error && (
            <Alert
              severity="error"
              sx={{ mb: 1 }}
              action={
                <IconButton size="small" onClick={handleRefresh}>
                  <RefreshCw size={18} />
                </IconButton>
              }
            >
              {contentState.error}
            </Alert>
          )}

          {/* Content */}
          {displayContent && (
            <Box sx={{ position: "relative" }}>
              {/* Code block */}
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  pt: 4,
                  bgcolor: "grey.100",
                  borderRadius: 1,
                  overflow: "auto",
                  maxHeight: 400,
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                  lineHeight: 1.5,
                }}
              >
                {highlightedContent
                  ? (
                    <code
                      className={`language-${language}`}
                      dangerouslySetInnerHTML={{ __html: highlightedContent }}
                    />
                  )
                  : <code>{displayContent}</code>}
              </Box>

              {/* Truncation notice */}
              {isTruncated && (
                <Box
                  sx={{
                    p: 1,
                    bgcolor: "warning.light",
                    color: "warning.contrastText",
                    borderBottomLeftRadius: 4,
                    borderBottomRightRadius: 4,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="caption">
                    Showing first {MAX_INLINE_LINES} lines.{" "}
                    {onOpenInSidebar && (
                      <Box
                        component="span"
                        sx={{ cursor: "pointer", textDecoration: "underline" }}
                        onClick={onOpenInSidebar}
                      >
                        Open in sidebar
                      </Box>
                    )} to see full content.
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Collapse>
  );
}
