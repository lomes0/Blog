"use client";
import React from "react";
import { Breadcrumbs, Typography } from "@mui/material";
import { BookOpen } from "lucide-react";

/**
 * Breadcrumb navigation component for the blog browser
 * Shows "Blog Posts" as the root label
 */
const BrowserBreadcrumbs: React.FC = () => {
  return (
    <Breadcrumbs aria-label="breadcrumb">
      {/* Root breadcrumb - always "Blog Posts" */}
      <Typography
        sx={{
          display: "flex",
          alignItems: "center",
          color: "text.primary",
          fontWeight: "bold",
          fontSize: {
            xs: "1.05rem",
            sm: "1.25rem",
            md: "1.35rem",
          },
        }}
      >
        <BookOpen style={{ marginRight: 4 }} />
        Blog Posts
      </Typography>
    </Breadcrumbs>
  );
};

export default BrowserBreadcrumbs;
