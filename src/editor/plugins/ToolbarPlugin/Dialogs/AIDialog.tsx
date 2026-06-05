"use client";
import type { LexicalEditor } from "lexical";
import React, { memo, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useAIModel } from "@/contexts/AIModelContext";
import { AlignLeft } from "lucide-react";
import { AI_MODELS } from "@/lib/ai";

function AIDialog({ editor }: { editor: LexicalEditor }) {
  const { llm, setLlm } = useAIModel();
  const [formData, setFormData] = useState(llm);

  const handleSubmit = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setLlm(formData);
    closeDialog();
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { ai: { open: false } });
  };

  const handleClose = () => {
    closeDialog();
  };

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xs"
      onClose={handleClose}
      aria-labelledby="ai-dialog-title"
      disableEscapeKeyDown
    >
      <DialogTitle id="ai-dialog-title">
        Configure AI Models
      </DialogTitle>
      <DialogContent>
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{ mt: 1 }}
        >
          <Typography
            variant="button"
            component="h3"
            color="text.secondary"
            sx={{ my: 1 }}
          >
            Language Model
          </Typography>
          <Select
            value={formData.model}
            size="small"
            fullWidth
            sx={{
              "& .MuiSelect-select": {
                display: "flex !important",
                alignItems: "center",
                py: 0.5,
              },
              "& .MuiListItemIcon-root": {
                mr: 0.5,
                minWidth: 20,
              },
              fieldset: { borderColor: "divider" },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "primary.main",
              },
            }}
            MenuProps={{
              slotProps: {
                root: {
                  sx: {
                    "& .MuiBackdrop-root": {
                      userSelect: "none",
                    },
                    "& .MuiMenuItem-root": {
                      minHeight: 36,
                    },
                  },
                },
              },
            }}
            inputProps={{ "aria-label": "Language Model" }}
          >
            {AI_MODELS.map((model) => (
              <MenuItem
                key={model.id}
                value={model.id}
                onClick={() =>
                  setFormData({ provider: model.provider, model: model.id })}
              >
                <ListItemIcon>
                  <AlignLeft size={18} />
                </ListItemIcon>
                <ListItemText>{model.name}</ListItemText>
                {model.metadata?.fast && (
                  <Badge
                    color="success"
                    badgeContent="Fast"
                    sx={{
                      ml: 1,
                      "& .MuiBadge-badge": {
                        position: "static",
                        transform: "none",
                      },
                    }}
                  />
                )}
                {model.metadata?.reason && (
                  <Badge
                    color="warning"
                    badgeContent="Reason"
                    sx={{
                      ml: 1,
                      "& .MuiBadge-badge": {
                        position: "static",
                        transform: "none",
                      },
                    }}
                  />
                )}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default memo(AIDialog);
