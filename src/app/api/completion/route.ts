import { streamText } from "ai";
import { match } from "ts-pattern";
import { z } from "zod";
import {
  AI_COMPLETION_ACTIONS,
  AI_PROVIDERS,
  completionSystemPrompt,
  createProvider,
  getModelById,
} from "@/lib/ai";
import { ApiError, parseBody, userRoute } from "@/lib/api-utils";

// Node runtime (not edge): `userRoute` reads the session through the Prisma
// adapter, which cannot run on edge. `/api/copilot` is on Node for the same
// reason. Leaving this open on edge meant anyone who found the route could spend
// the deployment's model credits without signing in.

/**
 * What the editor's AI toolbar sends. Every field of it used to arrive as
 * `await req.json()` and then be cast — the action id in particular,
 * which decided which system prompt the model was given. The ESLint rule that
 * bans that pattern under `src/app/api/**` matched only the identifier spelled
 * `request`, so naming the parameter `req` walked around it; the rule is now
 * widened (see eslint.config.mjs) and this is the route it was written for.
 *
 * `.strict()` because the sole caller is our own `useCompletion` hook, whose
 * body is exactly `{ prompt, ...options.body }` — an unexpected key here means a
 * client and a server that disagree about the request, and a 400 naming the
 * field is a better way to learn that than a silently ignored argument.
 *
 * This schema replaces the `AICompletionRequest` interface that used to sit in
 * `src/lib/ai/types.ts`: it described this body but was imported nowhere and
 * enforced nothing, so keeping both would have been two statements of one
 * contract with only one of them checked.
 */
const completionBodySchema = z.object({
  /** The text the action acts on: the selection, or the preceding prose. */
  prompt: z.string(),
  /**
   * Which canned instruction to run, by id from `src/lib/ai/actions.ts`. An
   * *id*, not the instruction itself: the toolbar and the Copilot now share one
   * wording, but the wording is still resolved server-side from the registry,
   * so a request cannot hand the model a system prompt of its own choosing.
   */
  action: z.enum(AI_COMPLETION_ACTIONS),
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1, "Model ID is required"),
  /** The user's instruction; `custom` only. */
  command: z.string().optional(),
  /**
   * `tone` only. Bounded but not enumerated: the toolbar's six tones are a menu,
   * not the contract, and this string is interpolated into the *system* prompt,
   * where an unbounded blob is worth refusing on its own.
   */
  tone: z.string().min(1).max(64).optional(),
}).strict();

export const POST = userRoute(async (request) => {
  const { provider, model: modelId, prompt, action, command, tone } =
    await parseBody(request, completionBodySchema);

  const systemPrompt = completionSystemPrompt(action, { tone });

  // Only `custom` shapes the *user* message differently — it carries the typed
  // request ahead of the text. Everything else, `tone` included, differs only
  // in the system prompt, which the registry already resolved above.
  const messages = match(action)
    .with("custom", () => [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: `${command}${prompt ? `\n${prompt}` : ""}`,
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

  // A missing or empty `model` is now the schema's 400, not a hand-written one.
  // An id that is well-formed but unknown still is not: only the registry can
  // say so.
  const model = getModelById(modelId);
  if (!model) {
    throw new ApiError(404, "Model not found", `Model '${modelId}' not found`);
  }

  const providerInstance = createProvider(provider);
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
