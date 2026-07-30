import { useCallback, useRef, useState } from "react";

export interface InlineRenameOptions<T, C> {
  /** The rows the rename can target; looked up by id when starting and committing. */
  items: T[] | undefined;
  getId: (item: T) => string;
  /** Title the input opens with. May substitute a placeholder for an empty value. */
  getTitle: (item: T, context: C) => string;
  /**
   * The stored value the typed title is compared against to decide whether the
   * rename is a no-op. Defaults to `getTitle`; pass it separately only when
   * `getTitle` substitutes a placeholder, so that typing the placeholder text
   * for real still counts as a change.
   */
  getStoredTitle?: (item: T, context: C) => string;
  /** Persist the rename. Called only for a non-empty title that differs from the stored one. */
  onCommit: (item: T, title: string, context: C) => void;
  /**
   * Fired when the open rename closes, however it closed — committed, cancelled
   * with Escape, or blurred on an unchanged title. `wrote` says whether a new
   * title actually reached `onCommit`.
   *
   * For follow-up work that belongs *after* naming rather than after a
   * successful rename: a post created from a "+" is opened once its name is
   * settled either way, since the post exists whether or not you typed one.
   */
  onEnd?: (id: string, wrote: boolean) => void;
  /**
   * Extra per-rename discriminator, for entities with more than one renameable
   * field. `undefined` for the common single-field case.
   */
  initialContext: C;
}

export interface InlineRenameResult<C> {
  /** Id of the row currently showing the inline field, or null. */
  renamingId: string | null;
  /** Which field the open rename writes to. */
  context: C;
  value: string;
  setValue: (value: string) => void;
  /**
   * Attach to the rename field. A callback ref rather than an object one: it
   * has to focus the input the moment it mounts, and the mount can lag the
   * `start` call by a render — creating the first post swaps a whole empty
   * state out for the tree that contains the field.
   */
  inputRef: (node: HTMLInputElement | null) => void;
  /** Open the field on `id`, seeded from that item's current title. */
  start: (id: string, context?: C) => void;
  /**
   * Open the field on `id` seeded with an explicit title — for a row created in
   * the same tick, whose item this hook's captured `items` does not yet include.
   */
  startWith: (id: string, title: string, context?: C) => void;
  handleBlur: () => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

/**
 * One row at a time renamed in place: an input seeded from the row's title,
 * committed on blur, cancelled on Escape.
 *
 * Enter and Escape both act by blurring the input rather than committing
 * directly, so focus lands on `<body>` before the field unmounts and never
 * falls back to the row's focusable ancestor (which would leave a stuck focus
 * ring). Escape sets a flag first so the ensuing blur cancels instead.
 *
 * Every callback but `handleBlur` keeps a stable identity, so the options may be
 * passed as inline lambdas.
 */
export function useInlineRename<T, C = undefined>(
  options: InlineRenameOptions<T, C>,
): InlineRenameResult<C> {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [context, setContext] = useState<C>(options.initialContext);
  const [value, setValue] = useState("");
  const inputNode = useRef<HTMLInputElement | null>(null);
  // Set on Escape so the ensuing blur cancels instead of committing the rename.
  const cancelRef = useRef(false);

  /**
   * Take the field on mount, hand it focus, and release it on unmount.
   *
   * Stable identity, so React runs this exactly once per mounted field rather
   * than on every render. Doing the focus here instead of in an effect keyed on
   * `renamingId` is what makes it survive the field appearing a render *after*
   * the rename opened — an effect keyed that way sees a null ref and never runs
   * again, leaving the user typing into nothing.
   */
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    inputNode.current = node;
    if (!node) return;
    // Reveal before focusing. A row created by a "+" is ranked to the *end* of
    // its container (every `create*` repository call appends), so on any
    // non-trivial tree the field opens below the fold.
    node.scrollIntoView({ block: "nearest" });
    node.focus();
    node.select();
  }, []);

  // Latest-options ref so the callbacks below read config without depending on
  // it. Read only from event handlers, never during render.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startWith = useCallback((id: string, title: string, next?: C) => {
    setRenamingId(id);
    setContext(next === undefined ? optionsRef.current.initialContext : next);
    setValue(title);
  }, []);

  const start = useCallback(
    (id: string, next?: C) => {
      const { items, getId, getTitle, initialContext } = optionsRef.current;
      const ctx = next === undefined ? initialContext : next;
      const item = items?.find((candidate) => getId(candidate) === id);
      if (!item) return;
      startWith(id, getTitle(item, ctx), ctx);
    },
    [startWith],
  );

  const handleBlur = useCallback(() => {
    const cancelled = cancelRef.current;
    cancelRef.current = false;
    const title = value.trim();
    let wrote = false;
    if (!cancelled && renamingId && title) {
      const { items, getId, getTitle, getStoredTitle, onCommit } =
        optionsRef.current;
      const item = items?.find((candidate) => getId(candidate) === renamingId);
      if (item && (getStoredTitle ?? getTitle)(item, context) !== title) {
        onCommit(item, title, context);
        wrote = true;
      }
    }
    const endedId = renamingId;
    setRenamingId(null);
    setValue("");
    // Last, so an `onEnd` that navigates finds the field already closed.
    if (endedId) optionsRef.current.onEnd?.(endedId, wrote);
  }, [renamingId, context, value]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      inputNode.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRef.current = true;
      inputNode.current?.blur();
    }
  }, []);

  return {
    renamingId,
    context,
    value,
    setValue,
    inputRef,
    start,
    startWith,
    handleBlur,
    handleKeyDown,
  };
}
