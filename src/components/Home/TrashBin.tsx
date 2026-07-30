"use client";
import React, { useContext, useState } from "react";
import { Box, Fade, Tooltip } from "@mui/material";
import { Trash2 } from "lucide-react";
import { useTheme } from "@mui/material/styles";
import { actions, useDispatch } from "@/store";
import { v4 as uuid } from "uuid";
import { DragContext } from "@/contexts/DragContext";
import { readDragPayload } from "@/lib/dragDrop";
import { Post } from "@/types";
import { FloatingActionButton } from "../Layout/FloatingActionsContainer";
import { useErrorAnnounce } from "@/hooks/useErrorAnnounce";
import { ICON_SIZE } from "@/theme/icons";

const TrashBin: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const errorAnnounce = useErrorAnnounce();
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
      // Acts on the grabbed row only, which is what the prompt below names —
      // a multi-row drag deletes just that one.
      const draggedItem = readDragPayload(e.dataTransfer);
      if (!draggedItem) return;

      // Show confirmation dialog before deleting
      const alert = {
        title: "Delete Document",
        content: `Are you sure you want to delete "${
          draggedItem.name ?? "this document"
        }"?`,
        actions: [
          { label: "Cancel", id: uuid() },
          { label: "Delete", id: uuid() },
        ],
      };

      const response = await dispatch(actions.alert(alert));

      if (response.payload === alert.actions[1].id) {
        // Get the document to delete
        const docResponse = await dispatch(
          actions.getPostById(draggedItem.id),
        );
        const document = docResponse.payload as Post;

        if (!document) return;

        await dispatch(actions.deletePost(draggedItem.id));

        // Show success message
        dispatch(actions.announce({
          message: {
            title: `Deleted ${draggedItem.name ?? "document"}`,
          },
          timeout: 3000,
        }));
      }
    } catch (error) {
      errorAnnounce(
        "Failed to delete item",
        error,
        "An error occurred while deleting the item",
      );
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
                <Trash2
                  size={ICON_SIZE.large}
                  style={{
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
