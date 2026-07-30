"use client";

/**
 * Hand a prompt to the Copilot from outside the panel.
 *
 * The home pane's composer is an entry point to the same agent the Copilot
 * panel drives, so it needs to open the panel *and* seed the first message.
 * Those two things race: `setCopilotOpen(true)` mounts `CopilotChat` on a later
 * render, so an event dispatched immediately after would land before anything
 * is listening.
 *
 * Hence a holder plus an event rather than an event alone — whichever happens
 * first wins. A chat that is already mounted picks the prompt up from the
 * event; one that mounts a beat later picks it up from the holder on mount.
 * Either way `consumePendingPrompt` clears it, so the prompt sends exactly once.
 *
 * Same shape as `openCommandPalette` in `CommandPalette.tsx`: a module function
 * over a window event, so entry points do not have to be wired through Redux.
 */

export const ASK_COPILOT_EVENT = "ask-copilot";

let pendingPrompt: string | null = null;

/** Queue `prompt` as the Copilot's next message and wake a mounted chat. */
export const askCopilot = (prompt: string): void => {
  pendingPrompt = prompt;
  window.dispatchEvent(new CustomEvent(ASK_COPILOT_EVENT));
};

/** Take the queued prompt, if any. Clears it — a prompt is delivered once. */
export const consumePendingPrompt = (): string | null => {
  const prompt = pendingPrompt;
  pendingPrompt = null;
  return prompt;
};
