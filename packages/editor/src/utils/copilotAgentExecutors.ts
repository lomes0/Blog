/**
 * Client-side executors for the Copilot content-agent tools.
 *
 * The tools are declared on the server route but run here, in the browser,
 * because that's the only place all content (local IndexedDB + cloud metadata)
 * and the live editor exist. Read tools return JSON that flows back into the
 * agent loop.
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
 * (docs/plans/archive/claude-code-lexical.md): reads hand out addresses and a
 * `stateHash`, writes name blocks, and only the named nodes are touched.
 *
 * ### What changed in ai-surface-consolidation §4.4
 *
 * **Writes no longer apply anything here.** They used to be held in the chat and,
 * on accept, dispatch `updatePost` or set the live editor state — which meant an
 * in-app agent edit had none of what docs/plans/archive/agent-gating.md built for the
 * terminal one: no compare-and-set, no staleness, no provenance, no squash and
 * no review surface (§2.4). `apply_ops` and `create_post` now POST to
 * `/api/documents/[id]/proposals` and `/api/documents/agent`, both of which are
 * `src/lib/agentWrites.ts` — the same function `mcp/content-server.ts` calls. The
 * edit lands as a pending proposal the moment the tool is called, and the
 * author's one decision is in `AgentChangeBar` or the review rail.
 *
 * Two consequences that are easy to miss:
 *
 * - **The server builds the proposal from what it holds**, so the state this
 *   file reads has to be the state the server would read, or every write is
 *   refused as stale. That is why `load` resolves a document's pending proposal
 *   in preference to the editor — the same choice `selectAgentRead` makes on the
 *   server — and why `CopilotChat` flushes unsaved edits when the *turn* starts
 *   (§4.4.3).
 * - **`stateHash` is still the guard between a read and a write**, and it is now
 *   checked server-side against that same base. A miss means the addresses have
 *   moved and the agent must re-read; it is a different fact from "your earlier
 *   proposal went stale", which is reported on a *successful* write as
 *   `outcome: "replaced"`.
 */
import type { LexicalEditor } from "lexical";
import { apiClient, ApiClientError } from "@/api";
import { postsSelectors, store } from "@/store";
import { getPost, refreshProposals } from "@/store/app";
import type { CommandContext } from "@/commands";
import { isProposalCommandTool, runCommandTool } from "@/lib/ai/commandTools";
import { isProposalStale } from "@/lib/proposals";
import type { PendingProposal, Post } from "@/types";
import {
  formatOutline,
  type Op,
  outline,
  readAll,
  readBlocks,
  type StoredState,
  type WritableBlock,
} from "@/lib/content-bridge";
import {
  documentState,
  listDocuments,
  normalizeDocId,
  searchDocuments,
} from "./virtualRepo";
import { captureSelection } from "./captureSelection";

const getDocs = (): Post[] => postsSelectors.selectAll(store.getState());

/**
 * Series as the agent sees them: the same three fields `list_series` returns
 * over MCP, in the order the store already holds (what the sidebar shows). A
 * flat list of every series has no order of its own: a project's members are
 * ordered by that project, not against the root list.
 */
const getSeries = () =>
  store.getState().series.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description ?? null,
  }));

interface Loaded {
  id: string;
  title: string;
  state: StoredState;
  /** Which state this is — the same distinction `AgentReadState.source` draws. */
  source: "proposal" | "document";
  /** A pending proposal exists but was skipped because it has gone stale. */
  staleProposal: boolean;
}

const editorState = (editor: LexicalEditor): StoredState =>
  editor.getEditorState().toJSON() as unknown as StoredState;

/**
 * This document's pending proposal, and whether it is one an agent may read.
 *
 * Staleness is decided against the head the *store* holds rather than the one
 * the proposal was listed with: an autosave — including the flush at the start
 * of this very turn — moves head immediately, and the proposal listing is
 * refreshed asynchronously behind it. Asking the stale question of the fresher
 * pointer is what keeps this from reading a proposal the server has already
 * decided to ignore.
 */
function pendingProposalFor(
  id: string,
): { proposal: PendingProposal; stale: boolean } | null {
  const state = store.getState();
  const proposal = state.ui.proposals.byDocId[id];
  if (!proposal) return null;
  const head = postsSelectors.selectById(state, id)?.headRevisionId ?? proposal.head;
  return { proposal, stale: isProposalStale(proposal, head ?? null) };
}

/**
 * The state to read or write, from whichever source is authoritative.
 *
 * Three sources, in the order the server would pick them (`selectAgentRead`):
 *
 * 1. **A non-stale pending proposal.** If a batch rewrote block 2, the next
 *    outline has to show that rewrite — otherwise the addresses describe a
 *    document nobody is holding, and the write built on them is refused as stale
 *    against the very proposal it meant to extend (agent-gating §3.2). A stale
 *    proposal loses to the document, exactly as it does on the server (§3.6).
 * 2. **A mounted editor**, for the document it holds — including when its
 *    unsaved content is intentionally empty, or the agent would answer about a
 *    stale saved copy of what is visibly on screen.
 * 3. **Storage**, from the store or by hydrating the cloud head on demand.
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

  const pending = pendingProposalFor(id);
  if (pending && !pending.stale) {
    // A proposal is a `Revision` row like any other; the diff view reads it the
    // same way. A fetch that fails falls through to the live document rather
    // than failing the read — the write will then be refused as stale, which is
    // recoverable, where a dead read is not.
    const revision = await apiClient.revisions.get(pending.proposal.id).catch(
      () => undefined,
    );
    if (revision?.data) {
      return {
        id,
        title,
        state: revision.data as unknown as StoredState,
        source: "proposal",
        staleProposal: false,
      };
    }
  }
  const staleProposal = Boolean(pending?.stale);

  if (editor && id === currentDocId) {
    return {
      id,
      title,
      state: editorState(editor),
      source: "document",
      staleProposal,
    };
  }
  if (meta?.state) {
    return { id, title, state: meta.state, source: "document", staleProposal };
  }
  if (!meta) return null;

  // View mode has no editor, and cloud-only documents deliberately omit
  // revision bodies from Redux. Hydrate the cloud head on demand.
  const revisionId = docs.find((doc) => doc.id === id)?.headRevisionId;
  if (!revisionId) return null;
  const revision = await apiClient.revisions.get(revisionId);
  if (!revision?.data) return null;
  return {
    id,
    title,
    state: revision.data as unknown as StoredState,
    source: "document",
    staleProposal,
  };
}

/**
 * What the agent is told about *which* state it just read.
 *
 * `mcp/content-server.ts`'s `sourceNote`, in the shape a JSON tool result takes:
 * three answers, and the third is the one worth spelling out — an agent told
 * only "this is the live document" will report its earlier work as still
 * pending, when the author has edited underneath it and it can no longer be
 * approved (§3.6).
 */
function sourceNote(doc: Loaded): string | undefined {
  if (doc.source === "proposal") {
    return "This is the post's pending proposal, not the live document. " +
      "Further edits fold into the same proposal.";
  }
  if (doc.staleProposal) {
    return "Your earlier proposal for this post is out of date — the author " +
      "saved after it was written, so it can no longer be approved. This is " +
      "the live document. Editing now replaces that proposal with a new one " +
      "against this content; tell the user their earlier proposal was " +
      "superseded.";
  }
  return undefined;
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
    case "list_posts":
      return { documents: listDocuments(getDocs()) };

    case "list_series":
      return { series: getSeries() };

    case "search":
      return { hits: searchDocuments(getDocs(), String(input.query ?? "")) };

    case "outline": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      const result = outline(doc.state);
      return {
        id: doc.id,
        title: doc.title,
        note: sourceNote(doc),
        stateHash: result.stateHash,
        outline: formatOutline(result),
      };
    }

    case "read_blocks": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      const ids = Array.isArray(input.blocks) ? input.blocks.map(String) : [];
      if (ids.length === 0) return { error: "No block addresses given." };
      return {
        id: doc.id,
        title: doc.title,
        note: sourceNote(doc),
        ...readBlocks(doc.state, ids),
      };
    }

    case "read_post": {
      const doc = await load(ref, editor, currentDocId);
      if (!doc) return { error: `No document ${ref ?? "is open"}.` };
      return {
        id: doc.id,
        title: doc.title,
        note: sourceNote(doc),
        ...readAll(doc.state),
      };
    }

    // The pull half of the selection context. The push half — what rides on
    // every turn's request — is the same function, called from `CopilotChat`
    // (docs/plans/archive/haklex-adoption.md §7.3). One implementation on purpose: a
    // model that asks after being told must not get a different answer.
    case "get_selection":
      return { selection: captureSelection(editor) };

    default:
      return { error: `Unknown read tool: ${name}` };
  }
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/**
 * What a content write did, as both the model reads it and the chat renders it.
 *
 * One value for both because they must not disagree: `message` is the sentence
 * the model repeats to the user, and the fields beside it are what the transcript
 * turns into a Review link. A refusal carries the reason rather than only a
 * string, because the chat says different things about each — and in particular
 * because `reason: "stale"` (the addresses moved) is a different fact from
 * `outcome: "replaced"` (an earlier proposal died), which arrives on a *success*.
 */
export type AgentWriteOutcome =
  | {
    ok: true;
    kind: "proposed";
    documentId: string;
    title: string;
    proposalId: string;
    changed: number;
    outcome: "created" | "squashed" | "replaced";
    /** The token the next batch in this turn must carry back. */
    stateHash: string;
    message: string;
  }
  | {
    ok: true;
    kind: "created";
    documentId: string;
    title: string;
    message: string;
  }
  | {
    ok: false;
    reason: "stale" | "invalid" | "not-found" | "denied" | "error";
    message: string;
  };

/** Narrow a stored tool output back to an outcome, for the transcript. */
export function asAgentWriteOutcome(
  output: unknown,
): AgentWriteOutcome | null {
  if (!output || typeof output !== "object") return null;
  const value = output as Partial<AgentWriteOutcome> & { ok?: unknown };
  if (typeof value.ok !== "boolean" || typeof value.message !== "string") {
    return null;
  }
  return value as AgentWriteOutcome;
}

/**
 * Why the route refused, from the status it refused with.
 *
 * The route's own comments are the contract: 409 is the `stateHash` miss the
 * agent recovers from by re-reading, 400 is an op that was wrong when it was
 * made, 404 is the document going away under it, 403 is a document the caller
 * may read but not write.
 */
function refusal(error: unknown): AgentWriteOutcome {
  if (error instanceof ApiClientError) {
    const detail = error.details?.subtitle ?? error.message;
    if (error.statusCode === 409) {
      return {
        ok: false,
        reason: "stale",
        message: `The document changed while this edit was being written, so ` +
          `the block addresses no longer point where they did. Read the ` +
          `outline again and redo the edit against the new addresses. ` +
          `(${detail})`,
      };
    }
    if (error.statusCode === 404) {
      return { ok: false, reason: "not-found", message: detail };
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return { ok: false, reason: "denied", message: detail };
    }
    if (error.statusCode === 400) {
      return { ok: false, reason: "invalid", message: detail };
    }
    return { ok: false, reason: "error", message: detail };
  }
  return {
    ok: false,
    reason: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Propose a block edit, or create a post — through the server, immediately.
 *
 * Called from the streaming loop like a read tool, and this is the phase's whole
 * behaviour change: there is no chat-side hold, because the write's decision
 * point moved to the review surfaces. Neither branch touches the open editor —
 * the document on screen is deliberately left as it is until the author approves.
 */
export async function runWriteTool(
  name: string,
  input: Record<string, unknown>,
  currentDocId: string,
): Promise<AgentWriteOutcome> {
  if (name === "create_post") {
    const title = String(input.title ?? "Untitled");
    const blocks = Array.isArray(input.blocks)
      ? (input.blocks as WritableBlock[])
      : [];
    if (blocks.length === 0) {
      return {
        ok: false,
        reason: "invalid",
        message: "No blocks given — nothing to create.",
      };
    }

    let created;
    try {
      created = await apiClient.agent.createPost({ title, blocks });
    } catch (error) {
      return refusal(error);
    }
    if (!created) {
      return {
        ok: false,
        reason: "error",
        message: "The post was not created.",
      };
    }

    // The row exists but nothing in the browser knows it yet. The change feed
    // announces it too — this is not a substitute for that — but a tab with no
    // stream open would otherwise not see its own agent's post until the next
    // background refresh, and the transcript is about to link to it.
    await store.dispatch(getPost(created.id));
    void store.dispatch(refreshProposals());

    return {
      ok: true,
      kind: "created",
      documentId: created.id,
      title,
      message: `Created "${title}" with ${created.blockCount} block` +
        `${created.blockCount === 1 ? "" : "s"} — an unpublished draft, ` +
        `flagged agent-created and awaiting the author's Keep or Discard. ` +
        `Nobody else can read it until they publish it.\n` +
        `stateHash: ${created.stateHash}`,
    };
  }

  if (name !== "apply_ops") {
    return {
      ok: false,
      reason: "invalid",
      message: `Unknown write tool: ${name}`,
    };
  }

  const ref = typeof input.id === "string" ? input.id : undefined;
  const id = ref ? normalizeDocId(ref) : currentDocId;
  const meta = id ? documentState(getDocs(), id) : null;
  if (!id || !meta) {
    return {
      ok: false,
      reason: "not-found",
      message: `No document ${ref ?? "is open"}.`,
    };
  }

  const ops = Array.isArray(input.ops) ? (input.ops as Op[]) : [];
  if (ops.length === 0) {
    return { ok: false, reason: "invalid", message: "No operations given." };
  }
  const stateHash = String(input.stateHash ?? "");
  if (!stateHash) {
    return {
      ok: false,
      reason: "invalid",
      message: "No stateHash given — read the outline first and pass its hash.",
    };
  }

  let result;
  try {
    result = await apiClient.agent.proposeOps(meta.id, { stateHash, ops });
  } catch (error) {
    return refusal(error);
  }
  if (!result) {
    return { ok: false, reason: "error", message: "The edit was not stored." };
  }

  // The rail, the sidebar badge and `AgentChangeBar` all read the same listing,
  // and the transcript's Review link wants the row the moment it is rendered.
  void store.dispatch(refreshProposals());

  const blocks = `${result.changed} block${result.changed === 1 ? "" : "s"}`;
  // `replaced` is the one the user has to hear about: their earlier proposal was
  // built on a base the author has since saved past, so it could never have been
  // approved and this batch started over rather than folding onto it (§3.6).
  const replaced = result.outcome === "replaced"
    ? `\nYour earlier proposal was out of date — the author saved after it was ` +
      `written — so it has been replaced rather than added to. Only this ` +
      `change is pending; tell the user, and re-apply anything from the ` +
      `earlier proposal that still matters.`
    : "";
  return {
    ok: true,
    kind: "proposed",
    documentId: result.id,
    title: meta.title,
    proposalId: result.proposalId,
    changed: result.changed,
    outcome: result.outcome,
    stateHash: result.stateHash,
    message: `Proposed ${blocks} of change to "${meta.title}". Nothing is ` +
      `live: the document is unchanged and this is ` +
      (result.outcome === "squashed"
        ? "folded into the pending proposal"
        : "pending") +
      `, awaiting the author's approval in the app. Report it as proposed, ` +
      `never as done.${replaced}\n` +
      `Further edits to this post fold into the same proposal, and reads of ` +
      `it now return the proposed content rather than the live document.\n` +
      `stateHash: ${result.stateHash}`,
  };
}

/**
 * Apply a command proposal the user just accepted.
 *
 * Content writes no longer come through here: they are proposed on the tool call
 * and answered in `AgentChangeBar` or the rail (§4.4). What is left is the
 * family that has nowhere else to be held — `pane.split`, `document.rename`,
 * `ui.setTheme` — because a command has no document content and cannot be a
 * `Revision` row (§4.4.6).
 *
 * Still one entry point for both "Accept" in a message and "Accept all" in the
 * header: each used to carry its own copy of the dispatch, and adding a family
 * to only one of them is the obvious way to get this wrong.
 */
export async function applyProposal(
  name: string,
  input: Record<string, unknown>,
  commandContext: CommandContext,
): Promise<unknown> {
  if (isProposalCommandTool(name)) {
    return runCommandTool(name, input, commandContext);
  }
  return { ok: false, message: `Unknown proposal tool: ${name}` };
}
