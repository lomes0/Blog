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
  Edit,
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
              <LibraryBooks sx={{ mr: 1 }} /> Blog Content
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              onClick={() => router.push("/new")}
            >
              New Post
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          <BlogStatsSection />
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

const BlogStatsSection: React.FC = () => {
  const [stats, setStats] = useState({
    posts: 0,
    series: 0,
    publishedPosts: 0,
    draftPosts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const user = useSelector((state) => state.user);

  const fetchStats = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      // Fetch user posts (documents with type DOCUMENT)
      const postsResponse = await fetch(`/api/documents?authorId=${user.id}`);
      const postsData = await postsResponse.json();
      const userPosts = postsData.data || [];
      
      // Fetch user series (documents with type DIRECTORY)  
      const seriesResponse = await fetch(`/api/series?authorId=${user.id}`);
      const seriesData = await seriesResponse.json();
      const userSeries = seriesData.data || [];

      setStats({
        posts: userPosts.length,
        series: userSeries.length,
        publishedPosts: userPosts.filter((post: any) => post.published).length,
        draftPosts: userPosts.filter((post: any) => !post.published).length,
      });
      setError(null);
    } catch (err) {
      setError("Failed to load blog statistics");
      console.error("Error fetching blog stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card sx={{ textAlign: "center", p: 2 }}>
          <Typography variant="h4" color="primary.main">
            {stats.posts}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total Posts
          </Typography>
        </Card>
      </Grid>
      
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card sx={{ textAlign: "center", p: 2 }}>
          <Typography variant="h4" color="success.main">
            {stats.publishedPosts}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Published
          </Typography>
        </Card>
      </Grid>
      
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card sx={{ textAlign: "center", p: 2 }}>
          <Typography variant="h4" color="warning.main">
            {stats.draftPosts}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Drafts
          </Typography>
        </Card>
      </Grid>
      
      <Grid size={{ xs: 6, sm: 3 }}>
        <Card sx={{ textAlign: "center", p: 2 }}>
          <Typography variant="h4" color="info.main">
            {stats.series}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Series
          </Typography>
        </Card>
      </Grid>

      {/* Quick Actions */}
      <Grid size={12}>
        <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => router.push("/new")}
            size="small"
          >
            Write New Post
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<Category />}
            onClick={() => router.push("/series/new")}
            size="small"
          >
            Create Series
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<LibraryBooks />}
            onClick={() => router.push("/dashboard/posts")}
            size="small"
          >
            Manage Posts
          </Button>
        </Box>
      </Grid>
    </Grid>
  );
};


