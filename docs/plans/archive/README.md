# Archived plans — closed work

These twenty-two plans are **closed**: twenty shipped, one
([storage-uploads.md](./storage-uploads.md)) was superseded before it was built,
and one ([series-as-node.md](./series-as-node.md)) was **declined** after being
costed against the finished tree. Neither of the two unbuilt ones is deleted,
for the same reason a shipped one is not — the reasoning is cited elsewhere and
outlived the plan, and a declined plan is the only record of *why* the thing it
proposes is not there.

They are kept, not deleted, for two reasons:

1. **The code points at them.** 332 comments across 219 source files cite these
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

| Plan                                                       | Closed                     | What it did                                                                                                            |
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
| [storage-uploads.md](./storage-uploads.md)                 | **Superseded** 13 Aug 2026 — never built | Uploads off the filesystem to object storage. Superseded by [../blob-storage.md](../blob-storage.md): it scoped out editor images to avoid changing the document format, and measurement showed that excluded class held most of the bytes |
| [haklex-reprise.md](./haklex-reprise.md)                   | 14 Aug 2026, 5 of 7 phases | The five capabilities the haklex adoption cut, reopened and shipped (964 tests). §11.3 refused phase 7 on evidence — correct about the mechanism, wrong about the corpus, and overturned by [../nested-editor-support.md](../nested-editor-support.md) on 27 Aug |
| [code-block-card.md](./code-block-card.md)                 | 14 Aug 2026, `7ec096a7`    | Two code-block chromes — a portalled editor overlay and an imperative `/view` enhancer — onto one card in the node's own DOM. `ViewCodeEnhancer.tsx` deleted; net LOC negative |
| [byo-provider-keys.md](./byo-provider-keys.md)             | 15 Aug 2026, 5 phases      | AI provider keys moved from the deployment's `.env` to a per-user encrypted row, with no fallback — the codebase's first **reversible** secret, and the reason §4.2 (AAD, IV, key versioning) and §6 (what this does *not* protect) carry its weight |
| [tree-model-brief.md](./tree-model-brief.md)               | 27 Aug 2026, answered + built | Answered "does `/posts` render projects?" with **yes**, and took option A — the unified `TreeNode` model in `src/lib/tree/`. The follow-on was step 7 of [./bloat-remediation.md](./bloat-remediation.md), which shipped the same day and whose drag was verified in a browser on 30 Aug 2026; that plan stays live for its unrelated step 3 |
| [theme-css-tokenization.md](./theme-css-tokenization.md)   | 14–28 Aug 2026, 5 phases   | `theme.css`'s last color literals onto tokens, and `check:theme` taught a rule about *position* rather than file extension — a literal outside a token block is now an error in `.css` too. §7 records **thirteen** claims the plan got wrong, chiefly a 5× undercount of its own work |
| [workspace-url.md](./workspace-url.md)                     | 28 Aug 2026, 4 phases      | The workspace URL stopped projecting pane focus and became an entry point consumed on arrival — `workspaceUrl.ts`, the `project()` listener, the `rewrite` primitive and `/edit`'s `force-dynamic` + `generateMetadata` all deleted. §8.1 records what had drifted before Phase A ran: §4 named three of the six URL readers |
| [ordering-simplification.md](./ordering-simplification.md) | 30 Aug 2026, 5 phases      | Fractional `rank` replaced by an ordered id array per container — four arrays, not the three §2 names, because `Project` owns its members' order too. `rank`, its six indexes and `fractional-indexing` are gone, and the local library moved with it, so ordering is one mechanism rather than two. §11 is a seventeen-entry phase log; the plan is wrong often enough that it should be read first |
| [series-as-node.md](./series-as-node.md)                   | **Declined** 31 Aug 2026 — never built | Fold `Series` (and, per §9.2, `Project`) into the `Document` tree so everything is one node kind with one `childOrder`. Deferred until `rank` was gone, then re-costed against the tree that arrived: §3's ordering payoff had already been collected — `repositories/ordering.ts` is container-parameterised without it, and only ~55 lines of *move* code are doubled — leaving one *content* model as the whole remaining prize, at 76 files, two repositories and eight routes. §9 is the re-costing, §10 the call, and §9.2 the finding to read before reopening it |
| [bloat-remediation.md](./bloat-remediation.md)             | 31 Aug 2026, 7 steps       | A review's findings turned into seven steps — dead dependencies, an unreachable list mode, panel geometry, the loading audit, and the tree-model unification that made `/posts` and the sidebar build one tree with one pair of functions. Step 3 closed last and is the one to read: `knip` went **578 hits → 51** across three phases, the first of which was teaching it that `packages/editor/src/ui` is a ported vendor surface rather than a backlog. All 51 survivors are deliberate keeps, listed there by name, because every future run reports them again. Its closing note records the four drag gestures verified in Postgres on 30 Aug |
| [ide-redesign.md](./ide-redesign.md)                       | 2 Sep 2026, 4 phases       | Converge the app shell on the **Blog IDE** proposal in place, keeping DESIGN.md tokens: ⌘K palette, title-bar search + Read/Edit toggle, Explorer restyle, the far-left activity rail, and `Layout/StatusBar.tsx`. Closed by **deleting** its last two items rather than building them — an AI-panel restyle and a tabs/breadcrumb polish that specified their target by reference to a proposal bundle no longer in the repo. Both sat on the live index for a month waiting for a respecification nobody wanted to write, which is the finding worth carrying: a task that cannot say what it wants is an open question, not scheduled work. The status-bar section is the one to read — two of its five proposed fields were dropped, with reasons |

Deliberately left undone, recorded so they are not re-proposed as oversights:

- **No token-management UI and no OAuth** for `/api/mcp` (`mcp-support.md` §8) —
  OAuth is the line past which this becomes multi-tenant.
- **Nothing meters the Ollama path, and nobody can be sponsored**
  (`byo-provider-keys.md` §8) — every other provider is paid for by the user
  whose key it is, so the metering question only survives for the one provider
  that needs no key. §2 records the quota design if it is ever wanted.
- **Agent-gating phases 6–7** (`agent-gating.md` §3.6) — deferred pending
  evidence that document says how to gather.
- **Haklex phases 3 and 4 were re-scoped mid-execution** on evidence
  (`haklex-adoption.md` §10.7, §10.8). Do not read §3–§7 as a to-do list without
  reading §10 first; several of its recommendations turned out to be wrong.

Live plans are one directory up: [../README.md](../README.md).
