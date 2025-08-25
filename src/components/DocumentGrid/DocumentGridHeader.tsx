import React, { memo } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

interface DocumentGridHeaderProps {
  /** The title to display */
  title: string;
  /** Optional icon to display beside the title */
  titleIcon?: React.ReactNode;
  /** Whether the grid is in a loading state */
  isLoading?: boolean;
  /** Number of items for count display */
  itemCount?: number;
}

/**
 * Header component for DocumentGrid with title, icon, and item count
 * Memoized for performance optimization
 */
const DocumentGridHeader: React.FC<DocumentGridHeaderProps> = memo(({
  title,
  titleIcon,
  isLoading = false,
  itemCount = 0,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        mb: 2,
        // Responsive title sizing
        [theme.breakpoints.down("sm")]: {
          mb: 1.5,
        },
      }}
    >
      {titleIcon && (
        <Box
          sx={{
            mr: 1.5,
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            // Responsive icon sizing
            [theme.breakpoints.down("sm")]: {
              mr: 1,
            },
          }}
        >
          {titleIcon}
        </Box>
      )}
    </Box>
  );
});

DocumentGridHeader.displayName = "DocumentGridHeader";

export default DocumentGridHeader;
