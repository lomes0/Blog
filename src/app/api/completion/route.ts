import { streamText } from "ai";
import { match } from "ts-pattern";
import {
  type AIOptionType,
  type AIProviderType,
  createProvider,
  getModelById,
  getSystemPrompt,
  getToneSystemPrompt,
} from "@/lib/ai";
import { ApiError, userRoute } from "@/lib/api-utils";

// Node runtime (not edge): `userRoute` reads the session through the Prisma
// adapter, which cannot run on edge. `/api/copilot` is on Node for the same
// reason. Leaving this open on edge meant anyone who found the route could spend
// the deployment's model credits without signing in.

export const POST = userRoute(async (req) => {
  const body = await req.json();
  const { provider, model: modelId, prompt, option, command, tone } = body;

  const systemPrompt = getSystemPrompt(option as AIOptionType);

  const messages = match(option)
    .with("zap", () => [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: `${command}${prompt ? `\n${prompt}` : ""}`,
      },
    ])
    .with("tone", () => [
      {
        role: "system" as const,
        content: getToneSystemPrompt(tone ?? "neutral"),
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ])
    .otherwise(() => [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ]);

  if (!modelId) {
    throw new ApiError(400, "Bad Request", "Model ID is required");
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new ApiError(404, "Model not found", `Model '${modelId}' not found`);
  }

  const providerInstance = createProvider(provider as AIProviderType);
  const modelInstance = providerInstance(model.id);

  const result = streamText({
    model: modelInstance,
    messages,
  });

  return result.toTextStreamResponse();
}, {
  errorLabel: "AI Completion error",
  signInMessage: "Please sign in to use AI assistance",
});
