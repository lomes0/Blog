import React from "react";
import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Tooltip,
  Typography,
} from "@mui/material";
import { PartitionGranularity } from "@/types/partitioning";

interface PartitionControlProps {
  granularity: PartitionGranularity;
  onGranularityChange: (granularity: PartitionGranularity) => void;
  postCount?: number;
  disabled?: boolean;
}

const granularityOptions = [
  {
    value: "day" as const,
    label: "Daily",
    description: "Group posts by day",
  },
  {
    value: "week" as const,
    label: "Weekly",
    description: "Group posts by week",
  },
  {
    value: "month" as const,
    label: "Monthly",
    description: "Group posts by month (default)",
  },
  {
    value: "quarter" as const,
    label: "Quarterly",
    description: "Group posts by 3-month periods",
  },
  {
    value: "halfyear" as const,
    label: "Semi-annual",
    description: "Group posts by 6-month periods",
  },
  {
    value: "year" as const,
    label: "Yearly",
    description: "Group posts by year",
  },
];

/**
 * Control component for selecting post partitioning granularity
 * Allows users to switch between day, week, month, and year grouping
 */
export const PartitionControl: React.FC<PartitionControlProps> = ({
  granularity,
  onGranularityChange,
  postCount = 0,
  disabled = false,
}) => {
  const handleChange = (event: SelectChangeEvent<PartitionGranularity>) => {
    onGranularityChange(event.target.value as PartitionGranularity);
  };

  const selectedOption = granularityOptions.find((option) =>
    option.value === granularity
  );

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Tooltip title={selectedOption?.description || ""} arrow>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={granularity}
            onChange={handleChange}
            disabled={disabled}
            sx={{
              borderRadius: 1.5,
              height: "40px", // Consistent height with other buttons
              "& .MuiSelect-select": {
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 2,
              },
              "& .MuiOutlinedInput-notchedOutline": {
                borderRadius: 1.5,
              },
            }}
          >
            {granularityOptions.map((option) => (
              <MenuItem
                key={option.value}
                value={option.value}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography variant="body2">{option.label}</Typography>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Tooltip>

      {postCount > 0 && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            whiteSpace: "nowrap",
          }}
        >
          {postCount} post{postCount === 1 ? "" : "s"}
        </Typography>
      )}
    </Box>
  );
};
