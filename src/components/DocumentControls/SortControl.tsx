import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Box,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
  ToggleButton,
} from "@mui/material";
import type {} from "@mui/material/themeCssVarsAugmentation";
import { ICON_SIZE } from "@/theme/icons";

const DocumentSortControl: React.FC<{
  value: { key: string; direction: string };
  setValue: (value: { key: string; direction: string }) => void;
}> = ({ value, setValue }) => {
  const { key: sortKey, direction: sortDirection } = value;

  const sortOptions = [
    { label: "Updated", value: "updatedAt" },
    { label: "Created", value: "createdAt" },
    { label: "Name", value: "name" },
  ];

  const handleSortKeyChange = (event: SelectChangeEvent) => {
    const newSortKey = event.target.value;
    if (sortKey !== newSortKey) {
      setValue({ ...value, key: newSortKey });
    }
  };

  const handleDirectionToggle = () => {
    const newSortDirection = sortDirection === "asc" ? "desc" : "asc";
    setValue({ ...value, direction: newSortDirection });
  };

  return (
    <Box sx={{ display: "flex" }}>
      <ToggleButton
        size="small"
        value="sort-direction"
        onChange={handleDirectionToggle}
        sx={(_theme) => ({
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          borderRight: "none",
          borderColor: "divider",
          color: "primary.main",
          height: 40,
          "&:hover": {
            borderColor: "primary.main",
            bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.04)",
          },
        })}
        aria-label="sort direction"
      >
        {sortDirection === "asc"
          ? <ArrowUp size={ICON_SIZE.dense} />
          : <ArrowDown size={ICON_SIZE.dense} />}
      </ToggleButton>
      <Select
        value={sortKey}
        onChange={handleSortKeyChange}
        sx={(_theme) => ({
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          height: 40,
          "& .MuiSelect-select": {
            display: "flex !important",
            alignItems: "center",
            px: "10px",
            py: "6.5px",
            height: "0 !important",
          },
          "& .MuiListItemIcon-root": {
            color: "primary.main",
            mr: 0.5,
            minWidth: 20,
          },
          "& .MuiSelect-icon": { color: "text.secondary" },
          "& .MuiListItemText-primary": {
            color: "text.primary",
            typography: "subtitle2",
          },
          "& .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1,
            borderColor: "divider",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
            bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.04)",
          },
        })}
        inputProps={{ "aria-label": "sort by" }}
        MenuProps={{
          slotProps: {
            root: {
              sx: {
                "& .MuiBackdrop-root": { userSelect: "none" },
                "& .MuiMenuItem-root": {
                  minHeight: 40,
                  borderRadius: 1,
                  mx: 0.5,
                  "&:hover": {
                    bgcolor:
                      "rgba(var(--mui-palette-primary-mainChannel) / 0.08)",
                  },
                  "&.Mui-selected": {
                    bgcolor:
                      "rgba(var(--mui-palette-primary-mainChannel) / 0.12)",
                    "&:hover": {
                      bgcolor:
                        "rgba(var(--mui-palette-primary-mainChannel) / 0.16)",
                    },
                  },
                },
                "& .MuiMenu-paper": {
                  mt: 1,
                  borderRadius: 1.5,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                },
              },
            },
          },
        }}
      >
        {sortOptions.map((option) => (
          <MenuItem value={option.value} key={option.value}>
            <ListItemText>{option.label}</ListItemText>
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};

export default DocumentSortControl;
