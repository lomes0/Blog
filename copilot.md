# Copilot Chat — Implementation Plan

Side-panel AI chat integrated with the Lexical editor. The AI can read the
document, answer questions, and make structural edits (insert tables, remove
nodes, rewrite paragraphs, etc.) by calling editor tools that execute directly
against the Lexical editor instance.

---

## Architecture Overview

```
┌──────────────────────────────┬────────────────────────┐
│  Lexical Editor (flex: 1)    │  CopilotPanel (320px)  │
│                              ├────────────────────────┤
│  [selected text highlighted] │  messages list         │
│                              │                        │
│                              │  ┌──────────────────┐  │
│                              │  │ Assistant message │  │
│                              │  │ [Apply] [Dismiss] │  │
│                              │  └──────────────────┘  │
│                              ├────────────────────────┤
│                              │  Quick actions chips   │
│                              │  [Ask anything...]  >  │
└──────────────────────────────┴────────────────────────┘
```

### How tool use works

The AI does not execute tools directly against the database or file system.
Tools are editor mutations defined on the client. The flow:

1. Client sends `{ messages, documentContext, documentTitle }` to `/api/copilot`
2. Server calls Claude (via AI SDK `streamText`) with tool definitions — **no
   `execute` functions**; the server is a planner only
3. Claude either responds with text, or calls one or more tools
4. Tool calls stream back to the client as first-class AI SDK stream parts
   (not a sentinel string hack)
5. Client renders the streamed text; pending tool invocations accumulate in
   `message.toolInvocations` with `state: "call"`
6. The message shows an **Apply** button listing the pending actions
7. Clicking Apply:
   a. Runs the tool executors against `editorRef` from `ActiveEditorContext`
   b. Calls `addToolResult` for each invocation, which sends the results back
      to the server and triggers the next model step (agentic continuation)
8. Clicking Dismiss drops the pending invocations without calling `addToolResult`

This keeps Lexical mutations on the client, uses the AI SDK's native tool-call
stream format (no sentinel), gives users explicit control before mutations fire,
and preserves multi-step agentic behavior through `addToolResult`.

---

## File Map

```
src/
├── app/api/copilot/
│   └── route.ts                        Stage 2 — new API route
│
├── contexts/
│   └── ActiveEditorContext.ts          Stage 5 — editor ref context
│
├── editor/
│   ├── utils/
│   │   ├── serializeForCopilot.ts      Stage 1 — doc serializer
│   │   └── copilotToolExecutors.ts     Stage 4 — Lexical mutations
│   └── plugins/
│       └── CopilotPlugin/              Stage 4 — editor-side bridge
│           └── index.tsx
│
├── components/
│   └── CopilotPanel/                   Stages 5–6 — UI
│       ├── CopilotPanel.tsx            panel shell + layout
│       ├── CopilotChat.tsx             useChat + message list + input
│       ├── CopilotMessage.tsx          single message + Apply
│       └── QuickActions.tsx            chip shortcuts
│
└── store/
    └── app.ts                          Stage 3 — add ui.copilot.open only
```

Existing files modified:

| File                                                   | Change                                   |
| ------------------------------------------------------ | ---------------------------------------- |
| `src/components/EditDocument/TabbedDocumentEditor.tsx` | Add split layout, set ActiveEditorContext |
| `src/components/EditDocument/EditorTabPanel.tsx`       | Expose editorRef via callback prop       |
| `src/editor/plugins/ToolbarPlugin/index.tsx`           | Add copilot toggle button                |
| `src/store/app.ts`                                     | Add `ui.copilot.open: boolean` only      |
| `src/lib/ai/prompts.ts`                                | Add copilot system prompt                |

---

## Stage 1 — Document Serializer

**Goal:** Produce an annotated XML representation of the Lexical document that
Claude can read and reference. Every node that the AI may need to act on carries
a `key` attribute so it can be targeted by a tool call.

**New file:** `src/editor/utils/serializeForCopilot.ts`

```ts
import { $getRoot, LexicalEditor } from "lexical";
// ... node type imports

export function serializeForCopilot(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot();
    return serializeNode(root);
  });
}
```

### Node serialization rules

Each node emits an XML element. The `key` attribute is always included. Text
content is inlined. Custom nodes get a self-closing tag with their relevant
attributes.

| Lexical node        | XML output                                                 |
| ------------------- | ---------------------------------------------------------- |
| HeadingNode (h1–h6) | `<heading level="2" key="k1">text</heading>`               |
| ParagraphNode       | `<paragraph key="k2">text</paragraph>`                     |
| QuoteNode           | `<quote key="k3">text</quote>`                             |
| ListNode (bullet)   | `<list type="bullet" key="k4"><item>…</item></list>`       |
| ListNode (numbered) | `<list type="numbered" key="k5">…</list>`                  |
| HorizontalRuleNode  | `<hr key="k6" />`                                          |
| ImageNode           | `<image key="k7" src="…" alt="…" />`                       |
| TableNode           | `<table key="k8" rows="3" cols="4">markdown table</table>` |
| CodeNode            | `<code key="k9" language="ts">…</code>`                    |
| MathNode            | `<math key="k10" latex="\int x dx" />`                     |
| GraphNode           | `<graph key="k11" title="…" />`                            |
| SketchNode          | `<sketch key="k12" />`                                     |
| AttachmentNode      | `<attachment key="k13" name="…" />`                        |
| IFrameNode          | `<iframe key="k14" src="…" />`                             |
| KanbanNode          | `<kanban key="k15" />`                                     |
| DetailsNode         | `<details key="k16" summary="…">content</details>`         |

Inline formatting (bold, italic, underline) is omitted — the AI does not need it
to make structural edits. Plain text content is sufficient.

The serialized output is kept under ~3000 tokens. If the document exceeds this,
truncate body paragraphs to their first sentence and note `[truncated]`.

---

## Stage 2 — API Route

**Goal:** An endpoint that accepts the chat thread plus document context, runs
the Claude tool-use agentic loop server-side, and streams back text and tool
calls as AI SDK data stream parts. No sentinel hacks, no `collectedActions`
array — tool calls are first-class stream events.

**New file:** `src/app/api/copilot/route.ts`

```ts
export const runtime = "edge";
export const POST = withApiHandler(async (req: Request) => { ... });
```

**Edge runtime note:** Before shipping, verify all AI provider adapters used
by this codebase have no Node-only deps (`fs`, `path`, Node-specific `crypto`,
etc.). Any provider using a Node SDK will fail silently on Vercel Edge. Use
`export const runtime = "nodejs"` as a fallback if needed.

### Request body

```ts
{
  messages: CoreMessage[];       // AI SDK message format (includes toolInvocations)
  documentTitle: string;
  documentContext: string;       // output of serializeForCopilot()
  selectedText?: string;         // if user has a selection active
  provider: AIProviderType;
  model: string;
}
```

### Tool definitions passed to Claude

Defined as Vercel AI SDK `tools` objects. Each has a `description` and
`parameters` (Zod schema). **No `execute` functions** — execution happens on
the client via `addToolResult`.

```ts
const editorTools = {
  remove_node: {
    description: "Remove a node (image, table, paragraph, heading, etc.)",
    parameters: z.object({ nodeKey: z.string() }),
  },
  insert_table: {
    description: "Insert a table at cursor or after a node",
    parameters: z.object({
      rows: z.number(),
      cols: z.number(),
      headers: z.array(z.string()).optional(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_heading: {
    description: "Insert a heading",
    parameters: z.object({
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
  },
  insert_list: {
    description: "Insert a bullet or numbered list",
    parameters: z.object({
      type: z.enum(["bullet", "numbered"]),
      items: z.array(z.string()),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_code_block: {
    description: "Insert a code block",
    parameters: z.object({
      language: z.string(),
      code: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_math: {
    description: "Insert a math equation",
    parameters: z.object({
      latex: z.string(),
      afterNodeKey: z.string().optional(),
    }),
  },
  insert_horizontal_rule: {
    description: "Insert a horizontal divider",
    parameters: z.object({ afterNodeKey: z.string().optional() }),
  },
  replace_text: {
    description:
      "Replace the text content of a paragraph or heading node. " +
      "WARNING: This destroys inline formatting (bold, italic, links). " +
      "Only use on plain-text nodes.",
    parameters: z.object({ nodeKey: z.string(), newText: z.string() }),
  },
  replace_selection: {
    description: "Replace the currently selected text with new content",
    parameters: z.object({ newText: z.string() }),
  },
};
```

### Route handler

```ts
const result = streamText({
  model: modelInstance,
  system: COPILOT_SYSTEM_PROMPT(body.documentTitle, body.documentContext, body.selectedText),
  messages: body.messages,
  tools: editorTools,
  maxSteps: 5,
});

return result.toDataStreamResponse();
```

No `execute` stubs, no `collectedActions`. The AI SDK handles the data stream
format. Tool calls arrive at the client as structured `toolCall` parts.

### System prompt

Add to `src/lib/ai/prompts.ts`:

```ts
export const COPILOT_SYSTEM_PROMPT = (
  title: string,
  context: string,
  selection?: string,
) =>
  `You are a writing assistant embedded in a blog editor. ` +
  `The user is editing a document titled "${title}". ` +
  `\n\nDocument structure:\n${context}` +
  (selection ? `\n\nThe user currently has selected: "${selection}"` : "") +
  `\n\nWhen the user asks you to make an edit, use the available tools to do so. ` +
  `Before calling tools, briefly describe what changes you will make (e.g. ` +
  `"I'll insert a 3×4 table after the Introduction heading and add a Summary section."). ` +
  `After calling tools, confirm briefly what you did. ` +
  `When answering questions, respond concisely without calling tools.`;
```

Asking Claude to narrate its planned changes before calling tools gives the
Apply button context to display.

---

## Stage 3 — Redux State

**Goal:** Track panel open/closed state only. Message threads are owned by
`useChat` (local React state), not Redux. This eliminates the message reducers
and keeps the store small.

### Addition to `AppState.ui` in `src/store/app.ts`

```ts
ui: {
  // ... existing fields
  copilot: {
    open: boolean;
  }
}
```

Initial state:

```ts
copilot: {
  open: false,
}
```

### Reducer to add

```ts
setCopilotOpen(state, action: PayloadAction<boolean>)
```

No `addCopilotMessage`, `updateCopilotMessage`, or `clearCopilotThread` —
`useChat` handles all of that.

### Types to add in `src/types.ts`

```ts
export type CopilotAction = {
  type: string;
  params: Record<string, unknown>;
};
```

`CopilotMessage` and `CopilotThread` are not needed — use the AI SDK's
`Message` type from `ai/react`.

---

## Stage 4 — Tool Executors

**Goal:** Client-side functions that translate each `CopilotAction` into a
Lexical `editor.update()` call.

**New file:** `src/editor/utils/copilotToolExecutors.ts`

All executors take `(editor: LexicalEditor, params: unknown)` and return `void`.
They are synchronous wrappers around `editor.update()`.

### Executor implementations

```ts
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  LexicalEditor,
} from "lexical";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $createListItemNode, $createListNode } from "@lexical/list";
import { $createCodeNode } from "@lexical/code";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $createHorizontalRuleNode } from "@/editor/nodes/HorizontalRuleNode";
import { $createMathNode } from "@/editor/nodes/MathNode";
```

**`remove_node`**

```ts
editor.update(() => {
  const node = $getNodeByKey(params.nodeKey);
  node?.remove();
});
```

**`replace_text`**

Replaces content with a new plain-text paragraph. **Known limitation:** destroys
all inline formatting (bold, italic, links) on the original node. Only safe on
nodes that are confirmed plain-text. A formatting-aware version is deferred.

```ts
editor.update(() => {
  const node = $getNodeByKey(params.nodeKey);
  if (!node) return;
  const para = $createParagraphNode();
  para.append($createTextNode(params.newText));
  node.replace(para);
});
```

**`replace_selection`**

```ts
editor.update(() => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  selection.insertText(params.newText);
});
```

**`insert_table`**

```ts
editor.update(() => {
  const table = $createTableNodeWithDimensions(
    params.rows,
    params.cols,
    params.headers?.length > 0,
  );
  insertAfterNodeOrAtEnd(table, params.afterNodeKey);
});
```

**`insert_heading`**

```ts
editor.update(() => {
  const heading = $createHeadingNode(`h${params.level}`);
  heading.append($createTextNode(params.text));
  insertAfterNodeOrAtEnd(heading, params.afterNodeKey);
});
```

**`insert_list`**

```ts
editor.update(() => {
  const list = $createListNode(params.type === "bullet" ? "bullet" : "number");
  for (const item of params.items) {
    const li = $createListItemNode();
    li.append($createTextNode(item));
    list.append(li);
  }
  insertAfterNodeOrAtEnd(list, params.afterNodeKey);
});
```

**`insert_code_block`**

```ts
editor.update(() => {
  const code = $createCodeNode(params.language);
  code.append($createTextNode(params.code));
  insertAfterNodeOrAtEnd(code, params.afterNodeKey);
});
```

**`insert_math`**

```ts
editor.update(() => {
  const math = $createMathNode(params.latex, false);
  const para = $createParagraphNode();
  para.append(math);
  insertAfterNodeOrAtEnd(para, params.afterNodeKey);
});
```

**`insert_horizontal_rule`**

```ts
editor.update(() => {
  const hr = $createHorizontalRuleNode();
  insertAfterNodeOrAtEnd(hr, params.afterNodeKey);
});
```

**Helper:**

```ts
function insertAfterNodeOrAtEnd(node: LexicalNode, afterNodeKey?: string) {
  if (afterNodeKey) {
    const anchor = $getNodeByKey(afterNodeKey);
    anchor?.insertAfter(node);
  } else {
    $getRoot().append(node);
  }
}
```

**Dispatcher:**

```ts
export function applyActions(
  editor: LexicalEditor,
  actions: CopilotAction[],
): void {
  for (const action of actions) {
    EXECUTORS[action.type]?.(editor, action.params);
  }
}
```

---

## Stage 5 — Panel Shell, Layout, and Editor Context

**Goal:** Add the Copilot panel to the editor layout, wire the toggle button,
and expose the active editor ref via React context so components don't need
prop drilling.

### New file: `src/contexts/ActiveEditorContext.ts`

```ts
import { createContext } from "react";
import type { RefObject } from "react";
import type { LexicalEditor } from "lexical";

export const ActiveEditorContext = createContext<RefObject<LexicalEditor | null>>(
  { current: null },
);
```

### Layout change in `TabbedDocumentEditor`

When `ui.copilot.open` is true, wrap the tab panels in a flex row so the copilot
panel sits to the right. Set `ActiveEditorContext` when the active tab changes.

```tsx
const copilotOpen = useSelector((state) => state.ui.copilot.open);
const [activeEditorRef, setActiveEditorRef] =
  useState<React.RefObject<LexicalEditor | null>>(() => ({ current: null }));

const handleEditorReady = useCallback(
  (ref: React.RefObject<LexicalEditor | null>) => {
    setActiveEditorRef(ref);
  },
  [],
);

return (
  <ActiveEditorContext.Provider value={activeEditorRef}>
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <EditorTabBar ... />

      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Box sx={{ flex: 1, overflow: "hidden" }}>
          {tabs.tabIds.map((tabId) => (
            <EditorTabPanel
              key={tabId}
              ...
              isActive={tabId === tabs.activeTabId}
              onEditorReady={tabId === tabs.activeTabId ? handleEditorReady : undefined}
            />
          ))}
        </Box>

        {copilotOpen && (
          <CopilotPanel documentId={tabs.activeTabId ?? ""} />
        )}
      </Box>
    </Box>
  </ActiveEditorContext.Provider>
);
```

Note: `CopilotPanel` no longer receives `editorRef` as a prop — it reads it
from `ActiveEditorContext`.

### Change in `EditorTabPanel`

Add `onEditorReady` prop. Call it when the editor ref is populated:

```tsx
interface EditorTabPanelProps {
  ...
  onEditorReady?: (ref: React.RefObject<LexicalEditor | null>) => void;
}

useEffect(() => {
  if (isActive) onEditorReady?.(editorRef);
}, [isActive, onEditorReady]);
```

### Toggle button in `ToolbarPlugin`

Add a `SmartToyOutlined` icon button at the far right of the toolbar.

```tsx
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";

<Tooltip title="Copilot">
  <IconButton
    size="small"
    color={copilotOpen ? "primary" : "default"}
    onClick={() => dispatch(actions.setCopilotOpen(!copilotOpen))}
  >
    <SmartToyOutlinedIcon fontSize="small" />
  </IconButton>
</Tooltip>
```

### `CopilotPanel` component

`src/components/CopilotPanel/CopilotPanel.tsx`

A fixed-width Box (not a Drawer — a Drawer overlays content; we want the editor
to shrink). Reads `editorRef` from context internally.

```tsx
<Box
  sx={{
    width: 320,
    flexShrink: 0,
    borderLeft: 1,
    borderColor: "divider",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    bgcolor: "background.paper",
  }}
>
  <Box
    sx={{
      px: 2,
      py: 1,
      borderBottom: 1,
      borderColor: "divider",
      display: "flex",
      alignItems: "center",
      gap: 1,
    }}
  >
    <SmartToyOutlinedIcon fontSize="small" color="primary" />
    <Typography variant="subtitle2" sx={{ flex: 1 }}>Copilot</Typography>
    <IconButton size="small" onClick={() => dispatch(actions.setCopilotOpen(false))}>
      <CloseIcon fontSize="small" />
    </IconButton>
  </Box>

  <CopilotChat documentId={documentId} />
</Box>
```

---

## Stage 6 — Chat UI

### `CopilotChat` component

`src/components/CopilotPanel/CopilotChat.tsx`

Uses `useChat` from `ai/react`. Reads `editorRef` from `ActiveEditorContext`.
Message list state, streaming, abort, and error handling are all provided by
the hook.

**Props:**

```ts
{ documentId: string }
```

**Hook setup:**

```ts
const editorRef = useContext(ActiveEditorContext);

const { messages, input, setInput, handleSubmit, stop, isLoading, error, addToolResult } =
  useChat({
    api: "/api/copilot",
    body: {
      documentTitle,
      documentContext: editorRef.current
        ? serializeForCopilot(editorRef.current)
        : "",
      selectedText,
      provider,
      model: modelId,
    },
  });
```

`documentContext` and `selectedText` are evaluated fresh on each submit because
`body` is re-evaluated per call. Capture `selectedText` from the editor
synchronously on submit (before any async gap):

```ts
const handleSend = (e: React.FormEvent) => {
  selectedTextRef.current = editorRef.current?.getEditorState().read(() => {
    const sel = $getSelection();
    return $isRangeSelection(sel) ? sel.getTextContent() : undefined;
  });
  handleSubmit(e);
};
```

**Layout:**

```
flex column, full height
├── LinearProgress (shown while isLoading)
├── QuickActions (shown only when messages is empty)
├── message list (flex: 1, overflow-y: auto)
├── error banner (shown when error is set)
└── input row (fixed bottom)
```

**Input row:**

```tsx
<Box sx={{ p: 1, borderTop: 1, borderColor: "divider", display: "flex", gap: 1 }}>
  <TextField
    fullWidth
    size="small"
    placeholder="Ask anything…"
    value={input}
    onChange={(e) => setInput(e.target.value)}
    onKeyDown={(e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(e as unknown as React.FormEvent);
      }
    }}
    multiline
    maxRows={4}
    disabled={isLoading}
  />
  {isLoading ? (
    <IconButton onClick={stop}>
      <StopIcon fontSize="small" />
    </IconButton>
  ) : (
    <IconButton
      color="primary"
      onClick={handleSend}
      disabled={!input.trim()}
    >
      <SendIcon fontSize="small" />
    </IconButton>
  )}
</Box>
```

When streaming, the Send button becomes a Stop button that calls `stop()`.

### `CopilotMessage` component

`src/components/CopilotPanel/CopilotMessage.tsx`

Reads `editorRef` from `ActiveEditorContext`. Receives an AI SDK `Message`
object.

Pending tool invocations are in `message.toolInvocations` where
`invocation.state === "call"`. These are shown as the Apply target.

```tsx
const editorRef = useContext(ActiveEditorContext);
const pendingInvocations = message.toolInvocations?.filter(
  (inv) => inv.state === "call",
) ?? [];
const appliedInvocations = message.toolInvocations?.filter(
  (inv) => inv.state === "result",
) ?? [];
```

Apply button shown when there are pending invocations:

```tsx
{pendingInvocations.length > 0 && (
  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
    <Button
      size="small"
      variant="contained"
      startIcon={<CheckIcon />}
      onClick={() => {
        // Execute mutations in the editor
        applyActions(
          editorRef.current!,
          pendingInvocations.map((inv) => ({
            type: inv.toolName,
            params: inv.args,
          })),
        );
        // Advance the agentic loop — sends tool results back to the model
        for (const inv of pendingInvocations) {
          addToolResult({ toolCallId: inv.toolCallId, result: { success: true } });
        }
      }}
    >
      Apply
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={() => {
        // Dismiss without applying — send a cancelled result so the model knows
        for (const inv of pendingInvocations) {
          addToolResult({ toolCallId: inv.toolCallId, result: { cancelled: true } });
        }
      }}
    >
      Dismiss
    </Button>
  </Box>
)}
```

After all invocations are results, show the Applied chip:

```tsx
{pendingInvocations.length === 0 && appliedInvocations.length > 0 && (
  <Chip
    size="small"
    icon={<CheckIcon />}
    label="Applied"
    color="success"
    variant="outlined"
    sx={{ mt: 1 }}
  />
)}
```

### `QuickActions` component

`src/components/CopilotPanel/QuickActions.tsx`

Row of Chip buttons shown when the thread is empty, to bootstrap common flows:

```tsx
const QUICK_ACTIONS = [
  { label: "Improve writing", prompt: "Improve the writing quality of this document." },
  { label: "Fix grammar", prompt: "Fix any grammar and spelling mistakes." },
  { label: "Make shorter", prompt: "Shorten this document while keeping all key information." },
  { label: "Add examples", prompt: "Add concrete examples to illustrate the main points." },
  { label: "Summarize", prompt: "Summarize this document in 3 bullet points." },
];

// Render as wrapping row of outlined Chips
// onClick: setInput(prompt) and focus the input
```

---

## Stage 7 — Wire-Up Checklist

After all stages are implemented, verify the following end-to-end flows:

- [ ] Copilot toggle button appears in toolbar; clicking it opens/closes the panel
- [ ] Panel slides in and the editor shrinks (not overlapped)
- [ ] Sending a message shows the user bubble immediately
- [ ] Assistant response streams in token-by-token
- [ ] LinearProgress appears while streaming; stop button cancels the stream
- [ ] After a structural request (e.g. "add a table"), the Apply button appears
- [ ] Clicking Apply inserts the table in the Lexical editor; Applied chip appears
- [ ] Clicking Dismiss sends a cancelled result and removes the Apply button
- [ ] Switching tabs updates the ActiveEditorContext ref; Copilot uses the new editor
- [ ] Quick action chips pre-fill the input
- [ ] Selection is captured: select text → send message → AI references it
- [ ] Network error during streaming shows the error banner (not a stuck empty message)
- [ ] Edge runtime: verify all AI provider adapters work without Node-only deps

---

## Design Conventions

Follow DESIGN.md conventions throughout.

- Colors: use MUI palette tokens only (`primary.main`, `text.secondary`, etc.)
- Typography: `body2` for message text, `caption` for timestamps
- Spacing: `p: 1` (8px) / `p: 2` (16px) grid; no raw pixel values
- Panel width: 320px fixed (not responsive — collapse to closed state on narrow
  viewports rather than shrinking)
- User messages: right-aligned, `bgcolor: "primary.main"`,
  `color: "primary.contrastText"`, `borderRadius: 2`
- Assistant messages: left-aligned, `bgcolor: "action.hover"`, `borderRadius: 2`
- Loading state: `LinearProgress` at the top of the panel while streaming
- Empty state: centered `Typography color="text.secondary"` prompt to start
  chatting, with the quick actions below
- Accessibility: focus the input when the panel opens; trap focus within the
  panel when it is open

---

## Known Limitations (v1)

- **`replace_text` is lossy** — creates a plain-text paragraph, destroying all
  inline formatting (bold, italic, links). Documented in the tool description so
  Claude avoids it on formatted nodes. A formatting-aware version is deferred.
- **No thread persistence** — threads reset on page refresh. Per-document threads
  survive tab switches within the same session (held by `useChat` state in
  `CopilotChat`, which is mounted for the lifetime of the panel).
- **agentic loop requires user approval** — each tool-call batch waits for Apply
  before the model continues. This is intentional (user control) but means a
  5-step agentic plan requires 5 Apply clicks. Auto-approve is a future option.

---

## Deferred / Out of Scope

- **Multiple named threads per document** — single thread is fine initially
- **Thread persistence** — saving threads to IndexedDB or the database
- **Image insertion** — `insert_image` requires knowing a valid URL
- **Graph/Sketch insertion** — require separate creation UIs
- **Model selector in the panel** — reuse the global AI provider setting
- **Undo integration** — Lexical history already tracks mutations; Ctrl+Z works
  naturally after Apply
- **Auto-approve mode** — call `addToolResult` in an `onToolCall` callback
  instead of waiting for user click
- **Formatting-aware `replace_text`** — walk existing children, preserve inline
  nodes, only replace text content
