"use client";
import React from "react";
import { Box, Container, Skeleton } from "@mui/material";
import DocumentGrid from "../../DocumentGrid";

/**
 * Page chrome for the DocumentBrowser while it loads: the header bar's own
 * skeleton, then two `DocumentGrid`s in their loading state — which is what
 * puts the card skeletons on screen, so the cards themselves are
 * `DocumentCard/components/LoadingCard` and are not restated here.
 *
 * Intentionally feature-specific — it traces this page's layout, so do not use
 * it elsewhere. For a plain spinner, DESIGN.md §Loading says reach for MUI
 * `<CircularProgress>` directly.
 */
const DocumentBrowserSkeleton: React.FC = () => {
  return (
    <Container
      maxWidth={false}
      sx={{
        py: 4,
        px: { xs: 2, sm: 3, md: 4, lg: 5 },
        maxWidth: { xs: "100%", sm: "100%", md: "2000px", lg: "2200px" },
        mx: "auto",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          width: "100%",
        }}
      >
        {/* Header skeleton */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: { xs: "wrap", md: "nowrap" },
            gap: 2,
            pb: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Skeleton variant="text" width={200} height={40} />
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: { xs: "wrap", sm: "nowrap" },
              width: { xs: "100%", md: "auto" },
            }}
          >
            <Skeleton variant="rounded" width={140} height={40} />
            <Skeleton variant="rounded" width={140} height={40} />
            <Skeleton variant="rounded" width={180} height={40} />
          </Box>
        </Box>

        {/* Content skeleton */}
        <DocumentGrid
          items={[]}
          isLoading={true}
          skeletonCount={3}
        />

        <DocumentGrid
          items={[]}
          isLoading={true}
          skeletonCount={6}
        />
      </Box>
    </Container>
  );
};

export default DocumentBrowserSkeleton;
