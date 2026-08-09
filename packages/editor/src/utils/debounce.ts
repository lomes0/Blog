/**
 * Trailing-edge debounce, sibling to `throttle.ts`.
 *
 * Replaces `debounce` from `@mui/material/utils`, which two dialogs imported
 * for exactly this — MUI's is the same six lines plus a `.clear()` neither
 * caller used. Keeping it here means the editor package does not depend on MUI
 * for a timer.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
}
