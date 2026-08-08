"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/dialog/sheet.tsx` (MIT):
 * the mobile bottom sheet, with its drag-to-dismiss gesture.
 *
 * ## What was dropped, and why
 *
 * haklex's `SheetStackEntry` is driven by a module-level dialog *stack*
 * (`dialog/store.ts` + `dialog/stack.tsx`): you call `presentDialog({ content:
 * SomeComponent })` from anywhere and a provider mounted at the app root
 * renders it, with `removeDialog` on a 200ms timer to outlive the exit
 * animation. That is an imperative global dialog system, and this repo already
 * has one — every editor dialog goes through `SET_DIALOGS_COMMAND`
 * (`plugins/ToolbarPlugin/Dialogs`), which is Lexical-command driven and
 * carries editor state the store knows nothing about. Adopting a second would
 * mean two answers to "what is open".
 *
 * So the gesture — the part that is genuinely hard and genuinely theirs — is
 * kept, and the component is controlled: `open` is a prop and `onDismiss` is a
 * callback. `PortalThemeProvider`/`PortalThemeWrapper` go the same way as
 * everywhere else in the kit (see `ui/tooltip/index.tsx`).
 *
 * The exit animation needs the element to stay mounted while `open` is false,
 * so the caller unmounts on its own schedule (or never); this component never
 * removes itself.
 */
import type { ReactNode, TouchEvent as ReactTouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx";
import * as css from "./styles.css";

export interface SheetProps {
  children: ReactNode;
  className?: string;
  /** Dismiss when the backdrop is tapped. */
  clickOutsideToDismiss?: boolean;
  description?: ReactNode;
  onDismiss: () => void;
  open: boolean;
  title?: ReactNode;
  /** Stacking offset, when more than one sheet is on screen. */
  zIndex?: number;
}

export function Sheet({
  children,
  className,
  clickOutsideToDismiss = true,
  description,
  onDismiss,
  open,
  title,
  zIndex = 1400,
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<
    {
      startY: number;
      startTime: number;
      currentY: number;
      isDragging: boolean;
    } | null
  >(null);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Body scroll lock for as long as the sheet is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const isHandle = target.closest(`.${css.sheetDragHandle}`) !== null;
    const contentEl = contentRef.current;
    const isContentAtTop = !contentEl || contentEl.scrollTop <= 0;

    if (!isHandle && !isContentAtTop) return;

    dragState.current = {
      startY: touch.clientY,
      startTime: Date.now(),
      currentY: touch.clientY,
      isDragging: false,
    };
  }, []);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    const state = dragState.current;
    if (!state) return;

    const touch = e.touches[0];
    const deltaY = touch.clientY - state.startY;

    if (deltaY < 0) {
      if (state.isDragging) {
        setTranslateY(0);
        setIsDragging(false);
        state.isDragging = false;
      }
      return;
    }

    if (!state.isDragging && deltaY > 5) {
      state.isDragging = true;
      setIsDragging(true);
    }

    if (state.isDragging) {
      e.preventDefault();
      state.currentY = touch.clientY;
      setTranslateY(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const state = dragState.current;
    if (!state || !state.isDragging) {
      dragState.current = null;
      return;
    }

    const deltaY = state.currentY - state.startY;
    const elapsed = Date.now() - state.startTime;
    const velocity = (deltaY / Math.max(elapsed, 1)) * 1000;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 0;
    const threshold = sheetHeight * 0.25;

    if (deltaY > threshold || velocity > 500) {
      onDismiss();
    } else {
      setTranslateY(0);
    }

    setIsDragging(false);
    dragState.current = null;
  }, [onDismiss]);

  const sheetHeight = sheetRef.current?.offsetHeight || 1;
  const backdropOpacity = isDragging
    ? Math.max(0, 1 - translateY / sheetHeight)
    : 1;

  return (
    <>
      <div
        className={css.sheetBackdrop}
        style={{
          zIndex,
          opacity: open ? backdropOpacity : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={clickOutsideToDismiss ? onDismiss : undefined}
      />

      <div
        className={cx(css.sheetContainer, className)}
        data-closed={!open ? "" : undefined}
        data-open={open ? "" : undefined}
        ref={sheetRef}
        style={{
          zIndex: zIndex + 1,
          transform: isDragging ? `translateY(${translateY}px)` : undefined,
          transition: isDragging
            ? "none"
            : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
      >
        <div className={css.sheetDragHandle}>
          <div className={css.sheetDragPill} />
        </div>

        {(title || description) && (
          <div className={css.sheetHeader}>
            {title && <div className={css.title}>{title}</div>}
            {description && <div className={css.description}>{description}</div>}
          </div>
        )}

        <div className={css.sheetContent} ref={contentRef}>
          {children}
        </div>
      </div>
    </>
  );
}
