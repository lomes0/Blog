"use client";
import * as React from "react";
import { Series, User, Post, DocumentType } from "@/types";
import { 
  Box, 
  Typography, 
  Chip, 
  Card, 
  CardContent,
  IconButton,
  Divider
} from "@mui/material";
import { 
  Edit, 
  MoreVert, 
  CalendarToday,
  LibraryBooks
} from "@mui/icons-material";
import Grid from "@mui/material/Grid2";
import Link from "next/link";
import DocumentCard from "../DocumentCard";

interface SeriesViewProps {
  series: Series;
  user?: User;
}

/**
 * Series detail view component
 * Shows series information and contained posts
 */
const SeriesView: React.FC<SeriesViewProps> = ({
  series,
  user
}) => {
  const isAuthor = series.authorId === user?.id;
  const sortedPosts = [...(series.posts || [])].sort((a, b) => 
    (a.seriesOrder || 0) - (b.seriesOrder || 0)
  );

  return (
    <Box>
      {/* Series Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              {series.title}
            </Typography>
            
            {isAuthor && (
              <IconButton 
                component={Link} 
                href={`/series/${series.id}/edit`}
                aria-label="Edit series"
              >
                <Edit />
              </IconButton>
            )}
          </Box>

          {series.description && (
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {series.description}
            </Typography>
          )}

          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
            <Chip
              icon={<CalendarToday />}
              label={`Created ${new Date(series.createdAt).toLocaleDateString()}`}
              variant="outlined"
              size="small"
            />
            
            <Chip
              icon={<LibraryBooks />}
              label={`${sortedPosts.length} ${sortedPosts.length === 1 ? 'post' : 'posts'}`}
              variant="outlined"
              size="small"
            />

            <Typography variant="body2" color="text.secondary">
              by {series.author.name}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* Posts in Series */}
      {sortedPosts.length > 0 ? (
        <Box>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
            Posts in this Series
          </Typography>
          
          <Grid container spacing={2}>
            {sortedPosts.map((post, index) => {
              // Convert Post to UserDocument format for DocumentCard compatibility
              const userDocument = {
                id: post.id,
                cloud: {
                  ...post,
                  name: post.title,
                  head: post.id, // Use post id as head for now
                  type: DocumentType.DOCUMENT,
                  coauthors: [],
                  revisions: [],
                  children: undefined
                }
              };

              return (
                <Grid key={post.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Box sx={{ position: "relative" }}>
                    {/* Series order indicator */}
                    <Box
                      sx={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        zIndex: 1,
                        backgroundColor: "primary.main",
                        color: "white",
                        borderRadius: "50%",
                        width: 24,
                        height: 24,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 600
                      }}
                    >
                      {index + 1}
                    </Box>
                    
                    <DocumentCard
                      userDocument={userDocument}
                      user={user}
                      cardConfig={{
                        showAuthor: false,
                        showSortOrder: false,
                        showPermissionChips: true,
                      }}
                    />
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ) : (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No posts in this series yet
          </Typography>
          {isAuthor && (
            <Typography variant="body2" color="text.secondary">
              Start writing your first post and add it to this series
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default SeriesView;
