"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Box,
  Breadcrumbs as MuiBreadcrumbs,
  Link,
  Typography,
} from "@mui/material";
import {
  Create,
  Dashboard,
  Edit,
  FolderSpecial,
  Home,
  LibraryBooks,
} from "@mui/icons-material";
import RouterLink from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

const Breadcrumbs: React.FC = () => {
  const pathname = usePathname();

  const getBreadcrumbs = React.useCallback((): BreadcrumbItem[] => {
    const segments = pathname.split("/").filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
      {
        label: "Home",
        href: "/",
        icon: <Home sx={{ fontSize: 16, mr: 0.5 }} />,
      },
    ];

    if (segments.length === 0) {
      return breadcrumbs;
    }

    // Handle different routes
    switch (segments[0]) {
      case "browse":
        breadcrumbs.push({
          label: "Browse Posts",
          href: "/browse",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "posts":
        breadcrumbs.push({
          label: "Posts",
          href: "/posts",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "series":
        breadcrumbs.push({
          label: "Series",
          href: "/series",
          icon: <FolderSpecial sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        if (segments.length > 1) {
          if (segments[1] === "new") {
            breadcrumbs.push({ label: "New Series" });
          } else if (segments.length > 2 && segments[2] === "edit") {
            breadcrumbs.push({
              label: "Series Details",
              href: `/series/${segments[1]}`,
            });
            breadcrumbs.push({ label: "Edit" });
          } else {
            breadcrumbs.push({ label: "Series Details" });
          }
        }
        break;

      case "dashboard":
        breadcrumbs.push({
          label: "Dashboard",
          icon: <Dashboard sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "new":
        breadcrumbs.push({
          label: "New Post",
          icon: <Create sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "edit":
        breadcrumbs.push({
          label: "Browse Posts",
          href: "/browse",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        breadcrumbs.push({
          label: "Edit Post",
          icon: <Edit sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        break;

      case "view":
        breadcrumbs.push({
          label: "Browse Posts",
          href: "/browse",
          icon: <LibraryBooks sx={{ fontSize: 16, mr: 0.5 }} />,
        });
        breadcrumbs.push({ label: "View Post" });
        break;

      case "user":
        breadcrumbs.push({ label: "User Profile" });
        break;

      default:
        // For other routes, just show the segment
        breadcrumbs.push({ label: segments[0] });
        break;
    }

    return breadcrumbs;
  }, [pathname]);

  const breadcrumbs = getBreadcrumbs();

  // Don't show breadcrumbs on home page
  if (pathname === "/") {
    return null;
  }

  return (
    <Box
      sx={{ py: 1, px: 2, borderBottom: "1px solid", borderColor: "divider" }}
    >
      <MuiBreadcrumbs aria-label="breadcrumb" separator="›">
        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;

          if (isLast || !item.href) {
            return (
              <Typography
                key={index}
                color="text.primary"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: "0.875rem",
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {item.icon}
                {item.label}
              </Typography>
            );
          }

          return (
            <Link
              key={index}
              component={RouterLink}
              href={item.href}
              underline="hover"
              color="inherit"
              sx={{
                display: "flex",
                alignItems: "center",
                fontSize: "0.875rem",
                "&:hover": {
                  color: "primary.main",
                },
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </MuiBreadcrumbs>
    </Box>
  );
};

export default Breadcrumbs;
