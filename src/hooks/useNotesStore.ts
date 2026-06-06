"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Note, NotesCanvas } from "@/types/notes";
import { useSession } from "next-auth/react";

const API_BASE = "/api/notes";

// Debounce helper for frequent updates
function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function useNotesStore(canvasId: string | null) {
  const { data: _session, status } = useSession();
  const [canvas, setCanvas] = useState<NotesCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch canvas from API
  const fetchCanvas = useCallback(async () => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setLoading(false);
      setError("Please sign in to use notes");
      return;
    }
    if (!canvasId) {
      // Authenticated but canvasId not yet set (boards still loading)
      return;
    }

    try {
      setLoading(true);
      setCanvas(null);
      setError(null);
      const response = await fetch(`${API_BASE}/canvas/${canvasId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.subtitle || "Failed to fetch canvas");
      }

      setCanvas(data.data);
    } catch (err) {
      console.error("Error fetching canvas:", err);
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
  }, [status, canvasId]);

  // Initial load
  useEffect(() => {
    fetchCanvas();
  }, [fetchCanvas]);

  const refresh = useCallback(async () => {
    await fetchCanvas();
  }, [fetchCanvas]);

  const addNote = useCallback(
    async (note: Omit<Note, "id" | "createdAt" | "updatedAt" | "canvasId">) => {
      if (!canvas || !canvasId) return;

      // Optimistic update
      const optimisticNote: Note = {
        ...note,
        canvasId,
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: [...prev.notes, optimisticNote],
        };
      });

      try {
        const response = await fetch(API_BASE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            canvasId,
            positionX: note.position.x,
            positionY: note.position.y,
            width: note.size.width,
            height: note.size.height,
            title: note.title,
            content: note.content,
            color: note.color,
            zIndex: note.zIndex,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.subtitle || "Failed to create note");
        }

        // Replace optimistic note with real one
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === optimisticNote.id ? data.data : n
            ),
          };
        });
      } catch (err) {
        console.error("Error creating note:", err);
        // Rollback optimistic update
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notes: prev.notes.filter((n) => n.id !== optimisticNote.id),
          };
        });
        setError(err instanceof Error ? err.message : "Failed to create note");
      }
    },
    [canvas, canvasId],
  );

  // Debounced update for frequent changes (drag, resize)
  const debouncedApiUpdate = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [id, updates] = args as [string, Record<string, unknown>];
        try {
          const response = await fetch(`${API_BASE}/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.subtitle || "Failed to update note");
          }
        } catch (err) {
          console.error("Error updating note:", err);
          setError(
            err instanceof Error ? err.message : "Failed to update note",
          );
          // Refresh to get latest state from server
          refresh();
        }
      }, 500),
    [refresh],
  );

  const updateNote = useCallback(
    async (id: string, updates: Partial<Note>) => {
      if (!canvas) return;

      // Optimistic update
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.map((note) =>
            note.id === id
              ? { ...note, ...updates, updatedAt: Date.now() }
              : note
          ),
        };
      });

      // Prepare API updates
      const apiUpdates: Record<string, unknown> = {};
      if (updates.position) {
        apiUpdates.positionX = updates.position.x;
        apiUpdates.positionY = updates.position.y;
      }
      if (updates.size) {
        apiUpdates.width = updates.size.width;
        apiUpdates.height = updates.size.height;
      }
      if (updates.title !== undefined) apiUpdates.title = updates.title;
      if (updates.content !== undefined) apiUpdates.content = updates.content;
      if (updates.color !== undefined) apiUpdates.color = updates.color;
      if (updates.zIndex !== undefined) apiUpdates.zIndex = updates.zIndex;

      // Use debounced update for frequent changes
      if (updates.position || updates.size) {
        debouncedApiUpdate(id, apiUpdates);
      } else {
        // Immediate update for content/color changes
        try {
          const response = await fetch(`${API_BASE}/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiUpdates),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error?.subtitle || "Failed to update note");
          }

          // The optimistic update already applied these changes locally. Do not
          // replace the note with the server response here: a position drag is
          // only persisted via a debounced PATCH, so the server copy can still
          // hold a stale position and clobber what the user just dragged to.
        } catch (err) {
          console.error("Error updating note:", err);
          setError(
            err instanceof Error ? err.message : "Failed to update note",
          );
          // Refresh to get latest state from server
          refresh();
        }
      }
    },
    [canvas, debouncedApiUpdate, refresh],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      if (!canvas) return;

      // Store for potential rollback
      const previousNotes = canvas.notes;

      // Optimistic update
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.filter((note) => note.id !== id),
        };
      });

      try {
        const response = await fetch(`${API_BASE}/${id}`, {
          method: "DELETE",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.subtitle || "Failed to delete note");
        }
      } catch (err) {
        console.error("Error deleting note:", err);
        // Rollback optimistic update
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notes: previousNotes,
          };
        });
        setError(err instanceof Error ? err.message : "Failed to delete note");
      }
    },
    [canvas],
  );

  const bringToFront = useCallback(
    async (id: string) => {
      if (!canvas) return;

      // Optimistic update
      const maxZIndex = Math.max(...canvas.notes.map((n) => n.zIndex), 0);
      setCanvas((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notes: prev.notes.map((note) =>
            note.id === id ? { ...note, zIndex: maxZIndex + 1 } : note
          ),
        };
      });

      try {
        const response = await fetch(`${API_BASE}/${id}/bring-to-front`, {
          method: "POST",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.subtitle || "Failed to reorder note");
        }

        // Only adopt the server's zIndex. Never replace the whole note here:
        // bring-to-front fires on mousedown, and its response can arrive after
        // a drag completes. Since the dragged position is only persisted via a
        // debounced PATCH, the server copy still holds the pre-drag position —
        // overwriting it would make the note jump back on release.
        setCanvas((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === id ? { ...n, zIndex: data.data.zIndex } : n
            ),
          };
        });
      } catch (err) {
        console.error("Error bringing note to front:", err);
        setError(err instanceof Error ? err.message : "Failed to reorder note");
        // Refresh to get latest state from server
        refresh();
      }
    },
    [canvas, refresh],
  );

  return {
    canvas,
    loading,
    error,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    refresh,
  };
}
