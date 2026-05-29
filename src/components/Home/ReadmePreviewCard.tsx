"use client";
import { Box, CircularProgress, Typography } from "@mui/material";
import { FileText, Plus } from "lucide-react";
import { UserDocument } from "@/types";
import htmr from "htmr";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { ReadmeData, useReadmeData } from "./hooks/useReadmeData";
import { useCreateReadme } from "./hooks/useCreateReadme";

interface ReadmePreviewCardProps {
  documents: UserDocument[];
  onViewFull: () => void;
}

interface ReadmeContentProps {
  readme: ReadmeData;
  html: string | null;
  loadingHtml: boolean;
}

function ReadmeContent({ readme, html, loadingHtml }: ReadmeContentProps) {
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {loadingHtml
        ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )
        : html
        ? (
          <Box
            sx={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
              bgcolor: "transparent",
              "& .document-container": {
                fontSize: "0.75rem",
                lineHeight: 1.5,
                bgcolor: "transparent",
                "& h1": { fontSize: "1rem", mt: 0, mb: 1 },
                "& h2": { fontSize: "0.9rem", mt: 0, mb: 0.5 },
                "& h3": { fontSize: "0.85rem", mt: 0, mb: 0.5 },
                "& p": { mb: 0.5, mt: 0 },
                "& ul, & ol": { pl: 2, my: 0.5 },
                "& li": { mb: 0.25 },
              },
              "& > div": {
                bgcolor: "transparent",
              },
            }}
          >
            <div className="document-container">{htmr(html)}</div>
          </Box>
        )
        : (
          <>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                fontSize: "1.1rem",
                mb: 1.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {readme.name}
            </Typography>
            {readme.description && (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: "vertical",
                  flex: 1,
                }}
              >
                {readme.description}
              </Typography>
            )}
          </>
        )}
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", mt: "auto", opacity: 0.7, pt: 1 }}
      >
        Updated <DateDisplay date={readme.updatedAt} variant="short" />
      </Typography>
    </Box>
  );
}

interface ReadmeEmptyStateProps {
  creating: boolean;
  error: string | null;
}

function ReadmeEmptyState({ creating, error }: ReadmeEmptyStateProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
      }}
    >
      {creating
        ? (
          <>
            <CircularProgress size={24} sx={{ mb: 2 }} />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Creating README...
            </Typography>
          </>
        )
        : (
          <>
            <Plus
              size={40}
              style={{ color: "var(--mui-palette-text-secondary)", opacity: 0.4, marginBottom: 8 }}
            />
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", opacity: 0.7 }}
            >
              No README found
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", mt: 0.5, opacity: 0.5 }}
            >
              Click to create one
            </Typography>
            {error && (
              <Typography
                variant="caption"
                sx={{ color: "error.main", mt: 1 }}
              >
                {error}
              </Typography>
            )}
          </>
        )}
    </Box>
  );
}

export default function ReadmePreviewCard({
  documents,
  onViewFull,
}: ReadmePreviewCardProps) {
  const { readme, html, loadingHtml } = useReadmeData(documents);
  const { creating, error, createReadme } = useCreateReadme();

  const handleClick = () => {
    if (readme) {
      onViewFull();
    } else if (!creating) {
      createReadme();
    }
  };

  return (
    <Box
      sx={{
        height: 380,
        position: "relative",
        cursor: creating ? "wait" : "pointer",
        borderRadius: 3,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: creating ? 0.7 : 1,
      }}
      onClick={handleClick}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <FileText size={20} style={{ color: "var(--mui-palette-text-secondary)" }} />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            README
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          height: 320,
          display: "flex",
          flexDirection: "column",
          borderRadius: 2,
          bgcolor: "action.hover",
          p: 2.5,
        }}
      >
        {readme
          ? (
            <ReadmeContent
              readme={readme}
              html={html}
              loadingHtml={loadingHtml}
            />
          )
          : <ReadmeEmptyState creating={creating} error={error} />}
      </Box>
    </Box>
  );
}
