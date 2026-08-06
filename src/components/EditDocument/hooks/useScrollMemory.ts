"use client";
import { useEffect, useRef } from "react";
import { isRestoreSettled } from "@/lib/scrollMemory";
import { readScroll, rememberScroll } from "@/store/workspacePersistence";

/**
 * Return a pane's document to where it was left.
 *
 * A reload that puts you back at the top of a long document is not a fast
 * reload, however quick it was — the thing you were looking at is still gone.
 * This is the half of that which has to touch the DOM; the arithmetic is
 * `lib/scrollMemory.ts` and the storage is the workspace record.
 *
 * ## Finding the scroller
 *
 * There isn't one scroller, there are two, and which is in play is not this
 * component's business to know: unsplit, the page's own container scrolls the
 * document (`#editor-main-container`); split, each pane scrolls itself inside
 * `PaneFrame`. So the element is found by walking up from the panel rather than
 * named — the same "nearest scrollable ancestor" the editor's own portalled
 * chrome resolves against.
 *
 * ## Why the restore is a loop
 *
 * `scrollTop` cannot be assigned past the end of the content, and the browser
 * clamps rather than complaining. A pane's content arrives in pieces — header,
 * Lexical's first render, then images and embeds settling their own heights —
 * so a single assignment on mount reliably lands short and leaves the reader
 * near the top of a document they were reading the middle of. The loop
 * re-asserts the target as the scroller grows and gives up on a deadline, so a
 * document that legitimately got shorter costs a second of rAF and nothing
 * else.
 *
 * ## Why a gesture wins
 *
 * If content is still settling when the reader starts scrolling, the restore
 * has to yield instantly: a page that drags itself out from under an active
 * gesture is worse than one that never restored. Wheel, touch, key and pointer
 * are all treated as that signal — none of them is something the restore itself
 * can emit, which is what makes them safe to distinguish it by.
 */

/** How long to keep re-asserting the target as content settles. */
const RESTORE_WINDOW_MS = 1500;

/**
 * How long the scroller must hold its height before a short landing is read as
 * "the document is simply shorter now" rather than "it is still rendering".
 */
const GROWN_AFTER_MS = 250;

const scrollerFor = (from: HTMLElement | null): HTMLElement | null => {
  let node = from?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
};

export function useScrollMemory(
  docId: string,
  /** Only the pane's visible tab owns the scroller. */
  isActive: boolean,
  /** False until there is content to scroll — restoring before it is a no-op. */
  ready: boolean,
) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !ready || !docId) return;
    const scroller = scrollerFor(anchorRef.current);
    if (!scroller) return;

    let disposed = false;
    let raf = 0;
    let recording = false;

    // Recording is off until the restore is done or abandoned. Otherwise the
    // intermediate positions of the restore itself — including the 0 it starts
    // from — would be written back over the value being restored.
    const startRecording = () => {
      recording = !disposed;
    };

    const target = readScroll(docId);

    let lastHeight = scroller.scrollHeight;
    let heightHeldSince = performance.now();
    const deadline = performance.now() + RESTORE_WINDOW_MS;

    const step = (goal: number) => {
      if (disposed) return;
      const now = performance.now();
      if (scroller.scrollHeight !== lastHeight) {
        lastHeight = scroller.scrollHeight;
        heightHeldSince = now;
      }
      scroller.scrollTop = goal;
      const settled = isRestoreSettled({
        target: goal,
        actual: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        grown: now - heightHeldSince >= GROWN_AFTER_MS,
      });
      if (settled || now > deadline) {
        startRecording();
        return;
      }
      raf = requestAnimationFrame(() => step(goal));
    };

    // A gesture during the restore ends it — see the note above.
    const yieldToUser = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      startRecording();
    };
    const GESTURES = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const type of GESTURES) {
      scroller.addEventListener(type, yieldToUser, {
        passive: true,
        once: true,
      });
    }

    if (target === undefined || target === 0) {
      // Nothing remembered, or remembered as the top, which is where a fresh
      // scroller already is. Skip straight to recording.
      startRecording();
    } else {
      const goal = target;
      raf = requestAnimationFrame(() => step(goal));
    }

    // Recorded from the scroll event alone, never from this effect's cleanup.
    // Cleanup runs *after* React has flipped `display` on a tab switch, by
    // which point the scroller may already have clamped to the incoming tab's
    // height — reading it there would overwrite a good value with that clamp.
    // The continuous record is always the honest one.
    let recordRaf = 0;
    const onScroll = () => {
      if (!recording || recordRaf) return;
      recordRaf = requestAnimationFrame(() => {
        recordRaf = 0;
        if (recording) rememberScroll(docId, scroller.scrollTop);
      });
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      disposed = true;
      recording = false;
      if (raf) cancelAnimationFrame(raf);
      if (recordRaf) cancelAnimationFrame(recordRaf);
      scroller.removeEventListener("scroll", onScroll);
      for (const type of GESTURES) {
        scroller.removeEventListener(type, yieldToUser);
      }
    };
  }, [docId, isActive, ready]);

  return anchorRef;
}
