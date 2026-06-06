import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import type { UIMessage } from "ai";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { type AIProviderType, createProvider, getModelById } from "@/lib/ai";
import { ApiError, withApiHandler } from "@/lib/api-utils";
import { authOptions } from "@/lib/auth";
import { COPILOT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

// Node runtime (not edge): auth uses the Prisma adapter, which cannot run on edge.

const editorTools = {
  insert_paragraph: tool({
    description: "Insert a paragraph of plain prose. Use this to add body " +
      "text or a new section's content (pair with insert_heading for the " +
      "section title).",
    inputSchema: z.object({
      text: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  }),
  remove_node: tool({
    description: "Remove a node (image, table, paragraph, heading, etc.)",
    inputSchema: z.object({ nodeKey: z.string() }),
  }),
  insert_table: tool({
    description: "Insert a table at cursor or after a node",
    inputSchema: z.object({
      rows: z.number(),
      cols: z.number(),
      headers: z.array(z.string()).optional(),
      afterNodeKey: z.string().optional(),
    }),
  }),
  insert_heading: tool({
    description: "Insert a heading",
    inputSchema: z.object({
      level: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
      ]),
      text: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  }),
  insert_list: tool({
    description: "Insert a bullet or numbered list",
    inputSchema: z.object({
      type: z.enum(["bullet", "numbered"]),
      items: z.array(z.string()),
      afterNodeKey: z.string().optional(),
    }),
  }),
  insert_code_block: tool({
    description: "Insert a code block",
    inputSchema: z.object({
      language: z.string(),
      code: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  }),
  insert_math: tool({
    description: "Insert a math equation",
    inputSchema: z.object({
      latex: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  }),
  insert_horizontal_rule: tool({
    description: "Insert a horizontal divider",
    inputSchema: z.object({ afterNodeKey: z.string().optional() }),
  }),
  replace_text: tool({
    description: "Replace the text content of a paragraph or heading node. " +
      "WARNING: This destroys inline formatting (bold, italic, links). " +
      "Only use on plain-text nodes.",
    inputSchema: z.object({ nodeKey: z.string(), newText: z.string() }),
  }),
  replace_selection: tool({
    description: "Replace the currently selected text with new content",
    inputSchema: z.object({ newText: z.string() }),
  }),
};

export const POST = withApiHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new ApiError(401, "Unauthorized", "Please sign in to use Copilot");
  }

  const body = await req.json();
  const {
    messages,
    documentTitle,
    documentContext,
    selectedText,
    provider,
    model: modelId,
  } = body as {
    messages: UIMessage[];
    documentTitle?: string;
    documentContext?: string;
    selectedText?: string;
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
    system: COPILOT_SYSTEM_PROMPT(
      documentTitle ?? "Untitled",
      documentContext ?? "",
      selectedText,
    ),
    messages: modelMessages,
    tools: editorTools,
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}, { context: "Copilot error" });
