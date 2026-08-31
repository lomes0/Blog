# Documentation

Reference guides for developing and maintaining this blog platform.

The authoritative description of conventions lives in two files at the repo
root, not here: [CLAUDE.md](../CLAUDE.md) for architecture and route/API rules,
[DESIGN.md](../DESIGN.md) for the design system. Everything below supplements
them.

---

## Getting started

| File                                                             | Description                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| [bootstrap.md](./bootstrap.md)                                   | From-zero local setup: Node, Docker Postgres, env            |
| [guides/claude-code-content.md](./guides/claude-code-content.md) | Editing blog content from Claude Code: MCP setup — local stdio and remote `/api/mcp` — and caveats |
| [../ops/README.md](../ops/README.md)                             | The production runbook: backups, the scheduler, the restore drill. Runs on the VPS, never in development |

## Guides

Each documents a specific failure mode and its fix.

| File                                                                     | Description                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [guides/hydration.md](./guides/hydration.md)                             | Diagnosing and fixing React hydration errors                          |
| [guides/date-formatting.md](./guides/date-formatting.md)                 | The two date seams, and which is safe where                           |
| [guides/nextauth-ssr.md](./guides/nextauth-ssr.md)                       | Session handling in server components with NextAuth                   |
| [guides/notes-indexeddb-origins.md](./guides/notes-indexeddb-origins.md) | Why notes "vanish" between `dev` and `start`: IndexedDB is per-origin |
| [guides/ai-providers.md](./guides/ai-providers.md)                       | Multi-provider AI completion layer: models, providers, env vars        |

## Architecture

| File                                                                                 | Description                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](./architecture/overview.md)                               | Layered architecture, rules per layer, naming conventions, and new-feature checklist               |
| [architecture/api-client.md](./architecture/api-client.md)                           | `apiClient` contract, error handling, and how to add new API routes                                |
| [architecture/claude-code-integration.md](./architecture/claude-code-integration.md) | The content bridge, the MCP server and the in-app Copilot — one block-addressing layer, two agents |

## Plans and reviews

Proposals and audits — **status is stated at the top of each file**. These
describe intended or observed states, not necessarily the current one.

| File                                                             | Description                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [plans/README.md](./plans/README.md)                             | The seven live plans; the ordering/schema chain is done and series-as-node was declined |
| [plans/archive/README.md](./plans/archive/README.md)             | Closed plans, kept because 332 code comments cite them by section number           |
| [plans/claude-code-backlog.md](./plans/claude-code-backlog.md)   | Backlog for the Claude Code / Copilot content bridge — what is left, and why       |
| [reviews/](./reviews/)                                           | Point-in-time code reviews, dated                                                  |

Findings in `reviews/` carry a per-finding `STATUS` line stating whether they
are still open. Re-verify before acting on one — a review body describes the
code as it was on the date at its top.

**A plan is not documentation of the current tree.** Plans under `archive/` were
accurate when they shipped and have drifted since — most say `src/editor`, which
has been `packages/editor/src` since the haklex extraction. The reference docs
above are the ones kept current.
