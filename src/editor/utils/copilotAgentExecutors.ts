/**
 * Client-side executors for the Copilot content-agent tools.
 *
 * The tools are declared on the server route but run here, in the browser,
 * because that's the only place all content (local IndexedDB + cloud metadata)
 * and the live editor exist. Read tools return JSON that flows back into the
 * agent loop; write tools are applied only after the user accepts the proposal.
 *
 * ### What changed in phase 4
 *
 * This used to flatten a document to Markdown, do a string replace, and rebuild
 * the whole tree from the result — with rich nodes smuggled through as opaque
 * `[[lexblk:…]]` base64 so they survived. That preserved them, but the agent
 * could not *see* into one or author one, and every edit rewrote the entire
 * document.
 *
 * Now it addresses blocks through `src/lib/content-bridge`
 * (docs/plans/claude-code-lexical.md): reads hand out addresses and a
 * `stateHash`, writes name blocks, and only the named nodes are touched.
 *
 * The `stateHash` guard matters more here than over MCP, because the document
 * being edited is usually the one on screen. If the user typed between the
 * agent reading and the user accepting, the addresses may no longer point where
 * they did — so the write is refused with something actionable rather than
 * applied to the wrong block.
 */
import {
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type SerializedEditorState,
} from "lexical";
import { v4 as uuidv4 } from "uuid";
import { apiClient } from "@/api";
import { postsSelectors, store } from "@/store";
import { createPost, updatePost } from "@/store/app";
import type { CommandContext } from "@/commands";
import { isProposalCommandTool, runCommandTool } from "@/lib/ai/commandTools";
import { isWriteTool } from "@/lib/ai/copilotAgentTools";
import type { Post, PostCreateInput } from "@/types";
import {
  applyOps,
  formatOutline,
  type Op,
  outline,
  readAll,
  readBlocks,
  stateFromBlocks,
  type StoredState,
  type WritableBlock,
} from "@/lib/content-bridge";
import {
  documentState,
  listDocuments,
  normalizeDocId,
  resolveDocId,
  searchDocuments,
} from "./virtualRepo";

const getDocs = (): Post[] => postsSelectors.selectAll(store.getState());

interface WriteResult {
  ok: boolean;
  message: string;
}

interface Loaded {
  id: string;
  title: string;
  state: StoredState;
}

const editorState = (editor: LexicalEditor): StoredState =>
  editor.getEditorState().toJSON() as unknown as StoredState;

/**
 * The state to read or write, from whichever source is authoritative.
 *
 * A mounted editor wins for the document it holds, including when its unsaved
 * content is intentionally empty — otherwise the agent would answer about a
 * stale saved copy of what is visibly on screen.
 */
async function load(
  ref: string | undefined,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<Loaded | null> {
  const docs = getDocs();
  const id = ref ? normalizeDocId(ref) : currentDocId;
  if (!id) return null;

  const meta = documentState(docs, id);
  const title = meta?.title ?? "Untitled";

  if (editor && id === currentDocId) {
    return { id, title, state: editorState(editor) };
  }
  if (meta?.state) return { id, title, state: meta.state };
  if (!meta) return null;

  // View mode has no editor, and cloud-only documents deliberately omit
  // revision bodies from Redux. Hydrate the cloud head on demand.
  const revisionId = docs.find((doc) => doc.id === id)?.head;
  if (!revisionId) return null;
  const revision = await apiClient.revisions.get(revisionId);
  if (!revision?.data) return null;
  return { id, title, state: revision.data as unknown as StoredState };
}

/** Execute a read-only tool. Returns a JSON-serializable result. */
export async function runReadTool(
  name: string,
  input: Record<string, unknown>,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<unknown> {
  const ref = typeof input.id === "string" ? input.id : undefined;

  switch (name) {
    case "list_documents":
      return { documents: listDocuments(getDocs()) };

    case "search_documents":
      return { hits: searchDocuments(getDocs(), String(input.query ?? "")) };

    case "outline_document": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      const result = outline(doc.state);
      return {
        id: doc.id,
        title: doc.title,
        stateHash: result.stateHash,
        outline: formatOutline(result),
      };
    }

    case "read_blocks": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      const ids = Array.isArray(input.blocks) ? input.blocks.map(String) : [];
      if (ids.length === 0) return { error: "No block addresses given." };
      return { id: doc.id, title: doc.title, ...readBlocks(doc.state, ids) };
    }

    case "read_document": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      return { id: doc.id, title: doc.title, ...readAll(doc.state) };
    }

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

/** Persist a new state for a document (open doc or otherwise). */
async function persist(
  docId: string,
  state: StoredState,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<void> {
  const data = state as unknown as SerializedEditorState;
  // The open document updates through the live editor so the view reflects the
  // change immediately (SavePlugin then persists it). Other posts patch through
  // the store/IndexedDB directly.
  if (editor && docId === currentDocId) {
    editor.setEditorState(editor.parseEditorState(data));
    return;
  }
  await store.dispatch(updatePost({ id: docId, partial: { data } }));
}

/** Apply an accepted write proposal. */
async function applyWrite(
  name: string,
  input: Record<string, unknown>,
  editor: LexicalEditor | null,
  currentDocId: string,
): Promise<WriteResult> {
  if (name === "create_document") {
    const title = String(input.title ?? "Untitled");
    const blocks = Array.isArray(input.blocks)
      ? (input.blocks as WritableBlock[])
      : [];
    if (blocks.length === 0) {
      return { ok: false, message: "No blocks given — nothing to create." };
    }

    let state: StoredState;
    try {
      state = stateFromBlocks(blocks);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }

    const now = new Date().toISOString();
    const payload: PostCreateInput = {
      id: uuidv4(),
      head: uuidv4(),
      name: title,
      data: state as unknown as SerializedEditorState,
      type: "DOCUMENT",
      parentId: null,
      createdAt: now,
      updatedAt: now,
    };
    await store.dispatch(createPost(payload));
    return { ok: true, message: `Created "${title}"` };
  }

  if (name !== "apply_ops") {
    return { ok: false, message: `Unknown write tool: ${name}` };
  }

  const ref = typeof input.id === "string" ? input.id : undefined;
  const doc = await load(ref, editor, currentDocId);
  if (!doc) return { ok: false, message: `No document ${ref ?? "is open"}.` };

  const docId = resolveDocId(getDocs(), doc.id) ?? doc.id;
  const ops = Array.isArray(input.ops) ? (input.ops as Op[]) : [];
  if (ops.length === 0) return { ok: false, message: "No operations given." };

  let result;
  try {
    result = applyOps(doc.state, String(input.stateHash ?? ""), ops);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  await persist(docId, result.state, editor, currentDocId);
  return {
    ok: true,
    message: `Updated ${result.changed} block${
      result.changed === 1 ? "" : "s"
    } in "${doc.title}"`,
  };
}

/**
 * Apply whatever the user just accepted, whichever family the tool belongs to.
 *
 * One entry point on purpose: "Accept" in a message and "Accept all" in the
 * header used to each carry their own copy of the dispatch, and adding command
 * proposals to only one of them is the obvious way to get this wrong.
 */
export async function applyProposal(
  name: string,
  input: Record<string, unknown>,
  editor: LexicalEditor | null,
  currentDocId: string,
  commandContext: CommandContext,
): Promise<unknown> {
  if (isWriteTool(name)) {
    return applyWrite(name, input, editor, currentDocId);
  }
  if (isProposalCommandTool(name)) {
    return runCommandTool(name, input, commandContext);
  }
  return { ok: false, message: `Unknown proposal tool: ${name}` };
}
