# Documentation

Reference guides for developing and maintaining this blog platform.

The authoritative description of conventions lives in two files at the repo
root, not here: [CLAUDE.md](../CLAUDE.md) for architecture and route/API rules,
[DESIGN.md](../DESIGN.md) for the design system. Everything below supplements
them.

---

## Getting started

| File                                                             | Description                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| [bootstrap.md](./bootstrap.md)                                   | From-zero local setup: Node, Docker Postgres, env                   |
| [guides/claude-code-content.md](./guides/claude-code-content.md) | Editing blog content from Claude Code: MCP setup and caveats |

## Guides

Each documents a specific failure mode and its fix.

| File                                                                     | Description                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [guides/hydration.md](./guides/hydration.md)                             | Diagnosing and fixing React hydration errors                          |
| [guides/date-formatting.md](./guides/date-formatting.md)                 | The two date seams, and which is safe where                           |
| [guides/nextauth-ssr.md](./guides/nextauth-ssr.md)                       | Session handling in server components with NextAuth                   |
| [guides/notes-indexeddb-origins.md](./guides/notes-indexeddb-origins.md) | Why notes "vanish" between `dev` and `start`: IndexedDB is per-origin |

## Architecture

| File                                                                                 | Description                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](./architecture/overview.md)                               | Layered architecture, rules per layer, naming conventions, and new-feature checklist               |
| [architecture/api-client.md](./architecture/api-client.md)                           | `apiClient` contract, error handling, and how to add new API routes                                |
| [architecture/claude-code-integration.md](./architecture/claude-code-integration.md) | The content bridge, the MCP server and the in-app Copilot — one block-addressing layer, two agents |
| [ai.instructions.md](./ai.instructions.md)                                           | Multi-provider AI completion layer: models, providers, env vars                                    |

## Plans and reviews

Proposals and audits — **status is stated at the top of each file**. These
describe intended or observed states, not necessarily the current one.

| File                                                           | Description                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [plans/README.md](./plans/README.md)                           | Index of the content-model & ordering proposals                              |
| [claude_code_support_tasks.md](./claude_code_support_tasks.md) | Backlog for the Claude Code / Copilot content bridge — what is left, and why |
| [reviews/](./reviews/)                                         | Point-in-time code reviews, dated                                            |

Findings in `reviews/` carry a per-finding `STATUS` line stating whether they
are still open. Re-verify before acting on one — a review body describes the
code as it was on the date at its top.
