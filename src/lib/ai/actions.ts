/**
 * The canned AI instructions, written once.
 *
 * "Summarize this" used to be spelled out in three places — `SYSTEM_PROMPTS`
 * for the editor toolbar, `SLASH_COMMANDS` for the Copilot's `/` menu and
 * `QUICK_ACTIONS` for its empty-state chips — with three different wordings.
 * This is the one list; every surface renders from it and sends the same
 * `instruction`.
 *
 * ## Data only, deliberately
 *
 * `/api/completion` imports this module (through `@/lib/ai`) to build the
 * system prompt, so nothing here may pull in React. The id → icon mapping the
 * two render sites share therefore lives next door in `actionIcons.ts`, which
 * is *not* re-exported from the barrel.
 *
 * ## What is not in here
 *
 * `tone` and `custom` are parameterized, not canned: their instruction is
 * completed by a value the user supplies (a tone name, a typed request). They
 * would each have to be either six near-identical rows or an `instruction` that
 * is a function for one row alone, so they sit beside the registry rather than
 * inside it — still in this module, so their wording is still written once.
 */

/**
 * How the toolbar treats the streamed result. Only selection-scoped actions
 * have one, and every selection-scoped action must — see {@link AIAction}.
 */
export interface AIActionToolbar {
  /**
   * What text the completion is given: the selected text, or the prose leading
   * up to the caret. `"precedingText"` also means the action runs with nothing
   * selected, so the toolbar leaves it enabled on a bare caret.
   */
  input: "selection" | "precedingText";
  /**
   * Where the stream lands. `"replace"` writes over the selection (the caret
   * is already where the result belongs); `"append"` first collapses the
   * selection to its end, so the result follows the selected text instead of
   * consuming it. `continue` is the only action that appends, and that is real
   * behaviour rather than duplication.
   */
  result: "replace" | "append";
}

interface AIActionBase {
  /**
   * Stable id. Doubles as the `/` token in the Copilot composer (`/summarize`)
   * and as the wire value of `action` in `/api/completion`, so it is lowercase
   * and single-word on purpose.
   */
  id: string;
  /** Menu item and chip label. */
  label: string;
  /** One line, shown under the token in the `/` menu. */
  description: string;
  /** The one wording. System prompt on the toolbar path, chat prompt in the Copilot. */
  instruction: string;
  /**
   * The instruction is a prefix the user finishes rather than a whole prompt;
   * picking it fills the composer instead of sending.
   */
  partial?: true;
}

/**
 * `scope` is the narrowest subject an action needs to run, and a surface offers
 * every action whose subject it can supply — which is what lets `summarize` be
 * one row rather than a selection-scoped copy and a document-scoped copy:
 *
 * - the editor toolbar has a selection, so it renders `"selection"`;
 * - the Copilot has the open document (and can read the selection through
 *   `get_selection`), so it renders everything;
 * - the Copilot with no document open renders `"library"` only.
 *
 * The union also makes `toolbar` present exactly when it is meaningful: a
 * selection-scoped action must say how it streams, and no other kind may.
 */
export type AIAction =
  & AIActionBase
  & (
    | { scope: "selection"; toolbar: AIActionToolbar }
    | { scope: "document" | "library"; toolbar?: never }
  );

export const AI_ACTIONS = [
  {
    id: "continue",
    label: "Continue writing",
    description: "Carry on from where the text leaves off",
    instruction:
      "Continue writing text that naturally follows on from what is there, " +
      "maintaining the same tone and style.",
    scope: "selection",
    toolbar: { input: "precedingText", result: "append" },
  },
  {
    id: "improve",
    label: "Improve writing",
    description: "Improve clarity and flow",
    instruction:
      "Rewrite the text to improve its clarity, flow and impact while " +
      "preserving the meaning.",
    scope: "selection",
    toolbar: { input: "selection", result: "replace" },
  },
  {
    id: "shorter",
    label: "Make shorter",
    description: "Rewrite more concisely",
    instruction:
      "Rewrite the text more concisely, removing redundancy while keeping all " +
      "key information.",
    scope: "selection",
    toolbar: { input: "selection", result: "replace" },
  },
  {
    id: "longer",
    label: "Make longer",
    description: "Expand with more detail",
    instruction:
      "Expand the text with more detail, examples and explanation while " +
      "preserving the meaning.",
    scope: "selection",
    toolbar: { input: "selection", result: "replace" },
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize the key points",
    instruction:
      "Summarize the text into a concise overview, capturing the key points " +
      "and main ideas.",
    scope: "selection",
    toolbar: { input: "selection", result: "replace" },
  },
  {
    id: "fix",
    label: "Fix grammar",
    description: "Fix grammar and spelling",
    instruction:
      "Fix any grammar and spelling mistakes in the text, changing nothing " +
      "else.",
    scope: "selection",
    toolbar: { input: "selection", result: "replace" },
  },
  {
    id: "section",
    label: "Add a section",
    description: "Add a new section",
    instruction: "Suggest and add a new section to the current document.",
    scope: "document",
  },
  {
    id: "find",
    label: "Search posts",
    description: "Search across all posts",
    instruction: "Search my posts for ",
    scope: "library",
    partial: true,
  },
] as const satisfies readonly AIAction[];

type AnyAIAction = (typeof AI_ACTIONS)[number];

export type AIActionId = AnyAIAction["id"];

/** An action the editor toolbar can stream in place, with its `toolbar` narrowed. */
export type SelectionAIAction = Extract<AnyAIAction, { scope: "selection" }>;

/**
 * The toolbar's list. Written as a filter over the one registry rather than a
 * second array, so adding a selection-scoped action adds it to the toolbar and
 * the Copilot in the same edit.
 */
export const AI_TOOLBAR_ACTIONS = AI_ACTIONS.filter(
  (action): action is SelectionAIAction => action.scope === "selection",
);

export const getAIAction = (id: string): AIAction | undefined =>
  AI_ACTIONS.find((action) => action.id === id);

/**
 * Every value `action` may take in a `/api/completion` body: the toolbar's
 * actions, plus the two parameterized ones. Document- and library-scoped
 * actions are excluded — they are Copilot chat prompts and never reach this
 * route, so accepting their ids here would widen the contract for nothing.
 */
export type AICompletionAction = SelectionAIAction["id"] | "tone" | "custom";

// The assertion only tells TypeScript the array is non-empty, which `z.enum`
// requires and the two leading literals make obvious. It does not widen or
// invent members.
export const AI_COMPLETION_ACTIONS = [
  "tone",
  "custom",
  ...AI_TOOLBAR_ACTIONS.map((action) => action.id),
] as [AICompletionAction, ...AICompletionAction[]];

const BASE_SYSTEM_PROMPT =
  "You are an AI writing assistant for the text editor application 'Editor'. " +
  "Use Markdown for text formatting when appropriate. " +
  "Write any math formulas in Latex surrounded by $ delimiters. " +
  "Respond directly without any conversation starters.";

/** The instruction behind the toolbar's free-text prompt field. */
const CUSTOM_INSTRUCTION =
  "You are asked to help the user edit their document according to their " +
  "instructions.";

/**
 * The tones the toolbar offers. A menu, not the contract: `/api/completion`
 * bounds the `tone` string but deliberately does not enumerate it.
 */
export const AI_TONES = [
  "Professional",
  "Casual",
  "Friendly",
  "Academic",
  "Persuasive",
  "Direct",
] as const;

const toneInstruction = (tone: string): string =>
  `Rewrite what the user writes in a ${tone} tone, preserving the original ` +
  `meaning and information.`;

/**
 * The system prompt `/api/completion` sends for an action. The base framing is
 * server-side and the same for every action; only the instruction varies, and
 * it comes from the registry above rather than from the request — which is why
 * the route validates an id and not a prompt string.
 */
export const completionSystemPrompt = (
  action: AICompletionAction,
  options?: { tone?: string },
): string => {
  const instruction = action === "custom"
    ? CUSTOM_INSTRUCTION
    : action === "tone"
    ? toneInstruction(options?.tone ?? "neutral")
    // Validated by the route's `z.enum`, so the fallback is unreachable; it is
    // here so a lookup miss degrades to a sane rewrite rather than a 500.
    : getAIAction(action)?.instruction ?? CUSTOM_INSTRUCTION;
  return `${BASE_SYSTEM_PROMPT} ${instruction}`;
};
