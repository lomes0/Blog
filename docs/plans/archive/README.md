# Archived plans — shipped work

These eleven plans are **done**. They are kept, not deleted, for two reasons:

1. **The code points at them.** 184 comments across 121 source files cite these
   documents by section number as the standing rationale for an invariant —
   `src/lib/proposals.ts` names `agent-gating.md` §3.2 and §3.4 as the spec for
   the squash, every module in `src/lib/changes/` names a section of
   `changes-detection.md`, and two tools print a path from here in their
   **failure output** (`eslint.config.mjs`'s MUI rule, `scripts/check-codecs.mjs`).
   Moving or renaming a file here means updating those citations.
2. **Several record where their own analysis was wrong**, which is the part that
   does not survive in the code: `upstream-scrub.md` §3,
   `legacy-idb-retirement.md` §9, `haklex-adoption.md` §10,
   `claude-code-lexical.md` §2 (three spikes that killed rev 1's design, one of
   which retracted a data-loss bug that was never real).

A plan here describes the state **at the time it shipped**. Paths drift — most
of these say `src/editor`, which is `packages/editor/src` since the haklex
extraction. Do not read one as a description of the current tree.

| Plan                                                       | Shipped                    | What it did                                                                                                            |
| ---------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [workspace-panes.md](./workspace-panes.md)                 | 31 Jul 2026, 5 phases      | Command registry, `ui.tabs` → `ui.workspace`, public/workspace route split, split view                                  |
| [quiet-autosave.md](./quiet-autosave.md)                   | 3 Aug 2026                 | Autosave went silent — 8 dirty-state surfaces removed, `dirtyDocIds`/`useDirtyTracking`/`selectIsDirty` deleted         |
| [claude-code-lexical.md](./claude-code-lexical.md)         | 6 Aug 2026, phases 1–5     | Claude Code edits Lexical documents by **addressed block**, not Markdown — the content bridge everything else rides on  |
| [agent-gating.md](./agent-gating.md)                       | 6 Aug 2026, phases 1–5     | Terminal writes **propose** rather than commit; reviewed and approved in the app. Phases 6–7 deferred on purpose (§3.6) |
| [upstream-scrub.md](./upstream-scrub.md)                   | 7 Aug 2026, 6 phases       | Deleted the fork's demo surface: `/tutorial`, `/playground`, 756 KB of demo JSON, a duplicated font                     |
| [agent-change-indication.md](./agent-change-indication.md) | 7 Aug 2026                 | What the gating mechanism **says on screen** — the vocabulary, not the mechanism                                        |
| [changes-detection.md](./changes-detection.md)             | 8 Aug 2026, 4 phases       | `pg_notify` → `LISTEN` → SSE change feed at `/api/events`, with a full-set reconcile on reconnect                       |
| [mcp-support.md](./mcp-support.md)                         | 8 Aug 2026, 6 phases       | The eight MCP tools over HTTP at `POST /api/mcp`, bearer-token authenticated. Brought the app its first rate limiter    |
| [legacy-idb-retirement.md](./legacy-idb-retirement.md)     | 8 Aug 2026                 | Retired the fork's IndexedDB database name and its two Lexical table `type` strings (58 stored revisions rewritten)     |
| [ai-surface-consolidation.md](./ai-surface-consolidation.md) | 8–9 Aug 2026, 6 phases   | Four AI surfaces onto one schema, one vocabulary and one write path — the Copilot's content edits **propose** now       |
| [haklex-adoption.md](./haklex-adoption.md)                 | 8–9 Aug 2026, 5 workstreams | Extracted the editor to `packages/editor`, moved it to vanilla-extract + Base UI, added inline agent diff review       |

Deliberately left undone, recorded so they are not re-proposed as oversights:

- **No token-management UI and no OAuth** for `/api/mcp` (`mcp-support.md` §8) —
  OAuth is the line past which this becomes multi-tenant.
- **Agent-gating phases 6–7** (`agent-gating.md` §3.6) — deferred pending
  evidence that document says how to gather.
- **Haklex phases 3 and 4 were re-scoped mid-execution** on evidence
  (`haklex-adoption.md` §10.7, §10.8). Do not read §3–§7 as a to-do list without
  reading §10 first; several of its recommendations turned out to be wrong.

Live plans are one directory up: [../README.md](../README.md).
