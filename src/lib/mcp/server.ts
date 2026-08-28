// The blog-content MCP server: ten tools over one author's posts.
//
// This module is the server *without a transport*. `mcp/content-server.ts`
// builds one from MCP_AUTHOR_ID and speaks stdio; a route can build one per
// request and speak HTTP (docs/plans/archive/mcp-support.md phase 3). Neither knows
// anything the other does not, because the only thing that differs between them
// is `resolveAuthorId` — see below.
//
// Documents are addressed by BLOCK, not round-tripped through Markdown — see
// docs/plans/archive/claude-code-lexical.md. Reads hand out addresses (`b3`, `b4.2`)
// and a `stateHash`; writes name blocks and carry that hash back. Only the
// nodes an op names are touched, so a kanban board nobody mentioned comes out
// byte-identical, and blocks with no codec are visible and movable rather than
// silently absent as they were under the Markdown transport.
//
// The bridge is pure JSON, so this needs no DOM shim and no editor node
// classes, which is why it can be built inside Next as readily as in a bare
// tsx process.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
// The read, the ops and the proposal write are shared with the in-app Copilot's
// route — one execution of `applyOps` against one authoritative base, rather
// than two implementations that happen to write the same columns. See
// docs/plans/archive/ai-surface-consolidation.md §4.4.1. What stays in this file is how
// the result is *said* to Claude Code: the tool text below is MCP's, not shared.
import {
  type AgentReadState,
  proposeNewPost,
  proposeOps,
  readAgentState,
} from "@/lib/agentWrites";
import {
  blockText,
  formatOutline,
  nodeToBlock,
  type Op,
  outline,
  readAll,
  readBlocks,
  type StoredState,
  walkBlocks,
  type WritableBlock,
} from "@/lib/content-bridge";
// The input schemas and the block prose used to be declared here, and a second
// time in `src/app/api/copilot/route.ts` for the in-app Copilot. They drifted.
// One copy now lives beside the codecs that enforce it — see
// docs/plans/archive/ai-surface-consolidation.md §4.1. Not from the barrel: it is the
// one part of the bridge the browser has no use for.
import {
  BLOCK_DOC,
  blockSchema,
  opSchema,
  RECOVERY_DOC,
} from "@/lib/content-bridge/schema";
import { AGENT_SCOPES, type AgentScope } from "@/lib/agentTokens";
// The two `manage` tools, and the only writes here that are not proposals.
// Author-scoped by argument rather than by a session, because this server has
// no session — see `loadPost` for the same reasoning about reads.
import {
  deleteOwnedDocument,
  renameOwnedDocument,
} from "@/repositories/document";
import type { RateDecision } from "@/lib/rateLimit";

/** Where a write from this server says it came from (`Revision.origin`). */
export const AGENT_ORIGIN = "claude-code";

export interface ContentServerOptions {
  /**
   * What this server may do. Defaults to everything, which is what the stdio
   * process gets — its credential is the operating system.
   *
   * Enforced by **not registering** the write tools when `propose` is absent,
   * rather than by a check inside each one. Two reasons, and the second is the
   * one that matters: a caller cannot forget to check something that was never
   * declared, and an agent holding a read-only token does not see `apply_ops`
   * in `tools/list` at all, so it plans around the limit instead of discovering
   * it through a refusal.
   */
  scopes?: readonly AgentScope[];
  /**
   * Spend one unit of this caller's budget for a read or a write, and say
   * whether it was there to spend. Omitted means unmetered, which is what the
   * stdio process gets — its caller is already inside the machine, and a limit
   * there would only get in the way of the operator.
   *
   * Reads and writes are counted separately because they fail differently: a
   * runaway read is wasted database time, while a runaway write fills the
   * author's review rail with proposals someone has to reject by hand.
   */
  checkRate?: (kind: "read" | "write") => RateDecision;
  /**
   * What a write from this server records as `Revision.origin`. Defaults to the
   * bare agent name.
   *
   * The remote endpoint passes `agentOrigin(AGENT_ORIGIN, token.name)` so the
   * review rail can say *which* credential proposed — "Claude Code (laptop)"
   * rather than "Claude Code". When a token leaks, that line is the difference
   * between knowing something wrote and knowing what to revoke.
   */
  origin?: string;
  /**
   * Who this server is for. **This is the entire authorization model**, and
   * putting it here rather than in each tool is the point of the factory:
   * every tool below scopes its queries to whatever this returns, and no tool
   * takes an author from its arguments, so a caller cannot name a user other
   * than the one the transport authenticated. Under stdio that is
   * `MCP_AUTHOR_ID`; over HTTP it will be the owner of the presented token
   * (docs/plans/archive/mcp-support.md §4.3).
   *
   * Called at most once per server, lazily — a stdio process should not fail at
   * import time, and a per-request server should not pay a lookup for a
   * `tools/list` that reads nothing.
   */
  resolveAuthorId: () => Promise<string>;
}

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));
const fail = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
  isError: true,
});

/**
 * The one line a read tool adds about which state it is showing.
 *
 * Three answers, and the third is the one worth spelling out: an agent that is
 * told only "this is the live document" will happily report its earlier work as
 * still pending, when in fact the author has edited underneath it and that work
 * can no longer be approved (§3.6).
 */
const sourceNote = (post: AgentReadState): string => {
  if (post.source === "proposal") {
    return "\n(showing this post's pending proposal, not the live document)";
  }
  if (post.staleProposal) {
    return "\n(your earlier proposal for this post is out of date — the author " +
      "saved after it was written, so it can no longer be approved. This is " +
      "the live document. Editing now discards that proposal and starts a new " +
      "one against this content; tell the user their earlier proposal was " +
      "superseded.)";
  }
  return "";
};

/**
 * The author's series, narrow: what `list_series` returns, and what
 * `create_post` offers back as candidates.
 *
 * Author-scoped by argument, like every other query in this file — the public
 * `findAllSeries` would show a candidate belonging to someone else, and the
 * owner-scoped `findSeriesByAuthorId` drags every post and revision along for a
 * three-column read.
 */
const authorSeries = (authorId: string) =>
  prisma.series.findMany({
    where: { authorId },
    select: { id: true, title: true, description: true },
    orderBy: { rank: "asc" },
  });

/** How many candidate series `create_post` names before deferring to `list_series`. */
const SERIES_SUGGESTION_LIMIT = 20;

/**
 * What `create_post` says about series when the caller named none.
 *
 * The decision this encodes is "agent proposes, does not decide"
 * (docs/plans/claude-code-backlog.md §6): the post lands at root — no silent
 * placement, ever — but the candidates travel back with it, so a suggestion the
 * agent could cheaply make is not lost to a round trip nobody makes. The server
 * ranks nothing and picks nothing; the model reads the titles and proposes one
 * to the author, who files it. Nothing here files anything, and the wording
 * says so, because a model that reads "series: …" and concludes the post is in
 * one will report a placement that did not happen.
 */
const seriesSuggestion = (
  series: { id: string; title: string; description: string | null }[],
): string => {
  const head = `\n\nNot filed: it is at the root of the library, because no ` +
    `seriesId was given. `;
  if (series.length === 0) {
    return head + `The author has no series, so root is the only place for it.`;
  }
  const shown = series.slice(0, SERIES_SUGGESTION_LIMIT);
  const rest = series.length - shown.length;
  return head +
    `If one of the author's series fits, say which and why and let them file ` +
    `it — moving a post between series is their step, in the app, and no tool ` +
    `here does it. (Pass seriesId to create_post next time the author has ` +
    `already chosen.)\nCandidate series:\n` +
    shown
      .map((s) =>
        `- ${s.id} — ${s.title}${s.description ? `: ${s.description}` : ""}`
      )
      .join("\n") +
    (rest > 0 ? `\n…and ${rest} more (list_series).` : "");
};

/**
 * Build a server bound to one author.
 *
 * Every tool resolves the author first and passes it down; nothing here reads
 * `process.env`, so the same ten tools serve a stdio process and an HTTP
 * request without knowing which they are in.
 */
export function createContentServer(
  {
    resolveAuthorId,
    scopes = AGENT_SCOPES,
    checkRate,
    origin = AGENT_ORIGIN,
  }: ContentServerOptions,
): McpServer {
  const server = new McpServer({ name: "blog-content", version: "0.2.0" });
  const mayPropose = scopes.includes("propose");
  const mayManage = scopes.includes("manage");

  /**
   * Wrap a tool handler in its budget.
   *
   * Every registration below goes through this, so the metered set is the
   * registered set — there is no handler that could quietly not be counted.
   * The refusal is a tool error rather than an HTTP status because by this
   * point the request has been accepted and dispatched; the transport's status
   * belongs to the coarse per-request limit the route applies before any of
   * this runs.
   */
  const metered = <A extends unknown[], R>(
    kind: "read" | "write",
    handler: (...args: A) => Promise<R>,
  ) =>
  async (...args: A): Promise<R | ReturnType<typeof fail>> => {
    const decision = checkRate?.(kind);
    if (decision && !decision.allowed) {
      return fail(
        `Rate limit reached for ${kind}s on this token. Wait ` +
          `${decision.retryAfterSeconds}s and try again. This is a budget, not ` +
          `a refusal of the request itself — nothing was read or written.`,
      );
    }
    return handler(...args);
  };

  // Memoised per server, not per process: under stdio that saves a lookup per
  // call over a long-lived connection, and under HTTP the server is the request
  // so there is nothing to leak between callers.
  let authorIdPromise: Promise<string> | undefined;
  const getAuthorId = (): Promise<string> => {
    authorIdPromise ??= resolveAuthorId();
    return authorIdPromise;
  };

  /**
   * Fetch one of *this author's* posts as an editor state.
   *
   * The read itself is `readAgentState` — the pending proposal wins over `head`
   * unless it has gone stale, and the `base` a write records is kept apart from
   * the state it read (§3.2, §3.6). What this wrapper adds is the whole of this
   * server's authorization: `ownedBy` scopes the lookup to the resolved author,
   * so a document belonging to anyone else is simply not found. Every read tool
   * below goes through it, which is what makes that scoping total rather than
   * remembered.
   */
  const loadPost = (
    id: string,
    authorId: string,
  ): Promise<AgentReadState | null> => readAgentState(id, { ownedBy: authorId });

  // -------------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------------

  server.registerTool(
    "list_posts",
    {
      description:
        "List the author's blog posts (id, title, handle, series, published, updated).",
      inputSchema: {},
    },
    metered("read", async () => {
      const authorId = await getAuthorId();
      const docs = await prisma.document.findMany({
        where: { authorId, type: DocumentType.DOCUMENT },
        select: {
          id: true,
          name: true,
          handle: true,
          published: true,
          seriesId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      return json(docs);
    }),
  );

  server.registerTool(
    "list_series",
    {
      description: "List the author's series (id, title, description).",
      inputSchema: {},
    },
    metered("read", async () => {
      const authorId = await getAuthorId();
      return json(await authorSeries(authorId));
    }),
  );

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  server.registerTool(
    "outline",
    {
      description:
        "Skeleton of a post: one line per block with its address, kind and a " +
        "preview. Start here — it is far cheaper than reading a whole post, and " +
        "the addresses it returns are what every other tool takes. Blocks marked " +
        "[read-only] can be moved or deleted but not rewritten. Returns a " +
        "stateHash that apply_ops requires.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    metered("read", async ({ id }) => {
      const authorId = await getAuthorId();
      const post = await loadPost(id, authorId);
      if (!post) return fail(`Post ${id} not found (or not yours).`);

      const result = outline(post.state);
      // Every read resolves the pending proposal in preference to the live
      // document (§3.2), unless it has gone stale (§3.6). Saying so is the
      // difference between the agent reporting "the post now says X" and "the
      // proposal I have pending says X".
      const note = sourceNote(post);
      if (result.blocks.length === 0) {
        return text(
          `"${post.name}" is empty.${note}\nstateHash: ${result.stateHash}`,
        );
      }
      return text(
        `"${post.name}"${note}\nstateHash: ${result.stateHash}\n\n${
          formatOutline(result)
        }`,
      );
    }),
  );

  server.registerTool(
    "read_blocks",
    {
      description:
        "Full content of specific blocks, by address from `outline`. Prefer this " +
        "over read_post: it is how you read a long article without paying for all " +
        "of it.",
      inputSchema: {
        id: z.string().describe("Document id"),
        blocks: z.array(z.string()).min(1).describe(
          'Block addresses, e.g. ["b2","b4.1"]',
        ),
      },
    },
    metered("read", async ({ id, blocks }) => {
      const authorId = await getAuthorId();
      const post = await loadPost(id, authorId);
      if (!post) return fail(`Post ${id} not found (or not yours).`);

      const result = readBlocks(post.state, blocks);
      if (result.blocks.length === 0) {
        return fail(
          `No blocks matched ${result.missing.join(", ")} in post ${id}.`,
        );
      }
      return json({
        ...result,
        pendingProposal: post.source === "proposal",
        ...(post.staleProposal ? { staleProposal: sourceNote(post).trim() } : {}),
      });
    }),
  );

  server.registerTool(
    "read_post",
    {
      description:
        "The whole post as nested blocks. Use for short documents; for anything " +
        "long, use outline then read_blocks.",
      inputSchema: { id: z.string().describe("Document id") },
    },
    metered("read", async ({ id }) => {
      const authorId = await getAuthorId();
      const post = await loadPost(id, authorId);
      if (!post) return fail(`Post ${id} not found (or not yours).`);
      return json({
        title: post.name,
        // True when what follows is the post's pending proposal rather than the
        // live document — see `loadPost`.
        pendingProposal: post.source === "proposal",
        ...(post.staleProposal ? { staleProposal: sourceNote(post).trim() } : {}),
        ...readAll(post.state),
      });
    }),
  );

  server.registerTool(
    "search",
    {
      description:
        "Find text across the author's posts. Returns block-level hits, so you " +
        "can jump straight to an address rather than reading whole documents.",
      inputSchema: {
        query: z.string().min(1).describe("Text to look for (case-insensitive)"),
        id: z.string().optional().describe("Restrict to one post"),
        limit: z.number().int().min(1).max(200).default(40),
      },
    },
    metered("read", async ({ query, id, limit }) => {
      const authorId = await getAuthorId();
      const docs = await prisma.document.findMany({
        where: {
          authorId,
          type: DocumentType.DOCUMENT,
          ...(id ? { id } : {}),
        },
        select: { id: true, name: true, head: true },
        orderBy: { updatedAt: "desc" },
      });

      const needle = query.toLowerCase();
      const hits: Array<{
        postId: string;
        title: string;
        blockId: string;
        kind: string;
        preview: string;
      }> = [];

      // Pending proposals shadow head here for the same reason they do in
      // `loadPost`: a hit hands back a block address, and an address that came
      // from the live document does not name the same block in the proposal that
      // `apply_ops` would edit. One query rather than one per document.
      const proposed = new Map(
        (await prisma.revision.findMany({
          where: {
            documentId: { in: docs.map((doc) => doc.id) },
            proposedAt: { not: null },
          },
          select: { documentId: true, data: true },
        })).map((row) => [row.documentId, row.data]),
      );

      // Walks every post's current state. Fine at one author's scale; if this
      // ever gets slow, prefilter in SQL on the revision JSON before walking.
      for (const doc of docs) {
        if (hits.length >= limit) break;
        const data = proposed.get(doc.id) ??
          (doc.head
            ? (await prisma.revision.findUnique({
              where: { id: doc.head },
              select: { data: true },
            }))?.data
            : null);
        if (!data) continue;

        for (const { address, node } of walkBlocks(data as StoredState)) {
          if (hits.length >= limit) break;
          const block = nodeToBlock(node);
          const haystack = blockText(block);
          if (!haystack.toLowerCase().includes(needle)) continue;

          const at = haystack.toLowerCase().indexOf(needle);
          hits.push({
            postId: doc.id,
            title: doc.name,
            blockId: address,
            kind: block.type === "opaque" ? block.nodeType : block.type,
            preview: haystack
              .slice(Math.max(0, at - 40), at + needle.length + 40)
              .replace(/\s+/g, " ")
              .trim(),
          });
        }
      }

      if (hits.length === 0) return text(`No matches for "${query}".`);
      return json({ hits, truncated: hits.length >= limit });
    }),
  );

  // -------------------------------------------------------------------------
  // Managing
  //
  // `manage` is a separate axis from `propose`, not a wider version of it — a
  // token can hold either without the other — so this is a guarded block rather
  // than a second early return. Putting it *above* the `propose` return is what
  // keeps a manage-only token from silently losing these two tools.
  //
  // Everything here lands immediately on the author's own content. That is the
  // opposite of the rule the tools below follow, and the tool text says so in
  // as many words, because an agent that has learned "my writes are proposals"
  // from `apply_ops` will otherwise carry that belief into a delete.
  // -------------------------------------------------------------------------

  if (mayManage) {
    server.registerTool(
      "rename_post",
      {
        description:
          "Change a post's title. Unlike apply_ops this is NOT a proposal — it " +
          "takes effect immediately on the live post, so confirm the new title " +
          "with the user before calling rather than after. " +
          "Only the title: the handle (the post's URL) is left alone, so links " +
          "keep working and the address can still say something the title no " +
          "longer does. Publishing, moving between series and editing content " +
          "are all elsewhere. A rename does not touch content, so a pending " +
          "proposal on this post stays pending and still applies.",
        inputSchema: {
          id: z.string().describe("Document id"),
          title: z.string().min(1).describe("The new title"),
        },
      },
      metered("write", async ({ id, title }) => {
        const authorId = await getAuthorId();
        const result = await renameOwnedDocument({
          id,
          ownedBy: authorId,
          name: title,
          origin,
        });
        if (!result.ok) return fail(`Post ${id} not found (or not yours).`);
        return text(
          `Renamed "${result.previousName}" to "${title}". This is live — the ` +
            `post is now titled that in the author's library.`,
        );
      }),
    );

    server.registerTool(
      "delete_post",
      {
        description:
          "PERMANENTLY delete a post and its entire revision history. This is " +
          "not a proposal and not a trash bin: there is no undo, no soft " +
          "delete and no way to recover the content afterwards. Never call it " +
          "on your own initiative — only when the user has named the post they " +
          "want gone. " +
          "Two steps. Call it with just `id` first: nothing is deleted, and it " +
          "reports the exact title and how much history would go. Then call it " +
          "again passing that title as `confirm` to actually delete. The echo " +
          "is what makes acting on the wrong id impossible — a plausible id " +
          "from a listing is the mistake this guards, not a change of heart. " +
          "Child tabs of a deleted post are not deleted: they are promoted to " +
          "top level. Posts forked from it survive, losing only the link back.",
        inputSchema: {
          id: z.string().describe("Document id"),
          confirm: z.string().optional().describe(
            "The post's exact title, as reported by the unconfirmed call. " +
              "Omit to preview what would be deleted.",
          ),
        },
      },
      metered("write", async ({ id, confirm }) => {
        const authorId = await getAuthorId();
        const result = await deleteOwnedDocument({
          id,
          ownedBy: authorId,
          confirmName: confirm,
          origin,
        });
        if (result.ok) {
          return text(
            `Deleted "${result.name}" (${id}) and its revision history. This ` +
              `is permanent and cannot be undone.`,
          );
        }
        if (result.reason === "not-found") {
          return fail(`Post ${id} not found (or not yours).`);
        }
        // Both the mismatch and the preview end up here, and they are told
        // apart by whether the caller sent anything — a wrong `confirm` is the
        // guard doing its job and has to read as a stop, not as a prompt to
        // try again with the title it just printed.
        const history = result.revisions === 1
          ? "1 revision"
          : `${result.revisions} revisions`;
        const live = result.published
          ? " It is PUBLISHED — deleting it breaks any link anyone has to it."
          : "";
        return fail(
          (confirm === undefined
            ? `Nothing was deleted. `
            : `Refused: confirm was "${confirm}", which is not this post's ` +
              `title. Nothing was deleted — check you have the right id.\n`) +
            `Deleting ${id} would permanently destroy "${result.name}" and ` +
            `${history}. There is no undo.${live}\n` +
            `To proceed, call delete_post again with confirm: "${result.name}".`,
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Proposing
  //
  // Everything below needs the `propose` scope. Returning early rather than
  // nesting is deliberate: it makes "a read-only server is the one without
  // these two tools" a fact about the file's shape, and leaves no branch where
  // a proposal tool could later be added outside the guard.
  // -------------------------------------------------------------------------

  if (!mayPropose) return server;

  server.registerTool(
    "apply_ops",
    {
      description:
        "PROPOSE a block-level edit to a post. The change is stored, but it does " +
        "not become the document: it lands as a pending proposal for the author " +
        "to approve or reject in the app. Report it as proposed, never as done. " +
        "Successive calls on the same post squash into that one proposal, and " +
        "every read of the post then returns the proposed content, so you can " +
        "keep editing against your own work. If the author saves in the app " +
        "meanwhile, that proposal goes out of date and can no longer be " +
        "approved: reads return the live document again, and the next call " +
        "REPLACES the stale proposal rather than folding into it — say so, " +
        "because the earlier change is then no longer pending. " +
        "Every op names a block address from a read, and the batch carries that " +
        "read's stateHash — if the state you read has moved on, the whole batch " +
        "is refused and you re-read. That guard covers the state you read; it " +
        "does NOT detect the author saving in an editor tab, which is checked " +
        "only when the proposal is approved. " +
        "Ops apply all-or-nothing, and blocks you do not name are left exactly " +
        "as they were. " +
        "Ops: set_text{id,text}, replace_block{id,block}, " +
        "insert_blocks{blocks,after|before|appendTo}, delete_block{id}, " +
        "move_block{id,after|before|appendTo}. " +
        BLOCK_DOC +
        " " +
        RECOVERY_DOC,
      inputSchema: {
        id: z.string().describe("Document id"),
        stateHash: z.string().describe(
          "The stateHash from the read these addresses came from",
        ),
        ops: z.array(opSchema).min(1),
      },
    },
    metered("write", async ({ id, stateHash: expected, ops }) => {
      const authorId = await getAuthorId();
      // Read, apply and fold all happen in `proposeOps`; `ownedBy` is this
      // server's authorization, exactly as in `loadPost`. What is left here is
      // the sentence Claude Code reads back.
      const result = await proposeOps({
        documentId: id,
        authorId,
        ownedBy: authorId,
        ops: ops as Op[],
        stateHash: expected,
        origin,
      });
      if (!result.ok) {
        // "not-found" keeps this server's own wording, since here it means
        // "no such post of yours" and not "no such row" — the shared module has
        // no way to tell the two apart.
        if (result.reason === "not-found") {
          return fail(`Post ${id} not found (or not yours).`);
        }
        // The code goes in front of the prose so the recovery the tool
        // description teaches is keyed on something exact, not on the model
        // recognizing a sentence.
        const code = result.reason === "invalid" ? result.code : undefined;
        return fail(code ? `${code}: ${result.message}` : result.message);
      }

      const { proposal } = result;
      const after = outline(result.state);
      const squashed = result.outcome === "squashed";
      // The author saved after the earlier proposal was written, so that proposal
      // could never have been approved and this batch started over against the
      // current document (§3.6). Say it plainly: the earlier work is gone, and
      // reporting it as still pending would be a lie about the blog's state.
      const replaced = proposal.replaced
        ? `\nYour earlier proposal (${proposal.replaced}) was out of date — the ` +
          `author edited this post after it was written — so it has been ` +
          `replaced rather than added to. Only the change above is pending; tell ` +
          `the user, and re-apply anything from the earlier proposal that still ` +
          `matters.`
        : "";
      return text(
        `Proposed ${result.changed} block change` +
          `${result.changed === 1 ? "" : "s"} to "${result.document.name}". ` +
          `Nothing is live: the document is unchanged, and this is ` +
          (squashed
            ? `folded into the pending proposal ${proposal.id} ` +
              `(batch ${proposal.version + 1})`
            : `pending proposal ${proposal.id}`) +
          `, awaiting the author's approval in the app.${replaced}\n` +
          `Further edits to this post fold into the same proposal, and reads of ` +
          `it now return the proposed content rather than the live document.\n` +
          `stateHash: ${after.stateHash}\n\n${formatOutline(after)}`,
      );
    }),
  );

  server.registerTool(
    "create_post",
    {
      description:
        "Create a post from blocks. Produces real Lexical content — proper code " +
        "nodes with highlighting, real headings and lists — not fenced Markdown. " +
        "Unlike apply_ops, a create lands normally rather than as a proposal — " +
        "there is nothing to overwrite — but it is flagged agent-created: it " +
        "arrives in the author's library as an unpublished draft awaiting their " +
        "accept or discard, and nobody else can read it until it is published. " +
        "Without seriesId it lands at the root of the library and the result " +
        "lists the author's series as candidates to suggest — it never files " +
        "the post itself. " +
        BLOCK_DOC,
      inputSchema: {
        title: z.string().min(1).describe("Post title"),
        blocks: z.array(blockSchema).min(1).describe("Body, in order"),
        seriesId: z.string().optional().describe(
          "Series id to file it under. Omit unless the author chose one — the " +
            "result then suggests candidates rather than guessing.",
        ),
      },
    },
    metered("write", async ({ title, blocks, seriesId }) => {
      const authorId = await getAuthorId();
      const result = await proposeNewPost({
        authorId,
        title,
        blocks: blocks as WritableBlock[],
        origin,
        seriesId,
      });
      if (!result.ok) {
        // Two refusals, and they read differently: a series that is not this
        // author's is already a whole sentence, while a block the codecs would not
        // build is a fragment that needs saying what it was trying to do.
        return fail(
          result.reason === "series-not-found"
            ? result.message
            : `Could not build the document: ${result.message}`,
        );
      }

      // A caller that named a series has already decided; only the other
      // branch pays for the extra read, and it is three columns.
      const placement = seriesId
        ? `\n\nFiled under series ${seriesId}, as asked.`
        : seriesSuggestion(await authorSeries(authorId));

      return text(
        `Created post ${result.id} ("${title}") with ${result.blockCount} block` +
          `${result.blockCount === 1 ? "" : "s"} — an unpublished draft, flagged ` +
          `agent-created and awaiting the author's accept or discard. Nobody ` +
          `else can read it until they publish it.\nstateHash: ${result.stateHash}` +
          placement,
      );
    }),
  );

  return server;
}
