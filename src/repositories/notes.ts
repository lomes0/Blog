import { prisma } from "@/lib/prisma";
import { Note, NotesCanvas } from "@/types/notes";

// Canvas operations

export async function createCanvas(
  authorId: string,
  name: string = "My Notes",
): Promise<NotesCanvas> {
  const canvas = await prisma.notesCanvas.create({
    data: {
      authorId,
      name,
    },
    include: {
      notes: true,
    },
  });

  return mapCanvasFromPrisma(canvas);
}

export async function findCanvasByAuthorId(
  authorId: string,
): Promise<NotesCanvas[]> {
  const canvases = await prisma.notesCanvas.findMany({
    where: { authorId },
    include: {
      notes: {
        orderBy: { zIndex: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return canvases.map(mapCanvasFromPrisma);
}

export async function findCanvasById(id: string): Promise<NotesCanvas | null> {
  const canvas = await prisma.notesCanvas.findUnique({
    where: { id },
    include: {
      notes: {
        orderBy: { zIndex: "asc" },
      },
    },
  });

  if (!canvas) return null;
  return mapCanvasFromPrisma(canvas);
}

export async function updateCanvas(
  id: string,
  data: { name?: string },
): Promise<NotesCanvas> {
  const canvas = await prisma.notesCanvas.update({
    where: { id },
    data,
    include: {
      notes: {
        orderBy: { zIndex: "asc" },
      },
    },
  });

  return mapCanvasFromPrisma(canvas);
}

export async function deleteCanvas(id: string): Promise<void> {
  await prisma.notesCanvas.delete({
    where: { id },
  });
}

// Get or create default canvas for a user
export async function getOrCreateDefaultCanvas(
  authorId: string,
): Promise<NotesCanvas> {
  const canvases = await findCanvasByAuthorId(authorId);

  if (canvases.length > 0) {
    return canvases[0]; // Return the first (oldest) canvas as default
  }

  // Create default canvas if none exists
  return createCanvas(authorId, "Default");
}

// Note operations

export interface CreateNoteInput {
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  title?: string;
  content: string;
  color?: string;
  zIndex?: number;
}

export async function createNote(noteData: CreateNoteInput): Promise<Note> {
  const note = await prisma.note.create({
    data: {
      canvasId: noteData.canvasId,
      positionX: noteData.positionX,
      positionY: noteData.positionY,
      width: noteData.width,
      height: noteData.height,
      title: noteData.title,
      content: noteData.content,
      color: noteData.color || "#FFD700",
      zIndex: noteData.zIndex ?? 0,
    },
  });

  return mapNoteFromPrisma(note);
}

export async function findNotesByCanvasId(canvasId: string): Promise<Note[]> {
  const notes = await prisma.note.findMany({
    where: { canvasId },
    orderBy: { zIndex: "asc" },
  });

  return notes.map(mapNoteFromPrisma);
}

export async function findNoteById(id: string): Promise<Note | null> {
  const note = await prisma.note.findUnique({
    where: { id },
  });

  if (!note) return null;
  return mapNoteFromPrisma(note);
}

export interface UpdateNoteInput {
  positionX?: number;
  positionY?: number;
  width?: number;
  height?: number;
  title?: string;
  content?: string;
  color?: string;
  zIndex?: number;
}

export async function updateNote(
  id: string,
  updates: UpdateNoteInput,
): Promise<Note> {
  const note = await prisma.note.update({
    where: { id },
    data: updates,
  });

  return mapNoteFromPrisma(note);
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.note.delete({
    where: { id },
  });
}

export async function bringNoteToFront(
  noteId: string,
  canvasId: string,
): Promise<Note> {
  // Get the maximum zIndex for this canvas
  const result = await prisma.note.aggregate({
    where: { canvasId },
    _max: { zIndex: true },
  });

  const maxZIndex = result._max.zIndex ?? 0;
  const newZIndex = maxZIndex + 1;

  return updateNote(noteId, { zIndex: newZIndex });
}

// Mapping functions to convert Prisma types to application types

function mapNoteFromPrisma(
  prismaNote: {
    id: string;
    canvasId: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    title: string | null;
    content: string;
    color: string;
    zIndex: number;
    createdAt: Date;
    updatedAt: Date;
  },
): Note {
  return {
    id: prismaNote.id,
    canvasId: prismaNote.canvasId,
    position: {
      x: prismaNote.positionX,
      y: prismaNote.positionY,
    },
    size: {
      width: prismaNote.width,
      height: prismaNote.height,
    },
    title: prismaNote.title || undefined,
    content: prismaNote.content,
    color: prismaNote.color,
    zIndex: prismaNote.zIndex,
    createdAt: prismaNote.createdAt.getTime(),
    updatedAt: prismaNote.updatedAt.getTime(),
  };
}

function mapCanvasFromPrisma(
  prismaCanvas: {
    id: string;
    name: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    notes: Array<{
      id: string;
      canvasId: string;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
      title: string | null;
      content: string;
      color: string;
      zIndex: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  },
): NotesCanvas {
  return {
    id: prismaCanvas.id,
    authorId: prismaCanvas.authorId,
    name: prismaCanvas.name,
    notes: prismaCanvas.notes.map(mapNoteFromPrisma),
    createdAt: prismaCanvas.createdAt.getTime(),
    updatedAt: prismaCanvas.updatedAt.getTime(),
  };
}
