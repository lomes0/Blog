"use client";
import { Box, Typography } from "@mui/material";
import { FileText } from "lucide-react";
import { UserDocument } from "@/types";
import { useRouter } from "next/navigation";
import { DateDisplay } from "@/components/shared/DateDisplay";

interface RecentPostsPreviewCardProps {
  documents: UserDocument[];
  onViewFull: () => void;
}

export default function RecentPostsPreviewCard({
  documents,
  onViewFull,
}: RecentPostsPreviewCardProps) {
  const router = useRouter();
  const recentPosts = documents.slice(0, 6);

  return (
    <Box
      sx={{
        height: 380,
        position: "relative",
        borderRadius: 3,
        overflow: "hidden",
      }}
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
          <FileText size={20} style={{ color: "var(--mui-palette-text-secondary)" }} />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 500,
              color: "text.primary",
              letterSpacing: "-0.01em",
            }}
          >
            Recent Posts
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          height: 320,
          borderRadius: 2,
          bgcolor: "action.hover",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {recentPosts.length === 0
          ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "text.secondary",
              }}
            >
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                No posts yet
              </Typography>
            </Box>
          )
          : (
            <>
              <Box sx={{ py: 1, flex: 1 }}>
                {recentPosts.map((doc, _index) => {
                  const post = doc.cloud || doc.local;
                  if (!post) return null;

                  return (
                    <Box
                      key={doc.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/view/${doc.id}`);
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        px: 2,
                        py: 1.25,
                        cursor: "pointer",
                        transition: "background-color 0.15s",
                        "&:hover": {
                          bgcolor: "action.selected",
                        },
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "13px",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                        }}
                      >
                        {post.name}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "12px",
                          color: "text.secondary",
                          opacity: 0.7,
                          flexShrink: 0,
                        }}
                      >
                        <DateDisplay date={post.updatedAt} variant="short" />
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
              {documents.length > 6 && (
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    textAlign: "center",
                    borderTop: 1,
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    onClick={onViewFull}
                    sx={{
                      fontSize: "12px",
                      color: "primary.main",
                      cursor: "pointer",
                      fontWeight: 500,
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    View all posts →
                  </Typography>
                </Box>
              )}
            </>
          )}
      </Box>
    </Box>
  );
}
