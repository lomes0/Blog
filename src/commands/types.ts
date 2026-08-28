import type { ZodSchema, ZodTypeAny } from "zod";
import type { AppDispatch } from "@/store";
import type { PaneMode, User } from "@/types";

/**
 * How a document is being looked at.
 *
 * The same thing as {@link PaneMode}, and aliased to it rather than redeclared
 * so the two cannot drift: since Phase 2 the mode lives on the pane, and
 * `document.open` still takes it as a parameter only because flipping it is
 * still a navigation. Phase 5 of docs/plans/archive/workspace-panes.md is where it
 * stops being one.
 */
export type DocumentMode = PaneMode;

/**
 * The slice of Next's router a command may use.
 *
 * Deliberately narrow, and deliberately *not* `AppRouterInstance`: the point of
 * the registry (plan §3.2) is that URL shape lives in one directory. A command
 * body is the only thing allowed to know that "open a series" means `/posts/…`.
 * Nothing above the registry ever sees a href.
 */
export interface CommandRouter {
  push(href: string): void;
  replace(href: string): void;
  refresh(): void;
}

/*
 * There used to be a fourth primitive here, `rewrite` — a `history.replaceState`
 * for pointing the address bar at state that had already changed. It existed
 * only because the workspace URL was a *projection* of pane focus, and its only
 * caller was `pane.close` repairing an address bar that named a pane it had
 * just closed. docs/plans/workspace-url.md §3 made the URL an entry point that
 * is consumed once instead, so there is nothing left to project and nothing
 * left to repair: closing a pane is not a URL event. The one surviving
 * `replaceState` in the app is the consume itself, in `WorkspacePanes`, and it
 * is not a command.
 */

/** The active color scheme, as a thing a command can read and set. */
export interface ThemeBridge {
  /** What is painted right now — "system" already resolved, `undefined` on the server. */
  resolved: "light" | "dark" | undefined;
  set(mode: "light" | "dark" | "system"): void;
}

/** The Copilot panel's visibility. Lives in React context, not the store. */
export interface CopilotBridge {
  open: boolean;
  setOpen(open: boolean): void;
}

/**
 * One pane, as the model is allowed to see it (plan §6.2).
 *
 * Flattened on purpose: a pane's own shape is `{ rootId, tabIds, activeTabId }`,
 * and "which document is this pane showing" is a derivation over all three. The
 * agent gets the answer, not the machinery — otherwise every prompt would have
 * to re-teach the tab-vs-pane vocabulary of §2.1.
 */
export interface PaneDescription {
  /** Stable for the pane's lifetime. This is the handle the model refers to. */
  id: string;
  /** The document the pane is showing, or null before its tabs have loaded. */
  docId: string | null;
  /** Its title, or null when the post is not in the store. */
  title: string | null;
  mode: DocumentMode;
  focused: boolean;
  /**
   * Whether this pane is currently filling the row on its own, with the other
   * hidden behind it. Always false with a single pane.
   */
  maximized: boolean;
}

/**
 * What is open, for commands that need to answer questions about it.
 *
 * A bridge rather than a store read for the same reason `theme` and `copilot`
 * are: `src/commands` has no static dependency on `@/store` (see the note in
 * `ui.ts`), and the Copilot route derives its tool schemas from this module
 * graph on the server.
 */
export interface WorkspaceBridge {
  panes: readonly PaneDescription[];
}

/**
 * Everything a command is allowed to reach.
 *
 * This is a **plain object**, not a hook and not a React context value: Phase 3
 * invokes commands from the AI tool executor, which has no component to hang
 * hooks off. `CommandProvider` is only the thing that *builds* one from the
 * ambient React state; the executor will be handed the same object.
 */
export interface CommandContext {
  dispatch: AppDispatch;
  /**
   * Who is acting. No Phase 1 command needs it — every one of them is a
   * navigation, and the API routes behind them authorize on their own session.
   * It is here because the Phase 3 executor has no other way to say who asked,
   * and retrofitting it once commands assume it is absent is worse.
   */
  user?: User;
  router: CommandRouter;
  /**
   * The document the workspace is focused on, or null.
   *
   * `selectFocusedDocId` over `ui.workspace` since Phase 2 — the focused
   * pane's active tab, falling back to its root. No path is parsed to get it,
   * which is what lets a second pane exist without a URL that can name it.
   */
  focusedDocumentId: string | null;
  /** How the focused document is being shown; null when nothing is focused. */
  focusedDocumentMode: DocumentMode | null;
  theme: ThemeBridge;
  copilot: CopilotBridge;
  workspace: WorkspaceBridge;
}

/**
 * `read` commands only observe or navigate; `mutate` commands write.
 *
 * Phase 3 gives every `mutate` command a uniform preview/accept path, so the
 * distinction is load-bearing rather than documentation.
 */
export type CommandEffect = "read" | "mutate";

/** What a command acts on. Used to filter the palette and the AI tool list. */
export type CommandScope = "workspace" | "document" | "series";

export type CommandResult =
  | { status: "ok"; message?: string; data?: unknown }
  | { status: "error"; message: string };

export const commandOk = (message?: string): CommandResult => ({
  status: "ok",
  ...(message === undefined ? {} : { message }),
});

export const commandFailed = (message: string): CommandResult => ({
  status: "error",
  message,
});

/**
 * An `ok` result carrying a payload — what a `read` command answers with when
 * the caller is the AI tool executor rather than a button. `data` is fed back
 * into the agent loop as the tool's output, so it must be JSON-serializable.
 */
export const commandData = (
  data: unknown,
  message?: string,
): CommandResult => ({
  status: "ok",
  data,
  ...(message === undefined ? {} : { message }),
});

/**
 * The dry run of a `mutate` command.
 *
 * Every `mutate` command must have a `preview`, because a mutate tool call is
 * never executed on arrival: it is rendered as a proposal the user accepts.
 * `preview` is what that proposal says. The invariant is enforced by
 * `src/commands/__tests__/toolParity.test.ts`, not by the type system — a
 * required `preview` would also be required of the palette and the buttons,
 * which have their own copy.
 */
export interface ProposedChange {
  /** Human-readable summary of what accepting would do. */
  summary: string;
  /** Structured detail, for a richer renderer than a line of text. */
  detail?: unknown;
}

/** A command minus the machinery `defineCommand` adds. */
export interface CommandSpec<P = void> {
  /** Namespaced and stable — the AI will learn these. e.g. "document.open". */
  readonly id: string;
  /** Sentence-case label. The palette shows its own copy where it varies by state. */
  readonly title: string;
  /**
   * What the command does and when to reach for it, written for the model —
   * this is the tool description the Copilot sees. Falls back to `title`, which
   * is a label rather than an instruction, so prefer writing one.
   */
  readonly description?: string;
  /** Validates params. Becomes the tool's JSON Schema — see `lib/ai/commandTools.ts`. */
  readonly params: ZodSchema<P>;
  readonly effect: CommandEffect;
  readonly scopes?: readonly CommandScope[];
  /** False when the command cannot apply in the current context. */
  available?(ctx: CommandContext): boolean;
  run(ctx: CommandContext, params: P): Promise<CommandResult>;
  /** Required in practice on `mutate` — see {@link ProposedChange}. */
  preview?(ctx: CommandContext, params: P): Promise<ProposedChange>;
}

export interface Command<P = void> extends CommandSpec<P> {
  /**
   * Type-erased front door: validates unvalidated params against `params` and
   * then runs. This is what the AI tool executor calls, since JSON off the wire
   * is `unknown` no matter what the model claims it sent.
   */
  invoke(ctx: CommandContext, params: unknown): Promise<CommandResult>;
  /**
   * Type-erased dry run. Present exactly when {@link CommandSpec.preview} is —
   * its absence is what the parity spec checks a `mutate` command for.
   */
  previewInvoke?(
    ctx: CommandContext,
    params: unknown,
  ): Promise<ProposedChange>;
}

/**
 * A command with its parameter type forgotten, so heterogeneous commands can
 * live in one list. `run` is absent on purpose — calling it needs the type back.
 */
export interface ErasedCommand {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly params: ZodTypeAny;
  readonly effect: CommandEffect;
  readonly scopes?: readonly CommandScope[];
  available?(ctx: CommandContext): boolean;
  invoke(ctx: CommandContext, params: unknown): Promise<CommandResult>;
  previewInvoke?(
    ctx: CommandContext,
    params: unknown,
  ): Promise<ProposedChange>;
}

/**
 * Parameters as a call-site argument list: absent for a `void` command, one
 * required argument otherwise. `[P] extends [void]` rather than `P extends void`
 * so a union parameter type is not distributed over.
 */
export type CommandArgs<P> = [P] extends [void] ? [] : [params: P];

export type RunCommand = <P>(
  command: Command<P>,
  ...args: CommandArgs<P>
) => Promise<CommandResult>;

/**
 * Validate, check availability, run, and turn a throw into a result.
 *
 * Both front doors funnel through here, so an AI-issued call and a button click
 * get identical validation — which is the guarantee the registry exists to make.
 */
function parseParams<P>(
  command: CommandSpec<P>,
  rawParams: unknown,
): { ok: true; value: P } | { ok: false; message: string } {
  const parsed = command.params.safeParse(rawParams);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".");
  return {
    ok: false,
    message: `${command.id}: ${path ? `${path} — ` : ""}${
      issue?.message ?? "invalid parameters"
    }`,
  };
}

async function invokeCommand<P>(
  command: CommandSpec<P>,
  ctx: CommandContext,
  rawParams: unknown,
): Promise<CommandResult> {
  const parsed = parseParams(command, rawParams);
  if (!parsed.ok) return commandFailed(parsed.message);
  if (command.available && !command.available(ctx)) {
    return commandFailed(`${command.title} is not available here.`);
  }
  try {
    return await command.run(ctx, parsed.value);
  } catch (error) {
    console.error(`[commands] ${command.id} failed`, error);
    return commandFailed(
      error instanceof Error ? error.message : `${command.title} failed.`,
    );
  }
}

/** Typed entry point. `CommandProvider` binds the context and exposes it as `run`. */
export function runCommand<P>(
  command: Command<P>,
  ctx: CommandContext,
  ...args: CommandArgs<P>
): Promise<CommandResult> {
  const [params] = args as unknown as [P];
  return invokeCommand(command, ctx, params);
}

/**
 * Declare a command. Give `P` explicitly (`defineCommand<OpenParams>({…})`) so
 * the schema and the `run` signature are checked against each other rather than
 * one being inferred from the other.
 */
export function defineCommand<P>(spec: CommandSpec<P>): Command<P> {
  const { preview } = spec;
  const command: Command<P> = {
    ...spec,
    invoke: (ctx, params) => invokeCommand(spec, ctx, params),
    // Mirrors `invoke`, but never swallows a failure into a result: a preview
    // that cannot be produced must not render as an empty proposal, because the
    // proposal is the only thing the user sees before accepting a write.
    ...(preview
      ? {
        previewInvoke: async (
          ctx: CommandContext,
          params: unknown,
        ): Promise<ProposedChange> => {
          const parsed = parseParams(spec, params);
          if (!parsed.ok) throw new Error(parsed.message);
          return preview(ctx, parsed.value);
        },
      }
      : {}),
  };
  return command;
}
