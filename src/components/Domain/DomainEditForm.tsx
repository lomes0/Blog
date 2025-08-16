"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { Delete, LibraryBooks, Save, Warning } from "@mui/icons-material";
import { slugify } from "@/utils/strings";
import { Domain } from "@prisma/client";

// Predefined color options
const colorOptions = [
  "#4285F4", // Blue
  "#EA4335", // Red
  "#FBBC05", // Yellow
  "#34A853", // Green
  "#8E24AA", // Purple
  "#F57C00", // Orange
  "#16A2D7", // Light Blue
  "#00897B", // Teal
  "#757575", // Gray
];

interface DomainEditFormProps {
  domain: Domain;
}

export default function DomainEditForm({ domain }: DomainEditFormProps) {
  const router = useRouter();
  const theme = useTheme();

  const [name, setName] = useState(domain.name);
  const [slug, setSlug] = useState(domain.slug);
  const [description, setDescription] = useState(domain.description || "");
  const [color, setColor] = useState(domain.color || colorOptions[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Update slug when name changes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    // Only auto-update slug if it hasn't been manually modified
    if (slug === domain.slug) {
      setSlug(slugify(newName));
    }
  };

  // Allow manual override of slug
  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(slugify(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Domain name is required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/domains/${domain.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug,
          description,
          color,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update domain");
      }

      setShowSuccess(true);

      // Navigate to dashboard where domains are listed
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred while updating the domain");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/domains/${domain.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete domain");
      }

      // Navigate back to dashboard
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred while deleting the domain");
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: domain.color || theme.palette.primary.main,
            color: "#fff",
            width: 48,
            height: 48,
            borderRadius: "50%",
            mr: 2,
          }}
        >
          <LibraryBooks sx={{ fontSize: "1.5rem" }} />
        </Box>
        <Typography variant="h4" component="h1">Edit Domain</Typography>
      </Box>

      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  id="domain-name"
                  label="Domain Name"
                  value={name}
                  onChange={handleNameChange}
                  variant="outlined"
                  helperText="Choose a descriptive name for your domain"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  id="domain-slug"
                  label="URL Slug"
                  value={slug}
                  onChange={handleSlugChange}
                  variant="outlined"
                  helperText="Used in the URL (auto-generated from name, can be customized)"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  id="domain-description"
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  variant="outlined"
                  multiline
                  rows={3}
                  helperText="Optional: Add a description of what this domain contains"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel id="color-label">Color</InputLabel>
                  <Select
                    labelId="color-label"
                    id="color-select"
                    value={color}
                    label="Color"
                    onChange={(e) => setColor(e.target.value)}
                  >
                    {colorOptions.map((colorOption) => (
                      <MenuItem key={colorOption} value={colorOption}>
                        <Box
                          sx={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            backgroundColor: colorOption,
                            mr: 1,
                            display: "inline-block",
                          }}
                        />
                        {colorOption}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {error && (
                <Grid item xs={12}>
                  <Alert severity="error">{error}</Alert>
                </Grid>
              )}

              <Grid
                item
                xs={12}
                sx={{ display: "flex", justifyContent: "space-between" }}
              >
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setShowDeleteDialog(true)}
                  startIcon={<Delete />}
                >
                  Delete Domain
                </Button>

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={isSubmitting}
                  startIcon={isSubmitting
                    ? <CircularProgress size={20} />
                    : <Save />}
                >
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      {/* Success message */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
      >
        <Alert onClose={() => setShowSuccess(false)} severity="success">
          Domain updated successfully!
        </Alert>
      </Snackbar>

      {/* Delete confirmation dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Warning color="error" sx={{ mr: 1 }} />
            Delete Domain?
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the domain &quot;{domain
              .name}&quot;? This will not delete any documents within the
            domain, but they will no longer be organized in this domain.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
          <Button
            onClick={handleDelete}
            color="error"
            disabled={isSubmitting}
            startIcon={isSubmitting
              ? <CircularProgress size={20} />
              : <Delete />}
          >
            {isSubmitting ? "Deleting..." : "Delete Domain"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
