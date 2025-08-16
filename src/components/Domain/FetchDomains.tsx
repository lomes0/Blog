"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";

interface Domain {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  icon?: string | null;
}

interface FetchDomainsProps {
  userId: string;
  value: string;
  onChange: (domainId: string) => void;
}

export default function FetchDomains(
  { userId, value, onChange }: FetchDomainsProps,
) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/domains");

        if (!response.ok) {
          throw new Error("Failed to fetch domains");
        }

        const data = await response.json();
        setDomains(data);
        setError(null);
      } catch (err) {
        setError("Failed to load domains");
        console.error("Error fetching domains:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDomains();
  }, [userId]);

  const handleChange = (event: SelectChangeEvent) => {
    onChange(event.target.value);
  };

  return (
    <FormControl fullWidth margin="normal" size="small">
      <InputLabel id="domain-select-label" shrink={true}>Domain</InputLabel>
      <Select
        labelId="domain-select-label"
        value={value}
        label="Domain"
        onChange={handleChange}
        disabled={loading}
        displayEmpty
        notched={true}
        renderValue={(selected) => {
          if (loading) return <CircularProgress size={20} />;
          if (!selected) return "Select a domain (optional)";

          const selectedDomain = domains.find((d) => d.id === selected);
          return selectedDomain
            ? (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                {selectedDomain.name}
              </Box>
            )
            : "Select a domain";
        }}
      >
        <MenuItem value="">
          <em>None (No domain)</em>
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
          : "Organize your document in a domain (optional)"}
      </FormHelperText>
    </FormControl>
  );
}
