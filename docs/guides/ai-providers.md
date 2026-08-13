# AI Integration

Reference for the multi-provider completion layer. Last verified against the
code on 2026-08-13.

## Layout

```
src/lib/ai/
├── index.ts               # Public API exports
├── types.ts               # AIProvider, AIModel, AIOption interfaces
├── models.ts              # Single source of truth for model definitions
├── prompts.ts             # Centralized prompt templates
├── providers.ts           # Provider factory functions
├── errors.ts              # Custom error classes
├── actions.ts             # One definition per AI action — the registry
├── actionIcons.ts         # Icon per action, split out to keep actions.ts server-safe
├── selection.ts           # What the user has selected, as told to the Copilot
├── commandTools.ts        # Non-content tools, generated from the command registry
└── copilotAgentTools.ts   # Content tool definitions for the copilot panel
```

The last five arrived with the AI-surface consolidation
([plans/archive/ai-surface-consolidation.md](../plans/archive/ai-surface-consolidation.md));
`actions.ts` is its §4.5 action registry, and `copilotAgentTools.ts` is the
`post`-vocabulary tool surface from §4.2.

Consumers:

- `src/app/api/completion/route.ts` — completion endpoint
- `src/app/api/copilot/route.ts` — copilot endpoint
- `packages/editor/src/plugins/ToolbarPlugin/Dialogs/AIDialog.tsx` — model selection UI
- `packages/editor/src/plugins/ToolbarPlugin/Tools/AITools.tsx` — toolbar actions

## Rules

1. **Single source of truth.** Model definitions live only in `models.ts`,
   prompt templates only in `prompts.ts`. Never hardcode a model array or a
   prompt string in a component — import from `@/lib/ai`.
2. **No `as any`.** Provider interface mismatches are handled with discriminated
   unions and type guards in `providers.ts`. The codebase is currently clean of
   AI-related type assertions; keep it that way (ESLint
   `@typescript-eslint/no-explicit-any` enforces it).
3. **Pin exact versions.** The AI SDK breaks between majors — `ai` and the
   `@ai-sdk/*` packages are pinned without `^` where a break has bitten before.
4. **Degrade gracefully.** A provider whose env vars are unset must not break
   the UI; surface a user-facing message via the `errors.ts` classes.

## Pinned SDK versions

| Package             | Version |
| ------------------- | ------- |
| `ai`                | 6.0.27  |
| `@ai-sdk/react`     | ^3.0.29 |
| `@ai-sdk/google`    | 3.0.6   |
| `@ai-sdk/anthropic` | 3.0.9   |
| `@ai-sdk/openai`    | ^3.0.65 |

AI SDK v6 supports model specifications v1, v2 and v3; `@ai-sdk/anthropic` v3.x
uses spec v3.

## Registered models

Defined in `src/lib/ai/models.ts`. `getDefaultModel()` returns the first entry.

| Provider     | Models                               | Notes                     |
| ------------ | ------------------------------------ | ------------------------- |
| Google       | `gemini-2.5-flash`, `gemini-2.5-pro` | Default, fast completions |
| Anthropic    | `claude-sonnet-5`, `claude-opus-4-8` | Reasoning tasks           |
| Azure OpenAI | `gpt-4o-mini`, `gpt-5.1-2025-11-13`  | Enterprise fallback       |
| Ollama       | `phi4`                               | Local/offline             |

Models get deprecated and renamed. When a provider changes an id, edit
`models.ts` — nothing else should need touching.

## Environment variables

```bash
# Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY=

# Anthropic Claude
ANTHROPIC_API_KEY=

# Azure OpenAI (gateway/proxy setup)
AZURE_API_KEY=
AZURE_OPENAI_BASE_URL=
AZURE_OPENAI_API_VERSION=

# Optional: local Ollama
OLLAMA_API_URL=http://localhost:11434/api
```

All are optional — the app runs without any of them, with AI features
unavailable.

## Testing checklist

There is no test runner in this project, so this is a manual pass:

1. [ ] Google Gemini (default provider) returns a completion
2. [ ] Anthropic Claude returns a completion
3. [ ] Each AI option (rewrite, continue, shorter, longer, …)
4. [ ] Streaming renders incrementally in the UI
5. [ ] Error handling: invalid API key, rate limit, unset provider
6. [ ] `npx tsc --noEmit` and `npm run lint` are clean
