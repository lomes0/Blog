"use client";
import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useSession } from "next-auth/react";
import {
  hasIndexedDBNotes,
  hasMigrated,
  migrateNotesFromIndexedDB,
  type MigrationResult,
} from "@/utils/migrateNotes";
import { CloudUpload, X } from "lucide-react";

export default function NotesMigrationBanner() {
  const { status } = useSession();
  const [showBanner, setShowBanner] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  useEffect(() => {
    async function checkMigrationStatus() {
      // Only check if user is authenticated
      if (status !== "authenticated") {
        setShowBanner(false);
        return;
      }

      // Check if already migrated
      if (hasMigrated()) {
        setShowBanner(false);
        return;
      }

      // Check if user has IndexedDB notes
      const hasNotes = await hasIndexedDBNotes();
      setShowBanner(hasNotes);
    }

    checkMigrationStatus();
  }, [status]);

  const handleMigrate = async () => {
    setMigrating(true);
    setResult(null);

    const migrationResult = await migrateNotesFromIndexedDB();
    setResult(migrationResult);
    setMigrating(false);

    if (migrationResult.success) {
      // Hide banner after 5 seconds on success
      setTimeout(() => {
        setShowBanner(false);
      }, 5000);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1300,
        bgcolor: "info.main",
        color: "info.contrastText",
        p: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        boxShadow: 2,
      }}
    >
      <CloudUpload />

      {!result && (
        <>
          <Typography variant="body1" sx={{ flex: 1 }}>
            We've upgraded notes storage! Import your local notes to the cloud
            for better reliability and multi-device sync.
          </Typography>

          <Button
            variant="contained"
            color="inherit"
            onClick={handleMigrate}
            disabled={migrating}
            startIcon={migrating ? <CircularProgress size={16} /> : undefined}
            // Fixed white/near-white on purpose, not scheme-invariance drift:
            // the banner is `info.main` in both schemes, so this button is
            // sitting on a saturated blue either way and wants a constant
            // light fill. A scheme-aware `action.hover` here would replace the
            // white with a near-transparent tint over the blue.
            sx={{
              bgcolor: "common.white",
              color: "info.main",
              "&:hover": {
                // Constant by design: the banner is info.main in both schemes,
                // so this is a dimmed white on saturated blue, not a surface
                // that should follow the scheme. See the note above.
                // eslint-disable-next-line no-restricted-syntax
                bgcolor: "grey.100",
              },
            }}
          >
            {migrating ? "Migrating..." : "Import Now"}
          </Button>

          <Button
            onClick={handleDismiss}
            sx={{ color: "info.contrastText", minWidth: "auto", p: 1 }}
          >
            <X />
          </Button>
        </>
      )}

      {result && result.success && (
        <Alert severity="success" sx={{ flex: 1 }}>
          Successfully migrated {result.notesCount}{" "}
          note{result.notesCount !== 1 ? "s" : ""} to the cloud!
        </Alert>
      )}

      {result && !result.success && (
        <Alert severity="error" sx={{ flex: 1 }}>
          Migration failed: {result.error}. Please try again or contact support.
        </Alert>
      )}
    </Box>
  );
}
