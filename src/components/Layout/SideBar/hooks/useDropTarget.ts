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
  targetType: "domain" | "directory" | "root";
  domainId?: string | null;
  onDropComplete?: () => void;
}

interface DropData {
  id: string;
  name: string;
  type: "DOCUMENT" | "DIRECTORY";
}

/**
 * Custom hook for handling drag and drop targets in the sidebar
 * Provides drag event handlers and visual feedback state
 */
export const useDropTarget = ({ targetId, targetType, domainId, onDropComplete }: DropTargetOptions) => {
  const dispatch = useDispatch();
  const [dropTargetState, setDropTargetState] = useState<DropTargetState>({
    isDropTarget: false,
    dragEnterCount: 0,
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Check if the dragged data is a matheditor document
    const hasValidData = e.dataTransfer.types.includes("application/matheditor-document");
    if (hasValidData) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const hasValidData = e.dataTransfer.types.includes("application/matheditor-document");
    if (hasValidData) {
      e.preventDefault();
      setDropTargetState(prev => ({
        isDropTarget: true,
        dragEnterCount: prev.dragEnterCount + 1,
      }));
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetState(prev => {
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
      const draggedDocResponse = await dispatch(actions.getDocumentById(draggedItem.id));
      const draggedDoc = draggedDocResponse.payload as UserDocument;

      if (!draggedDoc) return;

      // Determine the new parent ID and domain ID based on target type
      let newParentId: string | null = null;
      let newDomainId: string | null | undefined = null;

      switch (targetType) {
        case "domain":
          // For domains, set parentId to null (root level of domain) and update domainId
          newParentId = null;
          newDomainId = domainId || null;
          break;
        case "directory":
          // For directories, set parentId to the directory ID, keep existing domainId
          newParentId = targetId || null;
          newDomainId = undefined; // Don't change domainId for directory moves
          break;
        case "root":
          // For root, set parentId to null and clear domainId
          newParentId = null;
          newDomainId = null;
          break;
      }

      // Update the document's parentId and domainId
      const updatePromises = [];

      if (draggedDoc.local) {
        const partial: any = { parentId: newParentId };
        if (newDomainId !== undefined) {
          partial.domainId = newDomainId;
        }
        updatePromises.push(
          dispatch(actions.updateLocalDocument({
            id: draggedItem.id,
            partial,
          }))
        );
      }

      if (draggedDoc.cloud) {
        const partial: any = { parentId: newParentId };
        if (newDomainId !== undefined) {
          partial.domainId = newDomainId;
        }
        updatePromises.push(
          dispatch(actions.updateCloudDocument({
            id: draggedItem.id,
            partial,
          }))
        );
      }

      await Promise.all(updatePromises);

      // Show success message
      const targetName = targetType === "domain" 
        ? "domain root" 
        : targetType === "directory" 
        ? "directory" 
        : "root";

      dispatch(actions.announce({
        message: {
          title: `Moved ${draggedItem.name} to ${targetName}`,
        },
        timeout: 3000,
      }));

      // Dispatch custom event for other components to react
      const movedEvent = new CustomEvent("document-moved", {
        detail: { documentId: draggedItem.id },
      });
      window.dispatchEvent(movedEvent);

      // Call completion callback
      onDropComplete?.();

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
  }, [targetId, targetType, domainId, dispatch, onDropComplete]);

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
