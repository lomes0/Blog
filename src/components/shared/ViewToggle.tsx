import React from "react";
import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import { LayoutGrid, List } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

export type ViewType = "grid" | "compact";

interface ViewToggleProps {
  view: ViewType;
  onChange: (view: ViewType) => void;
}

/**
 * Toggle component for switching between different post view layouts
 */
export const ViewToggle: React.FC<ViewToggleProps> = ({ view, onChange }) => {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newView: ViewType | null,
  ) => {
    if (newView !== null) {
      onChange(newView);
    }
  };

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      aria-label="view toggle"
      size="small"
      sx={{
        backgroundColor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        overflow: "hidden",
        "& .MuiToggleButton-root": {
          border: "none",
          borderRadius: 0,
          padding: "5px 8px",
          "&.Mui-selected": {
            backgroundColor: "primary.main",
            color: "primary.contrastText",
            "&:hover": {
              backgroundColor: "primary.dark",
            },
          },
        },
      }}
    >
      <ToggleButton value="grid" aria-label="grid view">
        <Tooltip title="Grid View">
          <LayoutGrid size={ICON_SIZE.dense} strokeWidth={2} />
        </Tooltip>
      </ToggleButton>
      <ToggleButton value="compact" aria-label="compact list view">
        <Tooltip title="Compact List">
          <List size={ICON_SIZE.dense} strokeWidth={2} />
        </Tooltip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
};
