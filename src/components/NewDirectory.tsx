"use client";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import * as React from "react";
import { DocumentType } from "@/types";
import { useState } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import {
  Avatar,
  Box,
  Button,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import { CreateNewFolder } from "@mui/icons-material";
import useOnlineStatus from "@/hooks/useOnlineStatus";

const NewDirectory: React.FC<{ 
  parentId?: string; 
  domainId?: string; 
  domainSlug?: string; 
}> = ({ 
  parentId, 
  domainId,
  domainSlug 
}) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const [name, setName] = useState("New Directory");
  const [nameError, setNameError] = useState("");
  const user = useSelector((state) => state.user);
  const isOnline = useOnlineStatus();

  const validateName = () => {
    if (!name.trim()) {
      setNameError("Directory name cannot be empty");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleCreateDirectory = async () => {
    if (!validateName()) return;

    // Create a new directory
    const directoryId = uuidv4();
    const head = uuidv4(); // Even though directories don't use the head, it's required by the schema

    // Create the directory document
    const directoryData = {
      id: directoryId,
      name: name.trim(),
      type: DocumentType.DIRECTORY,
      parentId: parentId || null,
      domainId: domainId || null,
      head,
      sort_order: 0, // Default sort order
      data: {
        root: {
          children: [],
          direction: null,
          format: "left" as
            | "left"
            | "start"
            | "center"
            | "right"
            | "end"
            | "justify"
            | "",
          indent: 0,
          type: "root",
          version: 1,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create locally
    await dispatch(actions.createLocalDocument(directoryData));

    // Save to cloud by default if user is online and authenticated
    // If user is not signed in (not online), no need to do anything different
    if (isOnline && user) {
      await dispatch(actions.createCloudDocument(directoryData));
    }

    // Redirect to the appropriate location
    if (domainSlug) {
      // If creating within a domain, redirect to the domain view
      if (parentId) {
        router.push(`/domains/${domainSlug}/browse/${parentId}`);
      } else {
        router.push(`/domains/${domainSlug}`);
      }
    } else if (parentId) {
      router.push(`/browse/${parentId}`);
    } else {
      router.push("/browse");
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
        }}
      >
        <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56 }}>
          <CreateNewFolder sx={{ fontSize: 32 }} />
        </Avatar>

        <Typography
          variant="h4"
          component="h1"
          align="center"
          gutterBottom
        >
          Create New Directory
        </Typography>

        <Typography
          variant="body1"
          color="text.secondary"
          align="center"
          paragraph
        >
          Enter a name for your new directory
        </Typography>

        <Box sx={{ width: "100%", maxWidth: 500, mt: 2 }}>
          <TextField
            fullWidth
            label="Directory Name"
            variant="outlined"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!nameError}
            helperText={nameError}
            sx={{ mb: 3 }}
            autoFocus
          />

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleCreateDirectory}
            disabled={!name.trim()}
            startIcon={<CreateNewFolder />}
          >
            Create Directory
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default NewDirectory;
