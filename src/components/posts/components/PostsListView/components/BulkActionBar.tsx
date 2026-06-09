import React from "react";
import { Box, Button, Fade, Paper, Tooltip, Typography } from "@mui/material";
import { Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar(
  { count, onDelete, onClear }: BulkActionBarProps,
) {
  return (
    <Fade in={count > 0} unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1200,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: 3,
          bgcolor: "background.paper",
          border: "1px solid",
          borderColor: "divider",
          minWidth: 260,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            mr: 1,
            color: "text.primary",
            whiteSpace: "nowrap",
          }}
        >
          {count} selected
        </Typography>

        <Tooltip title="Coming soon">
          <span>
            <Button
              size="small"
              variant="text"
              disabled
              sx={{ textTransform: "none", typography: "dense" }}
            >
              Move
            </Button>
          </span>
        </Tooltip>

        <Tooltip title="Coming soon">
          <span>
            <Button
              size="small"
              variant="text"
              disabled
              sx={{ textTransform: "none", typography: "dense" }}
            >
              Tag
            </Button>
          </span>
        </Tooltip>

        <Button
          size="small"
          variant="text"
          color="error"
          startIcon={<Trash2 size={14} />}
          onClick={onDelete}
          sx={{ textTransform: "none", typography: "dense" }}
        >
          Delete
        </Button>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="text"
          onClick={onClear}
          sx={{
            textTransform: "none",
            typography: "dense",
            color: "text.secondary",
            minWidth: "auto",
            p: 0.5,
          }}
        >
          <X size={16} />
        </Button>
      </Paper>
    </Fade>
  );
}
