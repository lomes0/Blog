"use client";
import React, { useCallback, useEffect, useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import {
  detectLanguageFromFilename,
  isTextFile,
} from "@/utils/languageDetection";
import { downloadFile } from "@/utils/downloadFile";
import { formatSize } from "@/utils/formatSize";
import { ChevronDown, ChevronUp, Download, ExternalLink } from "lucide-react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { actions, useDispatch } from "@/store";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";

interface ViewAttachmentProps {
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  initialExpanded?: boolean;
}

const MAX_PREVIEW_SIZE = 100 * 1024; // 100KB
const MAX_LINES = 100;

const ViewAttachment: React.FC<ViewAttachmentProps> = ({
  url,
  filename,
  mimetype,
  size,
  initialExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();

  const canPreview = isTextFile(mimetype) && size < 1024 * 1024; // 1MB max
  const language = detectLanguageFromFilename(filename);

  const fetchContent = useCallback(async () => {
    if (!canPreview) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${url}/content`);

      if (!response.ok) {
        if (response.status === 415) {
          setError("Preview not available for this file type");
        } else {
          setError("Failed to load preview");
        }
        return;
      }

      const data = await response.json();
      let text = data.content;

      // Truncate if needed
      if (data.size > MAX_PREVIEW_SIZE) {
        const lines = text.split("\n");
        if (lines.length > MAX_LINES) {
          text = lines.slice(0, MAX_LINES).join("\n");
          setTruncated(true);
        }
      }

      setContent(text);
    } catch (err) {
      errorAnnounce("Failed to fetch attachment content", err);
      setError("Failed to load preview");
    } finally {
      setLoading(false);
    }
  }, [url, canPreview, errorAnnounce]);

  useEffect(() => {
    if (expanded && content === null && !loading && !error) {
      fetchContent();
    }
  }, [expanded, content, loading, error, fetchContent]);

  const handleToggleExpand = () => {
    setExpanded(!expanded);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadFile(url, filename).catch((err) => {
      errorAnnounce("Download failed", err);
    });
  };

  const handleOpenInSidebar = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(
      actions.openAttachmentPreview({
        url,
        filename,
        mimetype,
        nodeKey: null,
      }),
    );
  };

  const highlightedContent = React.useMemo(() => {
    if (!content || !language) return content;

    try {
      if (Prism.languages[language]) {
        return Prism.highlight(content, Prism.languages[language], language);
      }
    } catch (err) {
      console.error("Syntax highlighting failed:", err);
    }
    return null;
  }, [content, language]);

  return (
    <div
      className="view-attachment"
      style={{
        border: "1px solid var(--mui-palette-divider)",
        borderRadius: "8px",
        margin: "8px 0",
        overflow: "hidden",
        backgroundColor: "var(--mui-palette-grey-50)",
        maxWidth: "40%",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          cursor: canPreview ? "pointer" : "default",
          backgroundColor: "var(--mui-palette-grey-100)",
          borderBottom: expanded
            ? "1px solid var(--mui-palette-divider)"
            : "none",
        }}
        onClick={canPreview ? handleToggleExpand : undefined}
      >
        <span style={{ flex: 1, fontWeight: 500 }}>{filename}</span>
        <span
          style={{
            color: "var(--mui-palette-text-secondary)",
            fontSize: "0.85em",
            marginRight: "8px",
          }}
        >
          {formatSize(size)}
        </span>
        <Tooltip title="Download">
          <IconButton size="small" onClick={handleDownload}>
            <Download size={18} />
          </IconButton>
        </Tooltip>
        {canPreview && (
          <Tooltip title="Open in sidebar">
            <IconButton size="small" onClick={handleOpenInSidebar}>
              <ExternalLink size={18} />
            </IconButton>
          </Tooltip>
        )}
        {canPreview && (
          <Tooltip title={expanded ? "Collapse" : "Expand"}>
            <IconButton size="small">
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </IconButton>
          </Tooltip>
        )}
      </div>

      {/* Content Preview */}
      {expanded && canPreview && (
        <div
          style={{
            maxHeight: "400px",
            overflow: "auto",
            backgroundColor: "var(--mui-palette-background-paper)",
          }}
        >
          {loading && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "24px",
              }}
            >
              <CircularProgress size={24} />
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "16px",
                color: "var(--mui-palette-error-main)",
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {content && !loading && !error && (
            <>
              {highlightedContent
                ? (
                  <pre
                    style={{
                      margin: 0,
                      padding: "12px",
                      fontSize: "13px",
                      lineHeight: "1.5",
                      overflow: "auto",
                      backgroundColor: "rgb(40, 42, 54)",
                      color: "rgb(248, 248, 242)",
                    }}
                  >
                  <code
                    className={`language-${language}`}
                    dangerouslySetInnerHTML={{ __html: highlightedContent }}
                  />
                  </pre>
                )
                : (
                  <pre
                    style={{
                      margin: 0,
                      padding: "12px",
                      fontSize: "13px",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                  {content}
                  </pre>
                )}

              {truncated && (
                <Alert severity="warning" sx={{ fontSize: "0.85em", py: 0.5 }}>
                  Content truncated. Download to view full file.
                </Alert>
              )}
            </>
          )}
        </div>
      )}

      {/* Message for non-previewable files */}
      {expanded && !canPreview && (
        <div
          style={{
            padding: "16px",
            textAlign: "center",
            color: "var(--mui-palette-text-secondary)",
          }}
        >
          Preview not available for this file type. Click download to view.
        </div>
      )}
    </div>
  );
};

export default ViewAttachment;
