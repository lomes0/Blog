"use client";
import {
  Box,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { DocumentStatus } from "@/types";
import useOrigin from "@/hooks/useOrigin";
import type { ChangeEvent } from "react";
import type { SelectChangeEvent } from "@mui/material";

export const EditTitleField: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <TextField
    margin="normal"
    size="small"
    fullWidth
    autoFocus
    label="Post Title"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    sx={{ "& .MuiInputBase-root": { height: 40 } }}
  />
);

export const EditDescriptionField: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => (
  <TextField
    margin="normal"
    size="small"
    fullWidth
    multiline
    rows={3}
    label="Description"
    placeholder="A brief description of your post (optional)"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    helperText="This description will appear in post previews and help with SEO"
    sx={{
      "& .MuiInputBase-root": {
        minHeight: 80,
        alignItems: "flex-start",
        padding: "8px 12px",
      },
      "& .MuiInputBase-input": { resize: "vertical" },
    }}
  />
);

export const EditHandleField: React.FC<{
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  validating: boolean;
  error: string | undefined;
  disabled: boolean;
}> = ({ value, onChange, validating, error, disabled }) => {
  const origin = useOrigin();
  return (
    <TextField
      margin="normal"
      size="small"
      fullWidth
      label="Post Handle"
      disabled={disabled}
      value={value}
      onChange={onChange}
      error={!validating && !!error}
      helperText={validating
        ? "Validating..."
        : error
        ? error
        : value
        ? `${origin}/view/${value}`
        : "This will be used in the URL of your post"}
    />
  );
};

export const EditDateFields: React.FC<{
  value: string | Date | null | undefined;
  onChange: (iso: string) => void;
  disabled: boolean;
}> = ({ value, onChange, disabled }) => (
  <>
    <Typography
      variant="subtitle2"
      color="text.secondary"
      gutterBottom
      sx={{ mt: 2, mb: 1 }}
    >
      Publication Date
    </Typography>
    <Box sx={{ display: "flex", gap: 1 }}>
      <TextField
        size="small"
        label="Date"
        type="date"
        disabled={disabled}
        value={value ? new Date(value).toISOString().slice(0, 10) : ""}
        onChange={(e) => {
          if (e.target.value && value) {
            const current = new Date(value);
            const next = new Date(e.target.value);
            next.setHours(current.getHours(), current.getMinutes());
            onChange(next.toISOString());
          }
        }}
        InputLabelProps={{ shrink: true }}
        sx={{ flex: 1 }}
      />
      <TextField
        size="small"
        label="Time"
        type="time"
        disabled={disabled}
        value={value ? new Date(value).toTimeString().slice(0, 5) : ""}
        onChange={(e) => {
          if (e.target.value && value) {
            const current = new Date(value);
            const [h, m] = e.target.value.split(":");
            current.setHours(parseInt(h), parseInt(m));
            onChange(current.toISOString());
          }
        }}
        InputLabelProps={{ shrink: true }}
        sx={{ flex: 1 }}
      />
    </Box>
    <FormHelperText sx={{ mt: 0.5 }}>
      The date and time when this post was published
    </FormHelperText>
  </>
);

export const EditStatusField: React.FC<{
  value: DocumentStatus | undefined;
  onChange: (status: DocumentStatus) => void;
  disabled: boolean;
}> = ({ value, onChange, disabled }) => {
  const status = value ?? DocumentStatus.ACTIVE;
  return (
    <FormControl fullWidth margin="normal" size="small">
      <InputLabel>Status</InputLabel>
      <Select
        value={status}
        onChange={(e: SelectChangeEvent) =>
          onChange(e.target.value as DocumentStatus)}
        label="Status"
        disabled={disabled}
      >
        <MenuItem value={DocumentStatus.ACTIVE}>Active</MenuItem>
        <MenuItem value={DocumentStatus.DONE}>Done</MenuItem>
      </Select>
      <FormHelperText>
        {status === DocumentStatus.DONE
          ? "This post is marked as done and will appear with a special visual indicator"
          : "This post is active and will appear normally"}
      </FormHelperText>
    </FormControl>
  );
};

export const EditSortOrderField: React.FC<{
  value: number | null | undefined;
  onChange: (value: number | null) => void;
}> = ({ value, onChange }) => (
  <TextField
    margin="normal"
    size="small"
    fullWidth
    label="Sort Order"
    type="number"
    inputProps={{ min: 0, step: 1 }}
    value={value === null || value === undefined ? "" : value}
    onChange={(e) =>
      onChange(e.target.value === "" ? null : Number(e.target.value))}
    helperText="Items with sort order > 0 will appear first. Leave empty for default sorting."
  />
);
