import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { type AIProviderType, createProvider, getModelById } from "@/lib/ai";
import { ApiError, parseBody, userRoute } from "@/lib/api-utils";
import { permitsDocument, requireDocument } from "@/lib/access";
import { COPILOT_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import {
  buildCommandTools,
  commandToolsPromptSection,
} from "@/lib/ai/commandTools";
// The block model — schemas and prose alike — is declared once, beside the
// codecs that enforce it, and shared with `mcp/content-server.ts` so the two
// agents cannot be told different things about the same document. See
// docs/plans/ai-surface-consolidation.md §4.1.
import { BLOCK_DOC, blockSchema, opSchema } from "@/lib/content-bridge/schema";

// Node runtime (not edge): auth uses the Prisma adapter, which cannot run on edge.

// Tools are declared here (schemas only) but EXECUTED ON THE CLIENT — read
// tools auto-run against the Redux store / live editor, write tools surface as
// reviewable proposals. See src/lib/ai/copilotAgentTools.ts for the read/write
// split the client enforces.
//
// The *content* tools below are hand-written because they act on document
// bodies through the live Lexical editor, which is not a command. Everything
// the app can *do* — open, navigate, rename, describe the workspace — arrives
// via `buildCommandTools()`, generated from the command registry, so adding a
// command needs no edit to this file (plan §3.1).
// Documents are addressed by BLOCK — see docs/plans/claude-code-lexical.md.
// A read hands back addresses (b3, b4.2) and a stateHash; a write names blocks
// and carries that hash. Blocks the write does not name are left exactly as
// they were, which is why rich content no longer has to be hidden behind
// opaque tokens the agent must not touch.
const docRef = z
  .string()
  .optional()
  .describe("Document id. Omit to act on the document currently open.");

const readTools = {
  // ---- read (auto-executed client-side) ----
  list_documents: tool({
    description:
      "List every post in the blog (metadata only: id, title, series). " +
      "Cheap — call this to discover what exists before reading bodies.",
    inputSchema: z.object({}),
  }),
  search_documents: tool({
    description:
      "Search post titles and locally-available bodies for a case-insensitive " +
      "substring. Returns hits per BLOCK, each with the block address to read " +
      "or edit next.",
    inputSchema: z.object({ query: z.string() }),
  }),
  outline_document: tool({
    description:
      "Skeleton of a post: one line per block with its address, kind and a " +
      "preview, plus the stateHash. START HERE — it is far cheaper than " +
      "reading a whole post, and every other tool takes the addresses it " +
      "returns. Blocks marked [read-only] cannot be rewritten; [replace only] " +
      "means no single text field, so use replace_block rather than set_text.",
    inputSchema: z.object({ id: docRef }),
  }),
  read_blocks: tool({
    description:
      "Full content of specific blocks, by address from outline_document. " +
      "Prefer this over read_document — it is how you work on a long article " +
      "without reading all of it.",
    inputSchema: z.object({
      id: docRef,
      blocks: z.array(z.string()).min(1).describe('e.g. ["b2","b4.1"]'),
    }),
  }),
  read_document: tool({
    description:
      "The whole post as nested blocks. Use for short documents; for anything " +
      "long use outline_document then read_blocks.",
    inputSchema: z.object({ id: docRef }),
  }),
  get_selection: tool({
    description:
      "Get the user's current text selection in the open document, if any.",
    inputSchema: z.object({}),
  }),
};

/**
 * Write tools that act on the *open* document. Withheld when the caller may
 * read that document but not write it — a signed-in visitor asking about
 * someone else's published post gets answers, not edit proposals.
 *
 * This is not the security boundary. Writes execute client-side through the
 * `updatePost` / `createPost` thunks, so they land on `/api/documents/[id]`,
 * which authorizes them independently. Withholding the tools here stops the
 * agent from proposing an edit that would only fail on accept.
 */
const documentWriteTools = {
  // ---- write (proposed; applied only on user accept) ----
  apply_ops: tool({
    description:
      "Propose editing a post by block. Every op names an address from a read, " +
      "and the batch carries that read's stateHash — if the document changed " +
      "since (the user typed, say), the whole batch is refused and you re-read. " +
      "Ops apply all-or-nothing, and blocks you do not name are left exactly " +
      "as they were, so you never need to restate the rest of the document. " +
      "Ops: set_text{id,text}, replace_block{id,block}, " +
      "insert_blocks{blocks,after|before|appendTo}, delete_block{id}, " +
      "move_block{id,after|before|appendTo}. " +
      BLOCK_DOC,
    inputSchema: z.object({
      id: docRef,
      stateHash: z
        .string()
        .describe("The stateHash from the read these addresses came from"),
      ops: z.array(opSchema).min(1),
    }),
  }),
};

/**
 * Creating a post writes to the caller's *own* library, so it survives the
 * read-only branch: asking about someone else's post and then saying "draft me
 * one like it" is a reasonable thing to want.
 */
const libraryWriteTools = {
  create_document: tool({
    description:
      "Propose creating a new post from blocks. Produces real Lexical content " +
      "— proper code nodes, headings, lists and collapsibles — not fenced " +
      "Markdown in a paragraph. " +
      BLOCK_DOC,
    inputSchema: z.object({
      title: z.string(),
      blocks: z.array(blockSchema).min(1),
    }),
  }),
};

/**
 * Messages are structurally validated and then handed to `convertToModelMessages`
 * as-is: `parts` is an open union owned by the AI SDK, and restating it here
 * would be a second source of truth that drifts. The fields this route reads
 * itself — provider, model, path, title — are validated properly.
 */
const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.unknown()),
}).passthrough();

const copilotBodySchema = z.object({
  messages: z.array(messageSchema).default([]),
  documentTitle: z.string().optional(),
  /** `"<documentId>.md"` — the agent addresses posts as Markdown files. */
  currentPath: z.string().optional(),
  provider: z.string(),
  model: z.string().min(1, "Model ID is required"),
});

export const POST = userRoute(async (req, { user }) => {
  const {
    messages,
    documentTitle,
    currentPath,
    provider,
    model: modelId,
  } = await parseBody(req, copilotBodySchema);

  // An open document is authorized before anything is said about it: reading is
  // required to talk about it at all, and writing decides whether the agent is
  // handed edit tools.
  let canWriteDocument = true;
  if (currentPath) {
    try {
      const doc = await requireDocument(
        currentPath.replace(/\.md$/, ""),
        user,
        "read",
        { subtitle: "You do not have access to this post" },
      );
      canWriteDocument = permitsDocument(doc, user, "write");
    } catch (error) {
      // A missing row is not a refusal. A post can be open in the editor before
      // it has ever been saved, and the document readers read the live
      // editor client-side, so there is a real document to talk about even
      // though the server has nothing to authorize. Writes still land on
      // `/api/documents/[id]`, which authorizes them on its own.
      //
      // 403 is a refusal and stays one.
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
    }
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new ApiError(404, "Model not found", `Model '${modelId}' not found`);
  }

  const providerInstance = createProvider(provider as AIProviderType);
  const modelInstance = providerInstance(model.id);

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  const result = streamText({
    model: modelInstance,
    system: COPILOT_AGENT_SYSTEM_PROMPT(
      currentPath ?? null,
      documentTitle ?? null,
      { canWriteDocument, commandTools: commandToolsPromptSection() },
    ),
    messages: modelMessages,
    tools: {
      ...readTools,
      ...libraryWriteTools,
      ...(canWriteDocument ? documentWriteTools : {}),
      // Not gated on `canWriteDocument`: that flag is about the *open*
      // document, and a command takes whichever id it is given — withholding
      // the whole set would block renaming a post the caller does own. The
      // mutating ones are gated twice regardless: the user accepts the
      // proposal, and the API route behind it authorizes the write.
      ...buildCommandTools(),
    },
    // Agentic loop: the model explores with read tools (auto-resolved) and
    // proposes edits over many steps. Writes pause the loop for user approval.
    stopWhen: stepCountIs(40),
  });

  return result.toUIMessageStreamResponse();
}, {
  errorLabel: "Copilot error",
  signInMessage: "Please sign in to use Copilot",
});
