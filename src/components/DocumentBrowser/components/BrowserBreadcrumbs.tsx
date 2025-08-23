"use client";
import React from "react";
import { Breadcrumbs, Typography } from "@mui/material";
import { LibraryBooks } from "@mui/icons-material";

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BrowserBreadcrumbsProps {
  breadcrumbs: BreadcrumbItem[]; // Will be empty for blog structure
  domainInfo?: any; // Keep for compatibility but unused
  directoryId?: string; // Keep for compatibility but unused
}

/**
 * Breadcrumb navigation component for the blog browser
 * Shows only "Blog Posts" as we don't have directory navigation
 */
const BrowserBreadcrumbs: React.FC<BrowserBreadcrumbsProps> = ({
  breadcrumbs,
  domainInfo,
  directoryId,
}) => {
  return (
    <Breadcrumbs aria-label="breadcrumb">
      {/* Root breadcrumb - always "Blog Posts" */}
      <Typography
        sx={{
          display: "flex",
          alignItems: "center",
          color: "text.primary",
          fontWeight: "medium",
        }}
      >
        <LibraryBooks sx={{ mr: 0.5 }} fontSize="inherit" />
        Blog Posts
      </Typography>
    </Breadcrumbs>
  );
};

export default BrowserBreadcrumbs;
