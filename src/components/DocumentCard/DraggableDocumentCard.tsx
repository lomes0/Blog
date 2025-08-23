"use client";
import React, { useCallback, useContext, useRef, useState } from "react";
import { DocumentType, User, UserDocument } from "@/types";
import { Box, SxProps, useMediaQuery } from "@mui/material";
import { Theme, useTheme } from "@mui/material/styles";
import DocumentCard from "./index";
import { actions, useDispatch, useSelector } from "@/store";
import { DragContext } from "../DragContext";

interface DraggableDocumentCardProps {
  userDocument: UserDocument;
  user?: User;
  sx?: SxProps<Theme> | undefined;
  onMoveComplete?: () => void;
}

const DraggableDocumentCard: React.FC<DraggableDocumentCardProps> = ({
  userDocument,
  user,
  sx,
  onMoveComplete,
}) => {
  const dispatch = useDispatch();
  const theme = useTheme();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [dragEnterCount, setDragEnterCount] = useState(0); // Fix drag leave issues
  const cardRef = useRef<HTMLDivElement>(null);
  const documents = useSelector((state) => state.documents);
  const { setIsDragging: setGlobalDragging } = useContext(DragContext);

  const document = userDocument?.local || userDocument?.cloud;

  // Since we only have posts now, no documents can be drop targets
  const canBeDropTarget = false;

  // Improved drag start with better accessibility
  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Set the drag data (document id and type)
    e.dataTransfer.setData(
      "application/matheditor-document",
      JSON.stringify({
        id: userDocument.id,
        name: document?.name,
        type: document?.type,
      }),
    );

    // Create a custom drag image if needed
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(
        cardRef.current,
        rect.width / 2,
        rect.height / 2,
      );
    }

    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
    setGlobalDragging(true);

    // Announce drag start for screen readers
    const announcement = document?.name
      ? `Started dragging ${document.name}`
      : "Started dragging document";

    // Create a temporary live region for announcements
    const liveRegion = globalThis.document?.createElement("div");
    if (liveRegion) {
      liveRegion.setAttribute("aria-live", "assertive");
      liveRegion.setAttribute("aria-atomic", "true");
      liveRegion.style.position = "absolute";
      liveRegion.style.left = "-10000px";
      liveRegion.textContent = announcement;
      globalThis.document?.body.appendChild(liveRegion);

      setTimeout(() => {
        if (globalThis.document?.body.contains(liveRegion)) {
          globalThis.document.body.removeChild(liveRegion);
        }
      }, 1000);
    }
  }, [userDocument.id, document?.name, document?.type, setGlobalDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setGlobalDragging(false);
    setIsDropTarget(false);
    setDragEnterCount(0);
  }, [setGlobalDragging]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only allow dropping into directories
    if (canBeDropTarget) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, [canBeDropTarget]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (canBeDropTarget) {
      e.preventDefault();
      setDragEnterCount((prev) => prev + 1);
      setIsDropTarget(true);
    }
  }, [canBeDropTarget]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (canBeDropTarget) {
      setDragEnterCount((prev) => {
        const newCount = prev - 1;
        if (newCount === 0) {
          setIsDropTarget(false);
        }
        return newCount;
      });
    }
  }, [canBeDropTarget]);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDropTarget(false);

    // Only process drops if this is a directory
    if (!canBeDropTarget) return;

    try {
      const data = e.dataTransfer.getData(
        "application/matheditor-document",
      );
      if (!data) return;

      const draggedItem = JSON.parse(data);

      // Don't allow dropping an item into itself
      if (draggedItem.id === userDocument.id) {
        return;
      }

      // Find the dragged document in the store using getDocumentById
      const draggedDocResponse = await dispatch(
        actions.getDocumentById(draggedItem.id),
      );
      const draggedDoc = draggedDocResponse.payload as UserDocument;

      if (!draggedDoc) return;

      // Update the document's parentId to the current directory's id
      if (draggedDoc.local) {
        await dispatch(actions.updateLocalDocument({
          id: draggedItem.id,
          partial: {
            parentId: userDocument.id,
          },
        }));
      }

      if (draggedDoc.cloud) {
        await dispatch(actions.updateCloudDocument({
          id: draggedItem.id,
          partial: {
            parentId: userDocument.id,
          },
        }));
      }

      // Show a success message
      dispatch(actions.announce({
        message: {
          title: `Moved ${draggedItem.name} to ${document?.name}`,
        },
        timeout: 3000,
      }));

      // Dispatch custom event so other components can react
      const movedEvent = new CustomEvent("document-moved", {
        detail: { documentId: draggedItem.id },
      });
      window.dispatchEvent(movedEvent);

      // Call onMoveComplete callback if provided
      if (onMoveComplete) {
        onMoveComplete();
      }
    } catch (error) {
      console.error("Error during drop:", error);
      dispatch(actions.announce({
        message: {
          title: "Failed to move item",
          subtitle: "An error occurred while moving the item",
        },
        timeout: 3000,
      }));
    }
  };

  return (
    <Box
      ref={cardRef}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label={document?.name
        ? `Draggable ${document.name}. Press space to start dragging.`
        : undefined}
      sx={{
        cursor: "grab",
        "&:active": {
          cursor: "grabbing",
        },
        transition: prefersReducedMotion ? "none" : theme.transitions.create([
          "transform",
          "box-shadow",
          "border",
          "opacity",
          "background-color",
        ], {
          duration: theme.transitions.duration.standard,
          easing: theme.transitions.easing.easeInOut,
        }),
        transform: isDragging ? "scale(0.98)" : "scale(1)", // Subtle scale instead of aggressive
        opacity: isDragging ? 0.8 : 1, // Less dramatic opacity change
        position: "relative",
        // Improved drop target indication
        "&::before": canBeDropTarget && isDropTarget
          ? {
            content: '""',
            position: "absolute",
            top: -2,
            left: -2,
            right: -2,
            bottom: -2,
            zIndex: 1,
            borderRadius: theme.shape.borderRadius + 2,
            border: `3px solid ${theme.palette.primary.main}`,
            backgroundColor: `${theme.palette.primary.main}15`, // More subtle background
            pointerEvents: "none",
            transition: prefersReducedMotion
              ? "none"
              : theme.transitions.create([
                "border",
                "background-color",
              ], {
                duration: theme.transitions.duration.short,
                easing: theme.transitions.easing.easeInOut,
              }),
          }
          : {},
        // Focus styles for keyboard navigation
        "&:focus-visible": {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: 2,
        },
        // High contrast mode support
        "@media (prefers-contrast: high)": {
          border: isDragging
            ? `2px solid ${theme.palette.primary.main}`
            : "none",
        },
      }}
    >
      <DocumentCard
        userDocument={userDocument}
        user={user}
        sx={{
          ...sx,
          // Improved hover states with reduced motion support
          "&:hover": !prefersReducedMotion
            ? {
              boxShadow: theme.shadows[4],
              transform: "translateY(-2px)",
            }
            : {
              boxShadow: theme.shadows[2],
            },
          // Ensure consistent transition timing
          transition: prefersReducedMotion ? "none" : theme.transitions.create([
            "transform",
            "box-shadow",
            "border-color",
            "background-color",
          ], {
            duration: theme.transitions.duration.short,
            easing: theme.transitions.easing.easeInOut,
          }),
        }}
      />
    </Box>
  );
};

export default DraggableDocumentCard;
