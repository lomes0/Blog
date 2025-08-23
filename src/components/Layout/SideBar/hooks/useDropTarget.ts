"use client";
import { useCallback, useState } from "react";
import { actions, useDispatch } from "@/store";
import { UserDocument } from "@/types";

interface DropTargetState {
  isDropTarget: boolean;
  dragEnterCount: number;
}

interface DropTargetOptions {
  targetId?: string | null;
  targetType: "series" | "root";
  onDropComplete?: () => void;
}

interface DropData {
  id: string;
  name: string;
  type: "DOCUMENT";
}

/**
 * Custom hook for handling drag and drop targets in the sidebar
 * Simplified for blog structure - only supports posts and series
 */
export const useDropTarget = (
  { targetId, targetType, onDropComplete }: DropTargetOptions,
) => {
  const dispatch = useDispatch();
  const [dropTargetState, setDropTargetState] = useState<DropTargetState>({
    isDropTarget: false,
    dragEnterCount: 0,
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Check if the dragged data is a matheditor document (post)
    const hasValidData = e.dataTransfer.types.includes(
      "application/matheditor-document",
    );
    if (hasValidData) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const hasValidData = e.dataTransfer.types.includes(
      "application/matheditor-document",
    );
    if (hasValidData) {
      e.preventDefault();
      setDropTargetState((prev) => ({
        isDropTarget: true,
        dragEnterCount: prev.dragEnterCount + 1,
      }));
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetState((prev) => {
      const newCount = prev.dragEnterCount - 1;
      return {
        isDropTarget: newCount > 0,
        dragEnterCount: newCount,
      };
    });
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetState({ isDropTarget: false, dragEnterCount: 0 });

    try {
      const data = e.dataTransfer.getData("application/matheditor-document");
      if (!data) return;

      const draggedItem: DropData = JSON.parse(data);

      // Don't allow dropping an item onto itself
      if (draggedItem.id === targetId) {
        return;
      }

      // Find the dragged document in the store
      const draggedDocResponse = await dispatch(
        actions.getDocumentById(draggedItem.id),
      );
      const draggedDoc = draggedDocResponse.payload as UserDocument;

      if (!draggedDoc) return;

      // For blog structure: determine series assignment
      let newSeriesId: string | null = null;

      switch (targetType) {
        case "series":
          // Add post to series
          newSeriesId = targetId || null;
          break;
        case "root":
          // Remove post from series
          newSeriesId = null;
          break;
      }

      // Update the document's series assignment
      const updatePromises = [];

      if (draggedDoc.local) {
        updatePromises.push(
          dispatch(actions.updateLocalDocument({
            id: draggedItem.id,
            partial: { seriesId: newSeriesId },
          })),
        );
      }

      if (draggedDoc.cloud) {
        updatePromises.push(
          dispatch(actions.updateCloudDocument({
            id: draggedItem.id,
            partial: { seriesId: newSeriesId },
          })),
        );
      }

      await Promise.all(updatePromises);

      // Show success message
      const targetName = targetType === "series" ? "series" : "posts";
      dispatch(actions.announce({
        message: {
          title: "Post moved successfully",
          subtitle: `"${draggedItem.name}" has been moved to ${targetName}`,
        },
      }));

      onDropComplete?.();
    } catch (error) {
      console.error("Drop operation failed:", error);
      dispatch(actions.announce({
        message: {
          title: "Move failed",
          subtitle: "Failed to move the post. Please try again.",
        },
      }));
    }
  }, [targetId, targetType, dispatch, onDropComplete]);

  return {
    isDropTarget: dropTargetState.isDropTarget,
    dragHandlers: {
      onDragOver: handleDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
};
