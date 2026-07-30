import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { type AIProviderType, createProvider, getModelById } from "@/lib/ai";
import { ApiError, userRoute } from "@/lib/api-utils";
import { COPILOT_AGENT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

// Node runtime (not edge): auth uses the Prisma adapter, which cannot run on edge.

// Tools are declared here (schemas only) but EXECUTED ON THE CLIENT — read
// tools auto-run against the Redux store / live editor, write tools surface as
// reviewable proposals. See src/lib/ai/copilotAgentTools.ts for the read/write
// split the client enforces.
const agentTools = {
  // ---- read (auto-executed client-side) ----
  list_documents: tool({
    description:
      "List every post in the blog (metadata only: path, title, series). " +
      "Cheap — call this to discover what exists before reading bodies.",
    inputSchema: z.object({}),
  }),
  search_documents: tool({
    description:
      "Grep across post titles and locally-available bodies for a " +
      "case-insensitive substring. Returns per-line hits with their path.",
    inputSchema: z.object({ query: z.string() }),
  }),
  read_document: tool({
    description:
      "Read one post's body as Markdown by its path (e.g. \"<id>.md\"). " +
      "Rich elements appear as opaque [[lexblk:...]] tokens — never edit their " +
      "contents.",
    inputSchema: z.object({ path: z.string() }),
  }),
  read_current_document: tool({
    description:
      "Read the currently open document as Markdown, including any unsaved " +
      "edits in the editor.",
    inputSchema: z.object({}),
  }),
  get_selection: tool({
    description:
      "Get the user's current text selection in the open document, if any.",
    inputSchema: z.object({}),
  }),

  // ---- write (proposed; applied only on user accept) ----
  edit_document: tool({
    description:
      "Propose replacing an exact substring in a post. old_text must match " +
      "the document verbatim (including whitespace) and must not cut through " +
      "an [[lexblk:...]] token. Prefer this for targeted edits.",
    inputSchema: z.object({
      path: z.string(),
      old_text: z.string(),
      new_text: z.string(),
    }),
  }),
  write_document: tool({
    description:
      "Propose replacing a post's ENTIRE body with new Markdown. Use for " +
      "large rewrites. Preserve any [[lexblk:...]] tokens you want to keep.",
    inputSchema: z.object({ path: z.string(), markdown: z.string() }),
  }),
  create_document: tool({
    description: "Propose creating a new post with a title and Markdown body.",
    inputSchema: z.object({ title: z.string(), markdown: z.string() }),
  }),
};

export const POST = userRoute(async (req) => {
  const body = await req.json();
  const {
    messages,
    documentTitle,
    currentPath,
    provider,
    model: modelId,
  } = body as {
    messages: UIMessage[];
    documentTitle?: string;
    currentPath?: string;
    provider: AIProviderType;
    model: string;
  };

  if (!modelId) {
    throw new ApiError(400, "Bad Request", "Model ID is required");
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new ApiError(404, "Model not found", `Model '${modelId}' not found`);
  }

  const providerInstance = createProvider(provider);
  const modelInstance = providerInstance(model.id);

  const modelMessages = await convertToModelMessages(messages ?? []);

  const result = streamText({
    model: modelInstance,
    system: COPILOT_AGENT_SYSTEM_PROMPT(
      currentPath ?? "current.md",
      documentTitle ?? "Untitled",
    ),
    messages: modelMessages,
    tools: agentTools,
    // Agentic loop: the model explores with read tools (auto-resolved) and
    // proposes edits over many steps. Writes pause the loop for user approval.
    stopWhen: stepCountIs(40),
  });

  return result.toUIMessageStreamResponse();
}, {
  errorLabel: "Copilot error",
  signInMessage: "Please sign in to use Copilot",
});
