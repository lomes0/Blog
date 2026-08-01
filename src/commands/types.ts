import type { ZodSchema, ZodTypeAny } from "zod";
import type { AppDispatch } from "@/store";
import type { PaneMode, User } from "@/types";

/**
 * How a document is being looked at.
 *
 * The same thing as {@link PaneMode}, and aliased to it rather than redeclared
 * so the two cannot drift: since Phase 2 the mode lives on the pane, and
 * `document.open` still takes it as a parameter only because flipping it is
 * still a navigation. Phase 5 of docs/plans/workspace-panes.md is where it
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
 * The dry run of a `mutate` command.
 *
 * **Phase 3.** Declared here so `Command` carries the slot from the day the
 * registry exists — a preview flow bolted on later would have to be optional
 * forever. Nothing implements `preview` yet, and nothing calls it.
 */
export interface ProposedChange {
  /** Human-readable summary of what accepting would do. */
  summary: string;
  /** Structured detail; its shape is a Phase 3 decision. */
  detail?: unknown;
}

/** A command minus the machinery `defineCommand` adds. */
export interface CommandSpec<P = void> {
  /** Namespaced and stable — the AI will learn these. e.g. "document.open". */
  readonly id: string;
  /** Sentence-case label. The palette shows its own copy where it varies by state. */
  readonly title: string;
  /** Validates params. Becomes JSON Schema for the AI in Phase 3. */
  readonly params: ZodSchema<P>;
  readonly effect: CommandEffect;
  readonly scopes?: readonly CommandScope[];
  /** False when the command cannot apply in the current context. */
  available?(ctx: CommandContext): boolean;
  run(ctx: CommandContext, params: P): Promise<CommandResult>;
  /** Phase 3 — see {@link ProposedChange}. */
  preview?(ctx: CommandContext, params: P): Promise<ProposedChange>;
}

export interface Command<P = void> extends CommandSpec<P> {
  /**
   * Type-erased front door: validates unvalidated params against `params` and
   * then runs. This is what the Phase 3 tool executor calls, since JSON off the
   * wire is `unknown` no matter what the model claims it sent.
   */
  invoke(ctx: CommandContext, params: unknown): Promise<CommandResult>;
}

/**
 * A command with its parameter type forgotten, so heterogeneous commands can
 * live in one list. `run` is absent on purpose — calling it needs the type back.
 */
export interface ErasedCommand {
  readonly id: string;
  readonly title: string;
  readonly params: ZodTypeAny;
  readonly effect: CommandEffect;
  readonly scopes?: readonly CommandScope[];
  available?(ctx: CommandContext): boolean;
  invoke(ctx: CommandContext, params: unknown): Promise<CommandResult>;
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
async function invokeCommand<P>(
  command: CommandSpec<P>,
  ctx: CommandContext,
  rawParams: unknown,
): Promise<CommandResult> {
  const parsed = command.params.safeParse(rawParams);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".");
    return commandFailed(
      `${command.id}: ${path ? `${path} — ` : ""}${
        issue?.message ?? "invalid parameters"
      }`,
    );
  }
  if (command.available && !command.available(ctx)) {
    return commandFailed(`${command.title} is not available here.`);
  }
  try {
    return await command.run(ctx, parsed.data);
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
  const command: Command<P> = {
    ...spec,
    invoke: (ctx, params) => invokeCommand(spec, ctx, params),
  };
  return command;
}
