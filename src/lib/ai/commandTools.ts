/**
 * The Copilot's command tools, **generated** from the command registry.
 *
 * This is the module that makes plan §3.1's guarantee structural: the tool list
 * is derived from `commandRegistry`, so a feature that ships as a command is
 * callable by the agent the moment it exists, and `api/copilot/route.ts` never
 * has to be edited to add one. `src/commands/__tests__/toolParity.test.ts` is
 * what keeps it honest.
 *
 * Two things it is deliberately NOT:
 *
 * - **Not a replacement for the content tools.** `read_document`,
 *   `apply_ops` and friends (`copilotAgentTools.ts`) operate on document
 *   *bodies* through the live Lexical editor and IndexedDB. They are not
 *   registry commands and forcing them into it would put a Lexical editor
 *   behind `CommandContext`. Command tools are additive.
 * - **Not a security boundary.** Like the content tools, these are declared with
 *   schemas only and executed client-side; every write behind them lands on an
 *   API route that authorizes on its own session.
 *
 * Imported by both the server route (for the declarations) and the browser (for
 * the executor), so it must stay free of anything either side cannot load —
 * which is also why `src/commands` has no static `@/store` edge.
 */
import { type JSONSchema7, jsonSchema, tool, zodSchema } from "ai";
import { isReadTool, isWriteTool } from "./copilotAgentTools";
import {
  type CommandContext,
  type CommandResult,
  commandRegistry,
  type ErasedCommand,
  type ProposedChange,
} from "@/commands";

/**
 * Namespaced so a command tool can never collide with a content tool, and so
 * the two are distinguishable by name alone on the client — which is what the
 * auto-run vs. propose split below is decided on.
 *
 * Dots are not allowed in tool names by most providers, so `document.open`
 * becomes `command_document_open`.
 */
const TOOL_PREFIX = "command_";

export const toolNameForCommand = (commandId: string): string =>
  TOOL_PREFIX + commandId.replace(/\./g, "_");

const BY_TOOL_NAME: ReadonlyMap<string, ErasedCommand> = new Map(
  commandRegistry.map((command) => [
    toolNameForCommand(command.id),
    command,
  ]),
);

/** The command a tool name refers to, or undefined if it is not one. */
export const commandForTool = (name: string): ErasedCommand | undefined =>
  BY_TOOL_NAME.get(name);

/**
 * An object JSON Schema for a command's parameters.
 *
 * `zodSchema` is the AI SDK's own zod→JSON Schema conversion, so a tool
 * declared here is described to the model exactly as a hand-written `tool()`
 * would be. The one case it cannot answer is `z.void()` — a command that takes
 * no parameters — which converts to a bare `{}` with no `type`. Providers
 * require an object schema for tool input, so that is normalized here.
 *
 * Throws on anything else that is not an object schema, rather than shipping a
 * declaration the model will misuse.
 */
export function commandInputSchema(command: ErasedCommand): JSONSchema7 {
  const converted = zodSchema(command.params).jsonSchema as JSONSchema7;
  if (converted.type === "object") return converted;
  // z.void() / z.undefined(): "no parameters", spelled as the empty object.
  if (converted.type === undefined && !converted.anyOf && !converted.$ref) {
    return { type: "object", properties: {}, additionalProperties: false };
  }
  throw new Error(
    `${command.id}: params must convert to an object JSON Schema, got ` +
      JSON.stringify(converted),
  );
}

/**
 * What the model is told a command does. `description` is written for it;
 * `title` is a button label and only a fallback.
 *
 * The effect is appended rather than left implicit: a model that does not know
 * a call will be held for review narrates the change as already made.
 */
export function commandToolDescription(command: ErasedCommand): string {
  const body = command.description ?? command.title;
  return command.effect === "mutate"
    ? `${body} PROPOSAL — the user reviews and accepts this before it happens.`
    : body;
}

/** Every command, as AI SDK tool declarations keyed by tool name. */
export function buildCommandTools() {
  return Object.fromEntries(
    commandRegistry.map((command) => [
      toolNameForCommand(command.id),
      tool({
        description: commandToolDescription(command),
        inputSchema: jsonSchema(commandInputSchema(command)),
      }),
    ]),
  );
}

/**
 * The command-tool section of the system prompt, generated from the same list.
 *
 * Hand-writing it would reintroduce exactly the drift the registry exists to
 * prevent — the tool would be callable and the prompt would not mention it.
 */
export function commandToolsPromptSection(): string {
  const lines = commandRegistry.map((command) =>
    `- ${toolNameForCommand(command.id)}: ${commandToolDescription(command)}`
  );
  return `COMMAND TOOLS\n` +
    `These drive the app itself — what is open, how it is shown, where the ` +
    `user is. They take entity ids, never URLs.\n` +
    lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Client-side execution                                              */
/* ------------------------------------------------------------------ */

/**
 * Whether a tool call is resolved without asking the user.
 *
 * `read` commands observe or navigate, which is the same bargain the content
 * read tools strike: cheap, reversible, and the agent loop stalls without them.
 */
export const isAutoRunCommandTool = (name: string): boolean =>
  commandForTool(name)?.effect === "read";

/** Whether a tool call is held as a proposal until the user accepts it. */
export const isProposalCommandTool = (name: string): boolean =>
  commandForTool(name)?.effect === "mutate";

/**
 * The two questions the chat UI actually asks of a tool call, across *both*
 * families: does it run on arrival, or does it wait for the user?
 *
 * Content tools answer with a hand-maintained list because they are not
 * commands; command tools answer from `effect`. Everything downstream — the
 * activity trace, the pending count, "Accept all" — asks these rather than
 * either list, so a new command joins all of it for free.
 */
export const isAutoRunTool = (name: string): boolean =>
  isReadTool(name) || isAutoRunCommandTool(name);

export const isProposalTool = (name: string): boolean =>
  isWriteTool(name) || isProposalCommandTool(name);

/** Run a command tool call and return a JSON-serializable result. */
export async function runCommandTool(
  name: string,
  input: unknown,
  ctx: CommandContext,
): Promise<CommandResult> {
  const command = commandForTool(name);
  if (!command) {
    return { status: "error", message: `Unknown command tool: ${name}` };
  }
  return command.invoke(ctx, input);
}

/**
 * The dry run behind a pending proposal, or null when the command declines to
 * produce one. A throw is not swallowed — see `defineCommand`.
 */
export async function previewCommandTool(
  name: string,
  input: unknown,
  ctx: CommandContext,
): Promise<ProposedChange | null> {
  const command = commandForTool(name);
  if (!command?.previewInvoke) return null;
  return command.previewInvoke(ctx, input);
}
