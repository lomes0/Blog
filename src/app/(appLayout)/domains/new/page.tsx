"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "@mui/material/styles";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { LibraryBooks } from "@mui/icons-material";
import { slugify } from "@/utils/strings";

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

export default function NewDomainPage() {
  const router = useRouter();
  const sessionResult = useSession();
  const { data: session, status } = sessionResult ||
    { data: null, status: "loading" };
  const theme = useTheme();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(colorOptions[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Update slug when name changes
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    setSlug(slugify(newName));
  };

  // Allow manual override of slug
  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(slugify(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session) {
      setError("You must be signed in to create a domain");
      return;
    }

    if (!name.trim()) {
      setError("Domain name is required");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/domains", {
        method: "POST",
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
        throw new Error(errorData.message || "Failed to create domain");
      }

      const data = await response.json();
      setShowSuccess(true);

      // Navigate to the new domain after a short delay
      setTimeout(() => {
        router.push(`/domains/${data.slug}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || "An error occurred while creating the domain");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state while checking authentication
  if (status === "loading") {
    return (
      <Container
        maxWidth="md"
        sx={{ mt: 4, display: "flex", justifyContent: "center" }}
      >
        <CircularProgress />
      </Container>
    );
  }

  // Redirect to sign in if not authenticated
  if (status === "unauthenticated") {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="warning">
          You must be signed in to create a domain.
          <Button
            color="inherit"
            size="small"
            onClick={() => router.push("/api/auth/signin")}
            sx={{ ml: 2 }}
          >
            Sign In
          </Button>
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 8 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <LibraryBooks
          sx={{ mr: 1.5, fontSize: "2rem", color: theme.palette.primary.main }}
        />
        <Typography variant="h4" component="h1">Create New Domain</Typography>
      </Box>

      <Typography variant="body1" sx={{ mb: 4 }}>
        Domains help you organize your documents by subject or project area.
        Create a new domain to group related documents together.
      </Typography>

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

              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={isSubmitting}
                  startIcon={isSubmitting
                    ? <CircularProgress size={20} />
                    : <LibraryBooks />}
                  sx={{ mt: 2 }}
                >
                  {isSubmitting ? "Creating..." : "Create Domain"}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
      >
        <Alert onClose={() => setShowSuccess(false)} severity="success">
          Domain created successfully!
        </Alert>
      </Snackbar>
    </Container>
  );
}
