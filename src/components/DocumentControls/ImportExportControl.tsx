"use client";
import { FC, useCallback } from "react";
import { Box, Button, Tooltip } from "@mui/material";
import { Storage, UploadFile } from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { BackupDocument, DocumentType } from "@/types";
import { v4 as uuid } from "uuid";
import documentDB, { revisionDB } from "@/indexeddb";

type ImportExportControlProps = {
  handleFilesChange?: (
    files: FileList | File[] | null,
    createNewDirectory?: boolean,
  ) => Promise<void>;
  backupFunction?: () => Promise<void>;
};

const ImportExportControl: FC<ImportExportControlProps> = (
  { handleFilesChange, backupFunction },
) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // Convert FileList to Array to persist after input reset
      const fileArray = Array.from(files);

      // Import files directly as posts
      if (handleFilesChange) {
        await handleFilesChange(fileArray, true);
      } else {
        // Default import logic for blog posts
        for (const file of fileArray) {
          if (file.type === "application/json" || file.name.endsWith(".me")) {
            try {
              const text = await file.text();
              const data: BackupDocument[] = JSON.parse(text);
              
              for (const document of data) {
                // Create new document as a blog post
                const newDocument = {
                  ...document,
                  id: uuid(),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  // Ensure it's created as a post (not directory)
                  type: DocumentType.DOCUMENT,
                };
                
                await documentDB.add(newDocument);
                dispatch(actions.loadLocalDocuments());
              }
            } catch (error) {
              dispatch(
                actions.announce({
                  message: {
                    title: "Import failed",
                    subtitle: "Please check the file format and try again",
                  },
                }),
              );
            }
          }
        }
      }
      
      // Reset the file input
      e.target.value = '';
    },
    [handleFilesChange, user, dispatch],
  );

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

  return (
    <Box sx={{ display: "flex", gap: 0.5 }}>
      <Tooltip title="Import blog posts from .me backup files">
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
      <Tooltip title="Backup all posts to a .me file">
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
  );
};

export default ImportExportControl;
