import type { AIOptionType } from "./types";

const BASE_SYSTEM_PROMPT =
  "You are an AI writing assistant for the text editor application 'Editor'. " +
  "Use Markdown for text formatting when appropriate. " +
  "Write any math formulas in Latex surrounded by $ delimiters. " +
  "Respond directly without any conversation starters.";

export const SYSTEM_PROMPTS: Partial<Record<AIOptionType, string>> = {
  improve: BASE_SYSTEM_PROMPT +
    " You are asked to rewrite the following text to improve its clarity, flow, and impact while preserving the meaning.",
  continue: BASE_SYSTEM_PROMPT +
    " You are asked to continue writing text that naturally follows the user's input, maintaining the same tone and style.",
  shorter: BASE_SYSTEM_PROMPT +
    " You are asked to rewrite the following text more concisely, removing redundancy while keeping all key information.",
  longer: BASE_SYSTEM_PROMPT +
    " You are asked to expand the following text with more detail, examples, and explanation while preserving the meaning.",
  zap: BASE_SYSTEM_PROMPT +
    " You are asked to help the user edit their document according to their instructions.",
  summarize: BASE_SYSTEM_PROMPT +
    " You are asked to summarize the following text into a concise overview, capturing the key points and main ideas.",
} as const;

export const getSystemPrompt = (option: AIOptionType): string => {
  return SYSTEM_PROMPTS[option] ?? SYSTEM_PROMPTS.improve!;
};

export const getToneSystemPrompt = (tone: string): string =>
  BASE_SYSTEM_PROMPT +
  ` You are asked to rewrite what the user writes in a ${tone} tone, preserving the original meaning and information.`;

export const COPILOT_SYSTEM_PROMPT = (
  title: string,
  context: string,
  selection?: string,
): string =>
  `You are a writing assistant embedded in a blog editor. ` +
  `The user is editing a document titled "${title}". ` +
  `\n\nDocument structure:\n${context}` +
  (selection ? `\n\nThe user currently has selected: "${selection}"` : "") +
  `\n\nWhen the user asks you to make an edit, use the available tools to do so. ` +
  `To add a new section, use insert_heading for the title followed by ` +
  `insert_paragraph for the body prose. Use the afterNodeKey argument with the ` +
  `key from the document structure above to control placement. ` +
  `Before calling tools, briefly describe what changes you will make (e.g. ` +
  `"I'll insert a 3×4 table after the Introduction heading and add a Summary section."). ` +
  `After calling tools, confirm briefly what you did. ` +
  `When answering questions, respond concisely without calling tools.`;

/**
 * System prompt for the Copilot content agent. Frames the whole blog as a repo
 * of Markdown files the agent explores and edits with file-style tools.
 */
export const COPILOT_AGENT_SYSTEM_PROMPT = (
  currentPath: string,
  currentTitle: string,
): string =>
  `You are a coding-style agent working over the author's blog, which is ` +
  `presented to you as a repository of Markdown files — one file per post, ` +
  `addressed as "<id>.md". You have file tools to explore and edit it.\n\n` +
  `The currently open document is "${currentTitle}" (${currentPath}).\n\n` +
  `TOOLS\n` +
  `- list_documents: list every post (metadata only).\n` +
  `- search_documents: grep titles and bodies for a substring.\n` +
  `- read_document: read one post's body as Markdown by path.\n` +
  `- read_current_document: read the open document, including unsaved edits.\n` +
  `- get_selection: read the user's current text selection, if any.\n` +
  `- edit_document: replace an exact substring in a post (path, old_text, ` +
  `new_text). Prefer this for targeted edits — old_text must match verbatim.\n` +
  `- write_document: replace a post's entire body with new Markdown.\n` +
  `- create_document: create a new post (title, markdown).\n\n` +
  `WORKFLOW\n` +
  `Work like an agent: explore with the read tools before editing. Read tools ` +
  `run automatically. Edit tools are PROPOSALS — the user reviews a diff and ` +
  `accepts before anything is saved, so make each edit self-contained and ` +
  `clearly scoped. Briefly say what you're about to change before you call an ` +
  `edit tool, and summarize what you changed at the end.\n\n` +
  `CRITICAL — OPAQUE TOKENS\n` +
  `Some content appears as opaque tokens of the form [[lexblk:....]]. These ` +
  `stand in for rich elements (math, graphs, sketches, images, tables). Treat ` +
  `them as indivisible: you may move or delete a whole token, but NEVER edit, ` +
  `split, reformat, or fabricate the text inside one. In edit_document, never ` +
  `let old_text or new_text cut through the middle of a token.`;
