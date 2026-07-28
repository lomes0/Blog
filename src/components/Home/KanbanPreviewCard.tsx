"use client";
import { Box, Typography } from "@mui/material";
import { Kanban } from "lucide-react";
import { Post } from "@/types";

interface KanbanPreviewCardProps {
  documents: Post[];
  onViewFull: () => void;
}

/** Type-safe helper to check if a document is published */
function getDocumentPublished(doc: Post): boolean {
  return doc.published === true;
}

export default function KanbanPreviewCard({
  documents,
  onViewFull,
}: KanbanPreviewCardProps) {
  const draftDocs = documents.filter((doc) => !getDocumentPublished(doc));
  const publishedDocs = documents.filter((doc) => getDocumentPublished(doc));

  const columns = [
    {
      title: "Draft",
      count: draftDocs.length,
      color: "warning.main",
      docs: draftDocs.slice(0, 2),
    },
    {
      title: "Published",
      count: publishedDocs.length,
      color: "success.main",
      docs: publishedDocs.slice(0, 2),
    },
  ];

  return (
    <Box
      sx={{
        height: 380,
        position: "relative",
        cursor: "pointer",
        borderRadius: 3,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={onViewFull}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Kanban
            size={20}
            style={{ color: "var(--mui-palette-text-secondary)" }}
          />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Board
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          height: 320,
          display: "flex",
          gap: 1.5,
          overflow: "hidden",
        }}
      >
        {documents.length === 0
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                color: "text.secondary",
                textAlign: "center",
              }}
            >
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                No documents yet
              </Typography>
            </Box>
          )
          : (
            columns.map((column) => (
              <Box
                key={column.title}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "action.hover",
                  borderRadius: 2,
                  p: 1.5,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: column.color,
                    }}
                  />
                  <Typography
                    variant="micro"
                    sx={{
                      fontWeight: 600,
                      color: "text.secondary",
                      flex: 1,
                    }}
                  >
                    {column.title}
                  </Typography>
                  <Typography
                    variant="micro"
                    sx={{
                      color: "text.secondary",
                      fontWeight: 500,
                    }}
                  >
                    {column.count}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                  }}
                >
                  {column.docs.map((doc) => {
                    const data = doc;
                    return (
                      <Box
                        key={doc.id}
                        sx={{
                          p: 1,
                          bgcolor: "background.paper",
                          borderRadius: 1.5,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                      >
                        <Typography
                          variant="micro"
                          sx={{
                            lineHeight: 1.4,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {data?.name || "Untitled"}
                        </Typography>
                      </Box>
                    );
                  })}
                  {column.count > 2 && (
                    <Typography
                      sx={{
                        fontSize: "10px",
                        color: "text.secondary",
                        textAlign: "center",
                        mt: 0.5,
                        opacity: 0.7,
                      }}
                    >
                      +{column.count - 2} more
                    </Typography>
                  )}
                </Box>
              </Box>
            ))
          )}
      </Box>
    </Box>
  );
}
