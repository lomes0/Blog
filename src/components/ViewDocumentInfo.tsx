"use client";
import { CloudDocument, User } from "@/types";
import Grid from "@mui/material/Grid2";
import {
  Avatar,
  Badge,
  Box,
  Chip,
  Fab,
  IconButton,
  Portal,
  Typography,
  useScrollTrigger,
} from "@mui/material";
import { Edit, FileCopy, History } from "@mui/icons-material";
import RouterLink from "next/link";
import ShareDocument from "./DocumentActions/Share";
import DownloadDocument from "./DocumentActions/Download";
import ForkDocument from "./DocumentActions/Fork";
import AppDrawer from "./AppDrawer";
import ViewRevisionCard from "./ViewRevisionCard";
import { useSearchParams } from "next/navigation";
import { FloatingActionButton } from "./Layout/FloatingActionsContainer";
import EditDocumentButton from "./Layout/EditDocumentButton";

export default function ViewDocumentInfo(
  { cloudDocument, user }: { cloudDocument: CloudDocument; user?: User },
) {
  const slideTrigger = useScrollTrigger({ disableHysteresis: true });
  const handle = cloudDocument.handle || cloudDocument.id;
  const isAuthor = cloudDocument.author.id === user?.id;
  // Simplified blog structure: no coauthors, only authors can edit
  const userDocument = { id: cloudDocument.id, cloud: cloudDocument };
  const isPublished = cloudDocument.published;
  const isCollab = cloudDocument.collab;
  const isEditable = isAuthor || isCollab; // Remove coauthor check
  const showFork = isPublished || isEditable;
  const collaborators = isCollab
    ? cloudDocument.revisions.reduce((acc, rev) => {
      if (
        (rev as any).author?.id !== cloudDocument.author.id &&
        !acc.find((u) => u.id === (rev as any).author?.id)
      ) acc.push((rev as any).author);
      return acc;
    }, [] as User[])
    : [];

  const searchParams = useSearchParams();
  const revisionId = searchParams.get("v");
  const href = isEditable
    ? `/edit/${handle}`
    : `/new/${handle}${revisionId ? `?v=${revisionId}` : ""}`;

  const cloudDocumentRevisions = cloudDocument?.revisions ?? [];

  return (
    <>
      <AppDrawer title="Document Info">
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
            justifyContent: "start",
            gap: 1,
            my: 3,
          }}
        >
          <Typography component="h2" variant="h6">
            {cloudDocument.name}
          </Typography>
          {cloudDocument.description && (
            <Typography 
              variant="body1" 
              color="text.secondary"
              sx={{ 
                mb: 2, 
                fontStyle: 'italic',
                lineHeight: 1.6,
                padding: "8px 12px",
                backgroundColor: "action.hover",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider"
              }}
            >
              {cloudDocument.description}
            </Typography>
          )}
          <Typography variant="subtitle2" color="text.secondary">
            Created: {new Date(cloudDocument.createdAt).toLocaleString(
              undefined,
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </Typography>
          <Typography
            variant="subtitle2"
            color="text.secondary"
            gutterBottom
          >
            Updated: {new Date(cloudDocument.updatedAt).toLocaleString(
              undefined,
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </Typography>
          <Typography variant="subtitle2">
            Author{" "}
            <Chip
              clickable
              component={RouterLink}
              prefetch={false}
              href={`/user/${
                cloudDocument.author.handle ||
                cloudDocument.author.id
              }`}
              avatar={
                <Avatar
                  alt={cloudDocument.author.name}
                  src={cloudDocument.author.image ||
                    undefined}
                />
              }
              label={cloudDocument.author.name}
              variant="outlined"
            />
          </Typography>
          {/* Removed coauthors section for simplified blog structure */}
          {collaborators.length > 0 && (
            <>
              <Typography component="h3" variant="subtitle2">
                Collaborators
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                {collaborators.map((user) => (
                  <Chip
                    clickable
                    component={RouterLink}
                    prefetch={false}
                    href={`/user/${user.handle || user.id}`}
                    key={user.id}
                    avatar={
                      <Avatar
                        alt={user.name}
                        src={user.image || undefined}
                      />
                    }
                    label={user.name}
                    variant="outlined"
                  />
                ))}
              </Box>
            </>
          )}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mt: 2,
              alignSelf: "flex-end",
            }}
          >
            <ShareDocument userDocument={userDocument} />
            {showFork && <ForkDocument userDocument={userDocument} />}
            {isEditable && <DownloadDocument userDocument={userDocument} />}
            {isEditable && (
              <IconButton
                component={RouterLink}
                prefetch={false}
                href={`/edit/${handle}`}
                aria-label="Edit"
              >
                <Edit />
              </IconButton>
            )}
          </Box>
        </Box>
        <Grid container spacing={1}>
          <Grid
            sx={{ display: "flex", alignItems: "center" }}
            size={{ xs: 12 }}
          >
            <History sx={{ mr: 1 }} />
            <Typography variant="h6">Revisions</Typography>
          </Grid>
          {cloudDocument.revisions.map((revision) => (
            <Grid size={{ xs: 12 }} key={revision.id}>
              <ViewRevisionCard
                cloudDocument={cloudDocument}
                revision={revision as any}
              />
            </Grid>
          ))}
        </Grid>
      </AppDrawer>
      <EditDocumentButton handle={handle} />
    </>
  );
}
