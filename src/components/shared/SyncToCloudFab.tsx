"use client";
import { CloudUpload } from "lucide-react";
import { Fab, Tooltip } from "@mui/material";
import { actions, documentsSelectors, useDispatch, useSelector } from "@/store";
import { useRouter } from "next/navigation";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";

/**
 * Floating action button that appears on the /view/<id> page
 * when the document's local version is ahead of the cloud version.
 * Clicking it syncs local → cloud.
 */
const SyncToCloudFab: React.FC<{ documentId: string }> = ({ documentId }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const userDocument = useSelector((state) =>
    documentsSelectors.selectById(state, documentId)
  );

  const isDirty = Boolean(userDocument?.local) &&
    Boolean(userDocument?.cloud) &&
    userDocument!.local!.head !== userDocument!.cloud!.head;

  const handleSync = async () => {
    if (!userDocument?.local) return;
    try {
      await dispatch(
        actions.syncLocalToCloud({
          id: documentId,
          localHead: userDocument.local.head,
          updatedAt: userDocument.local.updatedAt,
          parentId: userDocument.local.parentId,
        }),
      ).unwrap();
      router.refresh();
    } catch {
      // Sync failed — error is already announced by the thunk
    }
  };

  if (!isDirty) return null;

  return (
    <FloatingActionButton id="sync-to-cloud" priority={5}>
      <Tooltip title="Save to cloud" placement="left">
        <Fab
          size="medium"
          aria-label="save to cloud"
          onClick={handleSync}
          sx={{
            displayPrint: "none",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            boxShadow: 3,
            "&:hover": {
              bgcolor: "primary.dark",
              boxShadow: 5,
            },
          }}
        >
          <CloudUpload />
        </Fab>
      </Tooltip>
    </FloatingActionButton>
  );
};

export default SyncToCloudFab;
