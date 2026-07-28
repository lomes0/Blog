"use client";
import { useSelector } from "@/store";
import UserCard from "./User/UserCard";
import { ExportImportPanel } from "./ExportImportPanel";
import { capabilities } from "@/lib/capabilities";
import Grid from "@mui/material/Grid2";
import { Box, CircularProgress, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { PieChart } from "@mui/x-charts/PieChart";
import { Cloud, Database } from "lucide-react";
import { useStorageUsage } from "@/hooks/useStorageUsage";
import { ICON_SIZE } from "@/theme/icons";

const Dashboard: React.FC = () => {
  const user = useSelector((state) => state.user);

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
      <UserCard user={user} showActions />

      <StorageChart />

      {capabilities(user).exportImport && <ExportImportPanel />}
    </Box>
  );
};

export default Dashboard;

const StorageEmptyState: React.FC<{
  icon?: React.ReactNode;
  label?: string;
  loading?: boolean;
}> = ({ icon, label, loading }) => (
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
    {loading ? <CircularProgress disableShrink /> : (
      <>
        {icon}
        {label && (
          <Typography
            variant="overline"
            component="p"
            sx={{ userSelect: "none" }}
          >
            {label}
          </Typography>
        )}
      </>
    )}
  </Box>
);

/**
 * Storage consumed by the session's posts.
 *
 * One chart, not the old local/cloud pair — a post now lives in exactly one
 * place, so a split would be showing a distinction that no longer exists. The
 * inner ring is the total; the outer ring breaks it down per post.
 */
const StorageChart: React.FC = () => {
  const user = useSelector((state) => state.user);
  const { usage: storageUsage, initialized } = useStorageUsage();
  const theme = useTheme();

  const label = user ? "Cloud Storage" : "Local Storage";
  const isPending = storageUsage.loading || (!initialized && !storageUsage.usage);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
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
            {label}
          </Typography>
          {isPending && <StorageEmptyState loading />}
          {!isPending && !storageUsage.usage && (
            <StorageEmptyState
              icon={user
                ? <Cloud size={ICON_SIZE.display} />
                : <Database size={ICON_SIZE.display} />}
              label={user
                ? "You have no posts yet"
                : "You have no local drafts yet"}
            />
          )}
          {!!storageUsage.usage && (
            <PieChart
              series={[
                {
                  innerRadius: 0,
                  outerRadius: 80,
                  cx: 125,
                  data: [{
                    id: "total",
                    label,
                    value: storageUsage.usage,
                    color: theme.palette.info.light,
                  }],
                  valueFormatter: (item) => `${item.value.toFixed(2)} MB`,
                },
                {
                  innerRadius: 100,
                  outerRadius: 120,
                  cx: 125,
                  data: storageUsage.details,
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
    </Grid>
  );
};
