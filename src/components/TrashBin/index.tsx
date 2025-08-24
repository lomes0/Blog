"use client";
import React, { useContext, useState } from "react";
import { Box, Fade, Tooltip } from "@mui/material";
import { DeleteForever } from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { actions, useDispatch } from "@/store";
import { v4 as uuid } from "uuid";
import { DragContext } from "../DragContext";
import { UserDocument } from "@/types";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";

const TrashBin: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const { isDragging } = useContext(DragContext);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDropTarget(false);

    try {
      const data = e.dataTransfer.getData("application/matheditor-document");
      if (!data) return;

      const draggedItem = JSON.parse(data);

      // Show confirmation dialog before deleting
      const alert = {
        title: "Delete Document",
        content: `Are you sure you want to delete "${draggedItem.name}"?`,
        actions: [
          { label: "Cancel", id: uuid() },
          { label: "Delete", id: uuid() },
        ],
      };

      const response = await dispatch(actions.alert(alert));

      if (response.payload === alert.actions[1].id) {
        // Get the document to delete
        const docResponse = await dispatch(
          actions.getDocumentById(draggedItem.id),
        );
        const document = docResponse.payload as UserDocument;

        if (!document) return;

        // Delete local and/or cloud document
        if (document.local) {
          await dispatch(actions.deleteLocalDocument(draggedItem.id));
        }

        if (document.cloud) {
          await dispatch(actions.deleteCloudDocument(draggedItem.id));
        }

        // Show success message
        dispatch(actions.announce({
          message: {
            title: `Deleted ${draggedItem.name}`,
          },
          timeout: 3000,
        }));
      }
    } catch (error) {
      console.error("Error during deletion:", error);
      dispatch(actions.announce({
        message: {
          title: "Failed to delete item",
          subtitle: "An error occurred while deleting the item",
        },
        timeout: 3000,
      }));
    }
  };

  return (
    <>
      {isDragging && (
        <FloatingActionButton id="trash-bin" priority={35}>
          <Fade in={isDragging} timeout={300}>
            <Tooltip title="Drop here to delete" arrow placement="top">
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "white",
                  transition: theme.transitions.create(
                    ["transform", "box-shadow"],
                    {
                      duration: 200,
                    },
                  ),
                  transform: isDropTarget ? "scale(1.1)" : "scale(1)",
                  boxShadow: isDropTarget
                    ? "0 4px 12px rgba(0,0,0,0.2)"
                    : "0 2px 10px rgba(0,0,0,0.1)",
                  cursor: "default",
                }}
              >
                <DeleteForever
                  sx={{
                    fontSize: 32, // Smaller icon size
                    color: isDropTarget
                      ? theme.palette.error.dark
                      : theme.palette.error.main,
                    transition: theme.transitions.create("color", {
                      duration: 200,
                    }),
                    filter: isDropTarget
                      ? "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
                      : "none",
                  }}
                />
              </Box>
            </Tooltip>
          </Fade>
        </FloatingActionButton>
      )}
    </>
  );
};

export default TrashBin;
