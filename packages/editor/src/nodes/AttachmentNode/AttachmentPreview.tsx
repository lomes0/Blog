"use client";
import { useCallback, useEffect, useState } from "react";
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
import { ICON_SIZE } from "@/theme/icons";
import { ActionButton, Alert } from "../../ui";
import * as css from "./styles.css";

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
      <div className={css.tooLarge}>
        <p className={css.tooLargeText}>
          ⚠️ File too large for inline preview ({(size / 1024 / 1024).toFixed(
            1,
          )} MB)
        </p>
        {onOpenInSidebar && (
          <ActionButton
            icon
            size="md"
            onClick={onOpenInSidebar}
            title="Open in sidebar"
            aria-label="Open in sidebar"
          >
            <ExternalLink size={ICON_SIZE.dense} />
          </ActionButton>
        )}
      </div>
    );
  }

  return (
    <div className={css.collapse} data-open={expanded}>
      <div className={css.collapseInner}>
        <div className={css.previewFrame}>
          {/* Loading state */}
          {contentState.loading && (
            <div className={css.previewPadding}>
              <div className={css.skeletonLine} style={{ width: "100%" }} />
              <div className={css.skeletonLine} style={{ width: "80%" }} />
              <div className={css.skeletonLine} style={{ width: "90%" }} />
            </div>
          )}

          {/* Error state */}
          {contentState.error && (
            <Alert
              variant="error"
              action={
                <ActionButton
                  icon
                  size="md"
                  onClick={handleRefresh}
                  title="Retry"
                  aria-label="Retry loading the preview"
                >
                  <RefreshCw size={ICON_SIZE.dense} />
                </ActionButton>
              }
            >
              {contentState.error}
            </Alert>
          )}

          {/* Content */}
          {displayContent && (
            <div className={css.codePaneWrapper}>
              {/* Code block */}
              <pre className={css.codePane}>
                {highlightedContent
                  ? (
                    <code
                      className={`language-${language}`}
                      dangerouslySetInnerHTML={{ __html: highlightedContent }}
                    />
                  )
                  : <code>{displayContent}</code>}
              </pre>

              {/* Truncation notice */}
              {isTruncated && (
                <div className={css.warningBand}>
                  Showing first {MAX_INLINE_LINES} lines.{" "}
                  {onOpenInSidebar && (
                    <span
                      className={css.inlineLink}
                      onClick={onOpenInSidebar}
                    >
                      Open in sidebar
                    </span>
                  )} to see full content.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
