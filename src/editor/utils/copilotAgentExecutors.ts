/**
 * Client-side executors for the Copilot content-agent tools.
 *
 * The tools are declared on the server route but run here, in the browser,
 * because that's the only place all content (local + cloud metadata) and the
 * live editor exist. Read tools return JSON that flows back into the agent
 * loop; write tools are applied only after the user accepts the proposal.
 */
import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { v4 as uuidv4 } from "uuid";
import { documentsSelectors, store } from "@/store";
import { createLocalDocument, updateLocalDocument } from "@/store/app";
import type { DocumentCreateInput, UserDocument } from "@/types";
import {
  markdownToSerializedState,
  serializedStateToMarkdown,
} from "./markdownBridge";
import {
  listDocuments,
  readDocument,
  resolveDocId,
  searchDocuments,
} from "./virtualRepo";

const getDocs = (): UserDocument[] =>
  documentsSelectors.selectAll(store.getState());

const currentMarkdown = (editor: LexicalEditor | null): string => {
  if (!editor) return "";
  const data = editor.getEditorState().toJSON() as SerializedEditorState;
  return serializedStateToMarkdown(data);
};

export interface WriteResult {
  ok: boolean;
  message: string;
}

/** Execute a read-only tool. Returns a JSON-serializable result. */
export function runReadTool(
  name: string,
  input: Record<string, unknown>,
  editor: LexicalEditor | null,
): unknown {
  switch (name) {
    case "list_documents":
      return { documents: listDocuments(getDocs()) };
    case "search_documents":
      return {
        hits: searchDocuments(getDocs(), String(input.query ?? "")),
      };
    case "read_document":
      return readDocument(getDocs(), String(input.path ?? ""));
    case "read_current_document":
      return { markdown: currentMarkdown(editor) };
    case "get_selection": {
      if (!editor) return { selection: "" };
      const selection = editor.getEditorState().read(() => {
        const sel = $getSelection();
        return $isRangeSelection(sel) ? sel.getTextContent() : "";
      });
      return { selection };
    }
    default:
      return { error: `Unknown read tool: ${name}` };
  }
}

/** Persist a new SerializedEditorState for a document (open doc or otherwise). */
async function persist(
  docId: string,
  data: SerializedEditorState,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<void> {
  // The open document updates through the live editor so the view reflects the
  // change immediately (SavePlugin then persists it). Other posts patch through
  // the store/IndexedDB directly.
  if (editor && docId === currentDocId) {
    editor.setEditorState(editor.parseEditorState(data));
    return;
  }
  await store.dispatch(updateLocalDocument({ id: docId, partial: { data } }));
}

/** Apply an accepted write proposal. */
export async function applyWrite(
  name: string,
  input: Record<string, unknown>,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<WriteResult> {
  const docs = getDocs();

  if (name === "create_document") {
    const title = String(input.title ?? "Untitled");
    const markdown = String(input.markdown ?? "");
    const now = new Date().toISOString();
    const payload: DocumentCreateInput = {
      id: uuidv4(),
      head: uuidv4(),
      name: title,
      data: markdownToSerializedState(markdown),
      type: "DOCUMENT",
      parentId: null,
      createdAt: now,
      updatedAt: now,
    };
    await store.dispatch(createLocalDocument(payload));
    return { ok: true, message: `Created "${title}"` };
  }

  const path = String(input.path ?? "");
  const docId = resolveDocId(docs, path);
  if (!docId) return { ok: false, message: `No document at ${path}` };

  // Base markdown: live editor for the open doc, else the stored body.
  const isOpen = editor != null && docId === currentDocId;
  const baseMd = isOpen
    ? currentMarkdown(editor)
    : readDocument(docs, path).markdown;

  let nextMd: string;
  if (name === "edit_document") {
    const oldText = String(input.old_text ?? "");
    const newText = String(input.new_text ?? "");
    if (!oldText || !baseMd.includes(oldText)) {
      return {
        ok: false,
        message: "old_text not found in the document — nothing changed.",
      };
    }
    nextMd = baseMd.replace(oldText, newText);
  } else if (name === "write_document") {
    nextMd = String(input.markdown ?? "");
  } else {
    return { ok: false, message: `Unknown write tool: ${name}` };
  }

  const data = markdownToSerializedState(nextMd);
  await persist(docId, data, editor, currentDocId);
  return { ok: true, message: `Updated ${path}` };
}
