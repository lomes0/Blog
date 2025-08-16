"use client";
import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import { Domain } from "@/types";

interface DomainSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (domainId: string | null) => void;
  fileCount: number;
}

const DomainSelectionDialog: React.FC<DomainSelectionDialogProps> = ({
  open,
  onClose,
  onConfirm,
  fileCount,
}) => {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string>("");

  useEffect(() => {
    if (open) {
      fetchDomains();
    }
  }, [open]);

  const fetchDomains = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch("/api/domains");

      if (!response.ok) {
        throw new Error("Failed to fetch domains");
      }

      const data = await response.json() as Domain[];
      setDomains(data);
    } catch (err) {
      console.error("Error fetching domains:", err);
      setError("Failed to load domains");
    } finally {
      setLoading(false);
    }
  };

  const handleDomainChange = (event: SelectChangeEvent) => {
    setSelectedDomainId(event.target.value);
  };

  const handleConfirm = () => {
    const domainId = selectedDomainId || null;
    onConfirm(domainId);
    onClose();
  };

  const handleCancel = () => {
    setSelectedDomainId("");
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="domain-selection-dialog-title"
    >
      <DialogTitle id="domain-selection-dialog-title">
        Select Domain for Import
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          You're about to import {fileCount} file{fileCount !== 1 ? 's' : ''}. 
          Choose which domain to organize them in, or leave unassigned.
        </Typography>

        <FormControl fullWidth>
          <InputLabel id="domain-select-label" shrink={true}>
            Domain
          </InputLabel>
          <Select
            labelId="domain-select-label"
            value={selectedDomainId}
            label="Domain"
            onChange={handleDomainChange}
            disabled={loading}
            displayEmpty
            notched={true}
            renderValue={(selected) => {
              if (loading) return <CircularProgress size={20} />;
              if (!selected) return "No domain (orphaned items)";

              const selectedDomain = domains.find((d) => d.id === selected);
              return selectedDomain ? (
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  {selectedDomain.name}
                </Box>
              ) : "Select a domain";
            }}
          >
            <MenuItem value="">
              <em>No domain (orphaned items)</em>
            </MenuItem>

            {domains.map((domain) => (
              <MenuItem key={domain.id} value={domain.id}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  {domain.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>
            {loading
              ? "Loading domains..."
              : error
              ? error
              : "All imported files will be assigned to the selected domain"}
          </FormHelperText>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          disabled={loading}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DomainSelectionDialog;
