"use client";
import {
  AppBar,
  Box,
  Dialog,
  IconButton,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { X } from "lucide-react";

type ViewType = "notes" | "kanban" | "readme" | "posts";

interface FullViewDialogProps {
  open: boolean;
  onClose: () => void;
  viewType: ViewType | null;
  children: React.ReactNode;
}

export default function FullViewDialog({
  open,
  onClose,
  viewType,
  children,
}: FullViewDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  const titles: Record<ViewType, string> = {
    notes: "Notes Canvas",
    kanban: "Kanban Board",
    readme: "README",
    posts: "All Posts",
  };

  return (
    <Dialog
      fullScreen={fullScreen}
      maxWidth="xl"
      fullWidth
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDialog-paper": {
          height: fullScreen ? "100%" : "90vh",
        },
      }}
    >
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            component="div"
            sx={{ flexGrow: 1, color: "text.primary" }}
          >
            {viewType ? titles[viewType] : "View"}
          </Typography>
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
            sx={{ color: "text.primary" }}
          >
            <X />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          position: "relative",
          height: "100%",
        }}
      >
        {children}
      </Box>
    </Dialog>
  );
}
