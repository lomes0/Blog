/**
 * The `/` command list, and the shape a composer needs to render it.
 *
 * Lives in its own module so the composer (which draws the autocomplete and the
 * toolbar's `/` button) and the chat (which decides what a pick sends) can both
 * reach it without either importing the other.
 */
export interface SlashCommand {
  command: string;
  description: string;
  prompt: string;
  /** Acts on the open document — hidden when the conversation has none. */
  needsDocument: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/summarize",
    description: "Summarize the document",
    prompt: "Summarize the current document in 3 bullet points.",
    needsDocument: true,
  },
  {
    command: "/fix",
    description: "Fix grammar and spelling",
    prompt: "Fix any grammar and spelling mistakes in the current document.",
    needsDocument: true,
  },
  {
    command: "/improve",
    description: "Improve clarity and flow",
    prompt: "Improve the clarity and flow of the current document while " +
      "preserving its meaning.",
    needsDocument: true,
  },
  {
    command: "/section",
    description: "Add a new section",
    prompt: "Suggest and add a new section to the current document.",
    needsDocument: true,
  },
  {
    command: "/find",
    description: "Search across all posts",
    prompt: "Search my posts for ",
    needsDocument: false,
  },
];
