"use client";
import { actions, useDispatch, useSelector } from "@/store";
import UserCard from "./User/UserCard";
import Grid from "@mui/material/Grid2";
import {
  Alert,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Snackbar,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { PieChart } from "@mui/x-charts/PieChart";
import {
  Add,
  Category,
  Cloud,
  Delete,
  LibraryBooks,
  Login,
  Storage,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import Link from "next/link";

const Dashboard: React.FC = () => {
  const user = useSelector((state) => state.user);
  const router = useRouter();

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
      <UserCard user={user} showActions />

      {user && (
        <Paper sx={{ p: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography
              variant="h6"
              component="h2"
              sx={{ display: "flex", alignItems: "center" }}
            >
              <LibraryBooks sx={{ mr: 1 }} /> Domains
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => router.push("/domains/new")}
            >
              New Domain
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <DomainsSection />
        </Paper>
      )}

      <StorageChart />
    </Box>
  );
};

export default Dashboard;

type storageUsage = {
  loading: boolean;
  usage: number;
  details: {
    value: number;
    label?: string;
    color?: string;
  }[];
};

const StorageChart: React.FC = () => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const initialized = useSelector((state) => state.ui.initialized);

  const [localStorageUsage, setLocalStorageUsage] = useState<storageUsage>({
    loading: true,
    usage: 0,
    details: [],
  });
  const [cloudStorageUsage, setCloudStorageUsage] = useState<storageUsage>({
    loading: true,
    usage: 0,
    details: [],
  });

  useEffect(() => {
    dispatch(actions.getLocalStorageUsage()).then((response) => {
      if (response.type === actions.getLocalStorageUsage.fulfilled.type) {
        const localStorageUsage = response.payload as ReturnType<
          typeof actions.getLocalStorageUsage.fulfilled
        >["payload"];
        const localUsage = localStorageUsage.reduce((acc, document) =>
          acc + document.size, 0) / 1024 / 1024;
        const localUsageDetails = localStorageUsage.map((document) => {
          return {
            value: document.size / 1024 / 1024,
            label: document.name,
          };
        });
        setLocalStorageUsage({
          loading: false,
          usage: localUsage,
          details: localUsageDetails,
        });
      }
    });
    dispatch(actions.getCloudStorageUsage()).then((response) => {
      if (response.type === actions.getCloudStorageUsage.fulfilled.type) {
        const cloudStorageUsage = response.payload as ReturnType<
          typeof actions.getCloudStorageUsage.fulfilled
        >["payload"];
        const cloudUsage = cloudStorageUsage.reduce((acc, document) =>
          acc + document.size, 0) / 1024 / 1024;
        const cloudUsageDetails = cloudStorageUsage.map((document) => {
          return {
            value: (document.size ?? 0) / 1024 / 1024,
            label: document.name,
          };
        });
        setCloudStorageUsage({
          loading: false,
          usage: cloudUsage,
          details: cloudUsageDetails,
        });
      }
    });
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Paper
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            p: 2,
          }}
        >
          <Typography
            variant="overline"
            gutterBottom
            sx={{ alignSelf: "start", userSelect: "none" }}
          >
            Local Storage
          </Typography>
          {localStorageUsage.loading && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: 300,
                gap: 2,
              }}
            >
              <CircularProgress disableShrink />
            </Box>
          )}
          {!localStorageUsage.loading && !localStorageUsage.usage && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: 300,
                gap: 2,
              }}
            >
              <Storage
                sx={{ width: 64, height: 64, fontSize: 64 }}
              />
              <Typography
                variant="overline"
                component="p"
                sx={{ userSelect: "none" }}
              >
                Local storage is empty
              </Typography>
            </Box>
          )}
          {!!localStorageUsage.usage && (
            <PieChart
              series={[
                {
                  innerRadius: 0,
                  outerRadius: 80,
                  cx: 125,
                  data: [{
                    id: "local",
                    label: "Local",
                    value: localStorageUsage.usage,
                    color: "#72CCFF",
                  }],
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
                {
                  innerRadius: 100,
                  outerRadius: 120,
                  cx: 125,
                  data: localStorageUsage.details,
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
              ]}
              width={256}
              height={300}
              slotProps={{ legend: { hidden: true } }}
              sx={{ mx: "auto" }}
            />
          )}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <Paper
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            p: 2,
          }}
        >
          <Typography
            variant="overline"
            gutterBottom
            sx={{ alignSelf: "start", userSelect: "none" }}
          >
            Cloud Storage
          </Typography>
          {(cloudStorageUsage.loading ||
            (!initialized && !cloudStorageUsage.usage)) && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: 300,
                gap: 2,
              }}
            >
              <CircularProgress disableShrink />
            </Box>
          )}
          {initialized && !user && !cloudStorageUsage.loading && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: 300,
                gap: 2,
              }}
            >
              <Login
                sx={{ width: 64, height: 64, fontSize: 64 }}
              />
              <Typography
                variant="overline"
                component="p"
                sx={{ userSelect: "none" }}
              >
                Please login to use cloud storage
              </Typography>
            </Box>
          )}
          {user && !cloudStorageUsage.loading &&
            !cloudStorageUsage.usage && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                height: 300,
                gap: 2,
              }}
            >
              <Cloud
                sx={{ width: 64, height: 64, fontSize: 64 }}
              />
              <Typography
                variant="overline"
                component="p"
                sx={{ userSelect: "none" }}
              >
                Cloud storage is empty
              </Typography>
            </Box>
          )}
          {!!cloudStorageUsage.usage && (
            <PieChart
              series={[
                {
                  innerRadius: 0,
                  outerRadius: 80,
                  cx: 125,
                  data: [{
                    id: "cloud",
                    label: "Cloud",
                    value: cloudStorageUsage.usage,
                    color: "#FFBB28",
                  }],
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
                {
                  innerRadius: 100,
                  outerRadius: 120,
                  cx: 125,
                  data: cloudStorageUsage.details,
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
              ]}
              width={256}
              height={300}
              slotProps={{ legend: { hidden: true } }}
            />
          )}
        </Paper>
      </Grid>
    </Grid>
  );
};

const DomainsSection: React.FC = () => {
  const [domains, setDomains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const dispatch = useDispatch();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

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

  useEffect(() => {
    fetchDomains();
  }, []);

  const handleDeleteClick = (e: React.MouseEvent, domain: any) => {
    e.stopPropagation(); // Prevent card click (navigation) when clicking delete button
    setDomainToDelete(domain);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!domainToDelete) return;

    try {
      setIsDeleting(true);
      const result = await dispatch(actions.deleteDomain(domainToDelete.id))
        .unwrap();

      // Show success message
      setSnackbar({
        open: true,
        message:
          `Domain "${domainToDelete.name}" and all its documents have been deleted`,
        severity: "success",
      });

      // Refresh domains list after successful deletion
      await fetchDomains();
      setDeleteDialogOpen(false);
    } catch (err: any) {
      console.error("Error deleting domain:", err);
      setSnackbar({
        open: true,
        message: err.subtitle || err.message || "Failed to delete domain",
        severity: "error",
      });
    } finally {
      setIsDeleting(false);
      setDomainToDelete(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (domains.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 4 }}>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          You haven't created any domains yet.
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Add />}
          component={Link}
          href="/domains/new"
          sx={{ mt: 1 }}
        >
          Create your first domain
        </Button>
      </Box>
    );
  }

  return (
    <>
      <Grid container spacing={2}>
        {domains.map((domain) => (
          <Grid key={domain.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card
              sx={{
                p: 2,
                transition: "transform 0.2s, box-shadow 0.2s",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: 4,
                },
                position: "relative",
              }}
            >
              <Box
                sx={{
                  cursor: "pointer",
                }}
                onClick={() =>
                  router.push(`/domains/${domain.slug}`)}
              >
                <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                  <Typography variant="h6" component="h3" noWrap>
                    {domain.name}
                  </Typography>
                </Box>
                {domain.description && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {domain.description}
                  </Typography>
                )}
              </Box>
              <IconButton
                size="small"
                color="error"
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  opacity: 0.7,
                  "&:hover": {
                    opacity: 1,
                    backgroundColor: "rgba(211, 47, 47, 0.04)",
                  },
                }}
                onClick={(e) =>
                  handleDeleteClick(e, domain)}
                aria-label={`Delete domain ${domain.name}`}
              >
                <Delete fontSize="small" />
              </IconButton>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !isDeleting && setDeleteDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          Delete Domain
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete the domain "{domainToDelete?.name}"?
            This will permanently delete the domain and all documents within it.
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            autoFocus
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
};
