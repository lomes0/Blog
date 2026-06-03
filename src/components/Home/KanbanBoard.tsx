"use client";
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Paper,
  Typography,
} from "@mui/material";
import { GripVertical } from "lucide-react";
import { UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import { DateDisplay } from "@/components/shared/DateDisplay";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { apiClient } from "@/api";

interface KanbanBoardProps {
  documents: UserDocument[];
  onRefresh: () => Promise<void>;
}

interface Column {
  id: string;
  title: string;
  color: string;
  filterFn: (doc: UserDocument) => boolean;
}

/** Type-safe helper to check if a document is published */
function getDocumentPublished(doc: UserDocument): boolean {
  return doc.cloud?.published === true;
}

export default function KanbanBoard(
  { documents, onRefresh }: KanbanBoardProps,
) {
  const router = useRouter();
  const theme = useTheme();
  const errorAnnounce = useErrorAnnounce();
  const [draggedDoc, setDraggedDoc] = useState<UserDocument | null>(null);

  const columns: Column[] = [
    {
      id: "draft",
      title: "Draft",
      color: theme.palette.warning.main,
      filterFn: (doc) => !getDocumentPublished(doc),
    },
    {
      id: "published",
      title: "Published",
      color: theme.palette.success.main,
      filterFn: (doc) => getDocumentPublished(doc),
    },
  ];

  const getColumnDocs = (column: Column) => {
    return documents.filter(column.filterFn);
  };

  const handleDragStart = (e: React.DragEvent, doc: UserDocument) => {
    setDraggedDoc(doc);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    if (!draggedDoc) return;

    // Update document status based on column
    try {
      const published = columnId === "published";

      await apiClient.documents.update(draggedDoc.id, { published });

      // Refresh documents to show updated data
      await onRefresh();
    } catch (error) {
      errorAnnounce("Failed to update document", error);
    }

    setDraggedDoc(null);
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: 2,
        p: 3,
        minHeight: 600,
        height: "100%",
        overflow: "auto",
      }}
    >
      {columns.map((column) => {
        const columnDocs = getColumnDocs(column);

        return (
          <Paper
            key={column.id}
            sx={{
              flex: 1,
              minWidth: 300,
              bgcolor: "background.default",
              p: 2,
              display: "flex",
              flexDirection: "column",
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 2,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  fontSize: "14px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {column.title}
              </Typography>
              <Chip
                label={columnDocs.length}
                size="small"
                sx={{
                  bgcolor: column.color,
                  color: "white",
                  fontWeight: 600,
                }}
              />
            </Box>

            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                overflow: "auto",
              }}
            >
              {columnDocs.length === 0
                ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: 100,
                      color: "text.secondary",
                      fontSize: "14px",
                      border: "2px dashed",
                      borderColor: "divider",
                      borderRadius: 1,
                    }}
                  >
                    Drop documents here
                  </Box>
                )
                : (
                  columnDocs.map((doc) => {
                    const data = doc.cloud || doc.local;
                    if (!data) return null;

                    return (
                      <Card
                        key={doc.id}
                        variant="outlined"
                        draggable
                        onDragStart={(e) => handleDragStart(e, doc)}
                        sx={{
                          cursor: "move",
                          bgcolor: "background.paper",
                          "&:hover": {
                            boxShadow: 2,
                            transform: "translateY(-2px)",
                            transition: "all 0.2s",
                          },
                        }}
                      >
                        <CardActionArea
                          onClick={() => router.push(`/view/${doc.id}`)}
                        >
                          <CardContent
                            sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "start",
                                gap: 1,
                              }}
                            >
                              <GripVertical
                                size={16}
                                style={{
                                  color: "var(--mui-palette-text-disabled)",
                                  marginTop: "1.6px",
                                }}
                              />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 500,
                                    mb: 0.5,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {data.name}
                                </Typography>
                                {data.description && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "text.secondary",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                    }}
                                  >
                                    {data.description}
                                  </Typography>
                                )}
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: "block",
                                    color: "text.secondary",
                                    mt: 0.5,
                                  }}
                                >
                                  <DateDisplay
                                    date={data.updatedAt}
                                    variant="short"
                                  />
                                </Typography>
                              </Box>
                            </Box>
                          </CardContent>
                        </CardActionArea>
                      </Card>
                    );
                  })
                )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
