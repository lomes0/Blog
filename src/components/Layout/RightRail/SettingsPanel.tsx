"use client";
import React from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Minus, Plus } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";
import { AlignLeft, Computer, Moon, Settings, Sun, X } from "lucide-react";
import { AI_MODELS } from "@/lib/ai/models";
import { useAIModel } from "@/contexts/AIModelContext";
import { useSidebarFontSize } from "@/components/Layout/SideBar/hooks/useSidebarFontSize";
import ProviderKeys from "./ProviderKeys";
import { ICON_SIZE } from "@/theme/icons";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ open, onClose }) => {
  const { mode, setMode } = useColorScheme();
  const { llm, setLlm, isProviderConfigured } = useAIModel();
  const { sidebarFontSize, increaseFontSize, decreaseFontSize, resetFontSize } =
    useSidebarFontSize();

  // Read straight off the context rather than mirroring it into local state:
  // the context now changes the model on its own when the selected provider has
  // no key, and a mirror would keep showing the model that was replaced.
  const handleModelChange = (modelId: string) => {
    const model = AI_MODELS.find((m) => m.id === modelId);
    if (model) setLlm({ provider: model.provider, model: model.id });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="settings-dialog-title"
    >
      <DialogTitle
        id="settings-dialog-title"
        sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}
      >
        <Settings size={ICON_SIZE.dense} />
        Settings
        <IconButton
          size="small"
          onClick={onClose}
          aria-label="Close settings"
          sx={{ ml: "auto" }}
        >
          <X size={ICON_SIZE.dense} />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}
      >
        {/* Appearance */}
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 2 }}
          >
            Appearance
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="body1">Theme</Typography>
              <Typography variant="body2" color="text.secondary">
                Choose between light, dark, or system default
              </Typography>
            </Box>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={mode ?? "system"}
              onChange={(_, val) => {
                if (val) setMode(val);
              }}
              aria-label="Color scheme"
            >
              <Tooltip title="System">
                <ToggleButton value="system" aria-label="System">
                  <Computer size={ICON_SIZE.dense} />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Light">
                <ToggleButton value="light" aria-label="Light">
                  <Sun size={ICON_SIZE.dense} />
                </ToggleButton>
              </Tooltip>
              <Tooltip title="Dark">
                <ToggleButton value="dark" aria-label="Dark">
                  <Moon size={ICON_SIZE.dense} />
                </ToggleButton>
              </Tooltip>
            </ToggleButtonGroup>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mt: 2,
            }}
          >
            <Box>
              <Typography variant="body1">Sidebar font size</Typography>
              <Typography variant="body2" color="text.secondary">
                Size of post titles in the sidebar
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Decrease">
                <span>
                  <IconButton
                    size="small"
                    onClick={decreaseFontSize}
                    disabled={sidebarFontSize <= 10}
                    aria-label="Decrease sidebar font size"
                  >
                    <Minus size={ICON_SIZE.dense} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Reset to default">
                <IconButton
                  size="small"
                  onClick={resetFontSize}
                  aria-label="Reset sidebar font size"
                  sx={{
                    minWidth: 32,
                    typography: "caption",
                    fontWeight: sidebarFontSize !== 16 ? 700 : 400,
                    color: sidebarFontSize !== 16
                      ? "primary.main"
                      : "text.secondary",
                  }}
                >
                  {sidebarFontSize}
                </IconButton>
              </Tooltip>
              <Tooltip title="Increase">
                <span>
                  <IconButton
                    size="small"
                    onClick={increaseFontSize}
                    disabled={sidebarFontSize >= 24}
                    aria-label="Increase sidebar font size"
                  >
                    <Plus size={ICON_SIZE.dense} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        <Divider />

        {/* AI Model */}
        <Box>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 2 }}
          >
            AI
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body1">Default model</Typography>
              <Typography variant="body2" color="text.secondary">
                Used by Copilot and the AI writing assistant
              </Typography>
            </Box>
            <Select
              value={llm.model}
              size="small"
              onChange={(e) => handleModelChange(e.target.value)}
              sx={{
                minWidth: 200,
                flexShrink: 0,
                "& .MuiSelect-select": {
                  display: "flex !important",
                  alignItems: "center",
                  py: 0.5,
                },
                "& .MuiListItemIcon-root": { mr: 0.5, minWidth: 20 },
                fieldset: { borderColor: "divider" },
                "&:hover .MuiOutlinedInput-notchedOutline": {
                  borderColor: "primary.main",
                },
              }}
              MenuProps={{
                slotProps: {
                  root: { sx: { "& .MuiMenuItem-root": { minHeight: 36 } } },
                },
              }}
              inputProps={{ "aria-label": "AI model" }}
            >
              {AI_MODELS.map((model) => {
                const usable = isProviderConfigured(model.provider);
                return (
                  <MenuItem
                    key={model.id}
                    value={model.id}
                    disabled={!usable}
                  >
                    <ListItemIcon>
                      <AlignLeft size={ICON_SIZE.dense} />
                    </ListItemIcon>
                    <ListItemText
                      primary={model.name}
                      // The reason, not just the dimming — a model nobody can
                      // explain is unavailable reads as a bug (DESIGN.md §10).
                      secondary={usable ? undefined : "Add a key below"}
                      slotProps={{
                        primary: { variant: "body2" },
                        secondary: { variant: "caption" },
                      }}
                    />
                  </MenuItem>
                );
              })}
            </Select>
          </Box>

          <Box sx={{ mt: 2.5 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>
              Provider keys
            </Typography>
            <ProviderKeys />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsPanel;
