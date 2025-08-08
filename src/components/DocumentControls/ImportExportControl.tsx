"use client";
import { FC, useCallback, useState } from "react";
import { Box, Button, Tooltip } from "@mui/material";
import { Storage, UploadFile } from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { BackupDocument, Domain } from "@/types";
import { v4 as uuid } from "uuid";
import documentDB, { revisionDB } from "@/indexeddb";
import DomainSelectionDialog from "./DomainSelectionDialog";

type ImportExportControlProps = {
  handleFilesChange?: (
    files: FileList | File[] | null,
    createNewDirectory?: boolean,
    domainId?: string,
  ) => Promise<void>;
  backupFunction?: () => Promise<void>;
};

const ImportExportControl: FC<ImportExportControlProps> = (
  { handleFilesChange, backupFunction },
) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);
  const [domainDialogOpen, setDomainDialogOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // Convert FileList to Array to persist after input reset
      const fileArray = Array.from(files);

      // If user is logged in, show domain selection dialog
      if (user) {
        setPendingFiles(fileArray);
        setDomainDialogOpen(true);
      } else {
        // If not logged in, import directly without domain selection
        if (handleFilesChange) {
          await handleFilesChange(fileArray, true);
        }
      }
      
      // Reset the file input
      e.target.value = '';
    },
    [handleFilesChange, user],
  );

  const handleDomainSelect = useCallback(
    async (domainId: string | null) => {
      setDomainDialogOpen(false);
      
      if (pendingFiles.length > 0 && handleFilesChange) {
        await handleFilesChange(pendingFiles, true, domainId || undefined);
      }
      
      setPendingFiles([]);
    },
    [handleFilesChange, pendingFiles],
  );

  const handleDomainDialogClose = useCallback(() => {
    setDomainDialogOpen(false);
    setPendingFiles([]);
  }, []);

  const handleBackup = useCallback(async () => {
    if (backupFunction) {
      await backupFunction();
    } else {
      try {
        const documents = await documentDB.getAll();
        const revisions = await revisionDB.getAll();
        const data: BackupDocument[] = documents.map((document) => ({
          ...document,
          revisions: revisions.filter((revision) =>
            revision.documentId === document.id &&
            revision.id !== document.head
          ),
        }));

        const blob = new Blob([JSON.stringify(data)], {
          type: "text/json",
        });
        const link = window.document.createElement("a");

        const now = new Date();
        link.download = now.toISOString() + ".me";
        link.href = window.URL.createObjectURL(blob);
        link.dataset.downloadurl = ["text/json", link.download, link.href]
          .join(":");

        const evt = new MouseEvent("click", {
          view: window,
          bubbles: true,
          cancelable: true,
        });

        link.dispatchEvent(evt);
        link.remove();
      } catch (error) {
        dispatch(
          actions.announce({
            message: {
              title: "Backup failed",
              subtitle: "Please try again",
            },
          }),
        );
      }
    }
  }, [backupFunction, dispatch]);

  // Determine button text and tooltip based on whether user is logged in
  const importTooltip = user
    ? "Import files into a new timestamped 'New_Files' directory and assign to a domain"
    : "Import files into a new timestamped 'New_Files' directory";

  return (
    <>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Tooltip title={importTooltip}>
          <Button
            variant="outlined"
            sx={{ px: 1, "& .MuiButton-startIcon": { ml: 0 } }}
            startIcon={<UploadFile />}
            component="label"
          >
            Import
            <input
              type="file"
              hidden
              accept=".me"
              multiple
              onChange={handleFileUpload}
            />
          </Button>
        </Tooltip>
        <Tooltip title="Backup all documents to a .me file">
          <Button
            variant="outlined"
            sx={{ px: 1, "& .MuiButton-startIcon": { ml: 0 } }}
            startIcon={<Storage />}
            onClick={handleBackup}
          >
            Backup
          </Button>
        </Tooltip>
      </Box>
      
      <DomainSelectionDialog
        open={domainDialogOpen}
        onClose={handleDomainDialogClose}
        onConfirm={handleDomainSelect}
        fileCount={pendingFiles.length}
      />
    </>
  );
};

export default ImportExportControl;
