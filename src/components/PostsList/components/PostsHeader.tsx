import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  Add,
  Article,
  CalendarMonth,
  Clear,
  FilterList,
  Schedule,
  Search,
  Today,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { TimeFilterValue } from "../hooks/usePostsTimeFilter";
import { PartitionGranularity } from "@/types/partitioning";
import { PartitionControl } from "./PartitionControl";

interface PostsHeaderProps {
  totalCount: number;
  loading: boolean;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  timeFilter?: TimeFilterValue;
  onTimeFilterChange?: (filter: TimeFilterValue) => void;
  granularity?: PartitionGranularity;
  onGranularityChange?: (granularity: PartitionGranularity) => void;
  onNewPost?: () => void;
}

/**
 * Header component displaying page title, posts count, search, filters, and new post button
 * Enhanced for content management workflow
 */
const PostsHeader: React.FC<PostsHeaderProps> = ({
  totalCount,
  loading,
  searchQuery = "",
  onSearchChange,
  timeFilter = "all",
  onTimeFilterChange,
  granularity = "month",
  onGranularityChange,
  onNewPost,
}) => {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Filter menu state
  const [filterAnchorEl, setFilterAnchorEl] = useState<null | HTMLElement>(
    null,
  );
  const filterMenuOpen = Boolean(filterAnchorEl);

  // Time filter options
  const timeFilterOptions = [
    { value: "all", label: "All Time", icon: <Schedule /> },
    { value: "thisYear", label: "This Year", icon: <CalendarMonth /> },
    { value: "thisMonth", label: "This Month", icon: <Today /> },
    { value: "lastMonth", label: "Last Month", icon: <Today /> },
    { value: "last3Months", label: "Last 3 Months", icon: <CalendarMonth /> },
    { value: "last6Months", label: "Last 6 Months", icon: <CalendarMonth /> },
  ];

  const handleNewPost = () => {
    if (onNewPost) {
      onNewPost();
    } else {
      router.push("/new");
    }
  };

  const handleFilterClick = (event: React.MouseEvent<HTMLElement>) => {
    setFilterAnchorEl(event.currentTarget);
  };

  const handleFilterClose = () => {
    setFilterAnchorEl(null);
  };

  const handleTimeFilterSelect = (value: string) => {
    onTimeFilterChange?.(value as TimeFilterValue);
    handleFilterClose();
  };

  const clearSearch = () => {
    onSearchChange?.("");
  };

  const activeTimeFilter = timeFilterOptions.find((option) =>
    option.value === timeFilter
  );

  return (
    <Box
      sx={{
        mb: 4,
        pt: 2,
        pb: 3,
      }}
    >
      {/* Simple, clean toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        {/* Search Field - takes most space */}
        <TextField
          size="small"
          placeholder="Search posts..."
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          sx={{
            flex: "1 1 300px",
            minWidth: 250,
            maxWidth: 500,
            "& .MuiOutlinedInput-root": {
              borderRadius: 1.5,
              height: "40px", // Consistent height with buttons
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: "text.secondary", fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={clearSearch}>
                  <Clear sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        {/* New Post Button */}
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleNewPost}
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            px: 2,
            minWidth: "auto",
            whiteSpace: "nowrap",
            height: "40px", // Consistent height
          }}
        >
          New Post
        </Button>

        {/* Filter Button */}
        <Button
          variant="outlined"
          startIcon={<FilterList />}
          onClick={handleFilterClick}
          size="small"
          sx={{
            borderRadius: 1.5,
            textTransform: "none",
            px: 2,
            minWidth: "auto",
            whiteSpace: "nowrap",
            height: "40px", // Consistent height
          }}
        >
          {activeTimeFilter?.label || "All Time"}
        </Button>

        {/* Partition Control - Group By */}
        {totalCount > 0 && (
          <PartitionControl
            granularity={granularity}
            onGranularityChange={onGranularityChange || (() => {})}
            postCount={totalCount}
          />
        )}
      </Box>

      {/* Active Filters - Only show when needed */}
      {(searchQuery || timeFilter !== "all") && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 2,
            pt: 2,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontWeight: 500,
              mr: 1,
            }}
          >
            Filters:
          </Typography>
          {searchQuery && (
            <Chip
              label={searchQuery}
              onDelete={clearSearch}
              size="small"
              variant="outlined"
            />
          )}
          {timeFilter !== "all" && (
            <Chip
              label={activeTimeFilter?.label}
              onDelete={() => onTimeFilterChange?.("all")}
              size="small"
              variant="outlined"
            />
          )}
        </Box>
      )}

      {/* Filter Menu */}
      <Menu
        anchorEl={filterAnchorEl}
        open={filterMenuOpen}
        onClose={handleFilterClose}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 180,
            borderRadius: 2,
            boxShadow: 3,
          },
        }}
      >
        {timeFilterOptions.map((option) => (
          <MenuItem
            key={option.value}
            onClick={() => handleTimeFilterSelect(option.value)}
            selected={timeFilter === option.value}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              py: 1,
            }}
          >
            {option.icon}
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

export default PostsHeader;
