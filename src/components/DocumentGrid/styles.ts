import { Theme } from "@mui/material/styles";

/**
 * Clean, blog-focused styles for the DocumentGrid component
 */
export const documentGridStyles = (theme: Theme) => ({
  container: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(4), // More generous spacing for blog layout
    width: "100%",
    maxWidth: "1200px", // Constrain max width for readability
    margin: "0 auto", // Center the grid
    padding: theme.spacing(0, 2), // Side padding
  },
  grid: {
    width: "100%",
    marginTop: 0,
    borderRadius: theme.spacing(1),
  },
  gridRow: {
    width: "100%",
    marginTop: 0,
    marginLeft: 0,
    padding: theme.spacing(0, 1),
  },
  card: {
    height: "100%",
    borderRadius: theme.spacing(1.5),
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    transition: theme.transitions.create(['box-shadow', 'transform'], {
      duration: theme.transitions.duration.shorter,
    }),
    "&:hover": {
      boxShadow: theme.shadows[4],
      transform: "translateY(-2px)",
    },
    "&:focus-within": {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
    },
  },
  skeletonCard: {
    height: "320px", // Fixed height for consistency
    borderRadius: theme.spacing(1.5),
    backgroundColor: theme.palette.grey[100],
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    padding: theme.spacing(8, 4),
    backgroundColor: theme.palette.grey[50],
    borderRadius: theme.spacing(2),
    border: `2px dashed ${theme.palette.grey[300]}`,
    color: theme.palette.text.secondary,
    textAlign: "center",
  },
  emptyStateIcon: {
    fontSize: "3rem",
    color: theme.palette.grey[400],
    marginBottom: theme.spacing(2),
  },
  emptyStateText: {
    fontWeight: 600,
    fontSize: "1.125rem",
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  emptyStateSubtext: {
    maxWidth: "400px",
    lineHeight: 1.6,
    color: theme.palette.text.secondary,
  },
});

/**
 * Clean, blog-focused styles for the GridSectionHeader component
 */
export const gridSectionStyles = (theme: Theme) => ({
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing(3),
    paddingBottom: theme.spacing(2),
    borderBottom: `1px solid ${theme.palette.divider}`,
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
    width: 32,
    height: 32,
    borderRadius: "50%",
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontSize: "1rem",
  },
  title: {
    fontWeight: 700,
    fontSize: "1.5rem",
    color: theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    [theme.breakpoints.down("sm")]: {
      fontSize: "1.25rem",
    },
  },
  counter: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.palette.grey[200],
    color: theme.palette.text.secondary,
    borderRadius: "12px",
    minWidth: 24,
    height: 24,
    padding: theme.spacing(0, 1),
    fontSize: "0.75rem",
    fontWeight: 600,
    marginLeft: theme.spacing(1),
  },
  actionContainer: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
});
