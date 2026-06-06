 full roadmap, rendered-snippet previews, and auth the route. Here's the concrete, file-level plan I'd execute. I'm presenting it for sign-off before writing any code.

  Phase 1 — Honest & safe

  1a. Add insert_paragraph capability
  - src/app/api/copilot/route.ts: new insert_paragraph tool — { text: string, afterNodeKey?: string }.
  - src/editor/utils/copilotToolExecutors.ts: insertParagraph executor (mirrors insertHeading), register in EXECUTORS.
  - src/lib/ai/prompts.ts: mention prose insertion so the model prefers it for "add a section".

  1b. Rendered content previews (replaces tool-name-only cards)
  - New src/components/CopilotPanel/ActionPreview.tsx: given a pending tool part (type, input), render a compact, human preview:
    - insert_heading → "H2 · {text}"
    - insert_paragraph → first ~140 chars of text
    - insert_list → first 3 items + "(+N more)"
    - insert_table → "3 × 4 table" + headers
    - insert_code_block → language chip + 3-line snippet
    - insert_math → the LaTeX
    - remove_node / replace_text → "Replaces node {key}" with a warning color
  - CopilotMessage.tsx: render <ActionPreview> per pending part instead of the joined formatToolName line. Keep Accept/Discard.

  1c. Authenticate the route
  - src/app/api/copilot/route.ts: getServerSession(authOptions); throw ApiError(401, …) if absent. Copilot becomes a signed-in feature (acceptable — it's already a server/cloud call).
  - CopilotChat.tsx: surface a friendly 401 ("Sign in to use Copilot") instead of a raw error.

  1d. Remove dead controls
  - CopilotPanel.tsx: remove the non-functional Expand (Maximize2) button now; the History button gets wired in Phase 2 (leave but disabled with a tooltip until then).
  - CopilotChat.tsx: remove the non-functional @ button and drop "or / for commands" from the placeholder until slash commands land (Phase 3).
  - QuickActions.tsx: fix the duplicate Plus icon (use SpellCheck for grammar, FilePlus/ListPlus for add-section).

  Phase 2 — Conversation quality

  2a. Persist chat per document
  - New src/store/copilot.ts slice (or extend ui.copilot): Record<documentId, UIMessage[]>, persisted to IndexedDB (reuse src/indexeddb).
  - CopilotChat.tsx: seed useChat({ messages }) from the store and write back on change; key conversation by documentId so switching docs/tabs swaps threads.
  - Wire the header History button to a thread list / "new conversation" with a confirm before discard.

  2b. Render markdown in assistant messages
  - CopilotMessage.tsx: render assistant text through the project's existing markdown renderer (I'll check what's already used — likely react-markdown or the Lexical markdown utils) instead of pre-wrap. User bubbles stay plain.

  2c. Message ergonomics
  - Auto-send quick actions (send on click instead of only filling input).
  - Per-message Copy and assistant Regenerate (re-run last user turn).

  Phase 3 — Editing depth

  3a. Non-destructive text edits
  - Replace replace_text's paragraph-nuking behavior with an in-place text-content update that preserves the node (and ideally inline formatting), or add an Undo affordance on the applied chip that calls Lexical undo.

  3b. Long-document handling
  - serializeForCopilot.ts: when the 12k budget is hit, the current <!-- document truncated --> marker is good, but I'll also pass a truncation flag the UI can show ("Copilot only sees the first part of this long doc") so users know edits
  beyond the cut are blind.

  3c. Slash commands
  - Lightweight / menu in the input (/summarize, /fix, /section, /table) mapping to prompts — then restore the placeholder hint.

  ---
  Notes & sequencing

  - I'd ship Phase 1 as one reviewable change (it's the trust/safety core), then 2, then 3 as separate changes.
  - Two things I'll verify before coding: (1) which markdown renderer the repo already uses (avoid adding a dep), and (2) the exact ui.copilot shape in store/app.ts so persistence fits the existing pattern.
  - All UI work will follow DESIGN.md conventions.

  Want me to start on Phase 1? I can begin with 1a + 1b (the capability + preview pair, most visible) and put it up for review before touching auth and the dead controls — or do all of Phase 1 in one pass. Your call.
