import { Theme } from "@mui/material/styles";

/**
 * Blog-oriented grid styles for optimal content presentation
 * Follows magazine-style layout principles for better readability
 */
export const documentGridStyles = (theme: Theme) => ({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(6), // Generous spacing between sections
    width: "100%",
    maxWidth: "1400px", // Wider for better desktop experience
    margin: "0 auto",
    padding: theme.spacing(0, 3), // More padding for breathing room
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(0, 2),
      gap: theme.spacing(4),
    },
  },
  grid: {
    width: "100%",
    marginTop: 0,
  },
  gridRow: {
    width: "100%",
    marginTop: 0,
    marginLeft: 0,
  },
  card: {
    height: "100%",
    borderRadius: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    overflow: "hidden",
    transition: theme.transitions.create([
      'box-shadow', 
      'transform', 
      'border-color'
    ], {
      duration: theme.transitions.duration.standard,
    }),
    "&:hover": {
      boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)",
      transform: "translateY(-4px)",
      borderColor: theme.palette.primary.light,
    },
    "&:focus-within": {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  },
  skeletonCard: {
    height: "360px", // Match new card height
    borderRadius: theme.spacing(1),
    backgroundColor: theme.palette.grey[100],
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    padding: theme.spacing(12, 4),
    backgroundColor: theme.palette.background.default,
    borderRadius: theme.spacing(2),
    border: `2px dashed ${theme.palette.grey[300]}`,
    color: theme.palette.text.secondary,
    textAlign: "center",
    [theme.breakpoints.down("md")]: {
      padding: theme.spacing(8, 3),
    },
  },
  emptyStateIcon: {
    fontSize: "4rem",
    color: theme.palette.primary.light,
    marginBottom: theme.spacing(3),
    opacity: 0.7,
  },
  emptyStateText: {
    fontWeight: 600,
    fontSize: "1.5rem",
    marginBottom: theme.spacing(2),
    color: theme.palette.text.primary,
    [theme.breakpoints.down("md")]: {
      fontSize: "1.25rem",
    },
  },
  emptyStateSubtext: {
    maxWidth: "500px",
    lineHeight: 1.6,
    color: theme.palette.text.secondary,
    fontSize: "1rem",
    [theme.breakpoints.down("md")]: {
      fontSize: "0.875rem",
    },
  },
});

/**
 * Blog-oriented styles for the GridSectionHeader component
 */
export const gridSectionStyles = (theme: Theme) => ({
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(4),
    paddingBottom: theme.spacing(3),
    borderBottom: `2px solid ${theme.palette.divider}`,
    [theme.breakpoints.down("md")]: {
      marginBottom: theme.spacing(3),
      paddingBottom: theme.spacing(2),
    },
  },
  titleContainer: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
  },
  iconWrapper: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: "50%",
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontSize: "1.25rem",
    [theme.breakpoints.down("md")]: {
      width: 36,
      height: 36,
      fontSize: "1.125rem",
    },
  },
  title: {
    fontWeight: 800, // Extra bold for magazine-style headers
    fontSize: "2rem", // Larger for impact
    color: theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    letterSpacing: "-0.02em", // Tighter letter spacing
    [theme.breakpoints.down("md")]: {
      fontSize: "1.5rem",
    },
    [theme.breakpoints.down("sm")]: {
      fontSize: "1.25rem",
    },
  },
  actionContainer: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
});
