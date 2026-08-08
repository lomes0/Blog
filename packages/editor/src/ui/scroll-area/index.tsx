"use client";
/** Adapted from haklex `rich-editor-ui/src/components/scroll-area` (MIT). */
import type { ReactElement, ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { cx } from "../cx";
import { scrollArea } from "./styles.css";

export interface ScrollAreaProps {
  autoScrollToBottom?: boolean;
  children: ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}

export function ScrollArea({
  children,
  className,
  autoScrollToBottom = false,
  scrollRef,
}: ScrollAreaProps): ReactElement {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? innerRef;
  const isAtBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const threshold = 40;
    isAtBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, [ref]);

  // Deliberately dependency-free, as in the source: the point is to re-assert
  // "stick to the bottom" after *every* render that may have added content.
  useEffect(() => {
    if (!autoScrollToBottom) return;
    const el = ref.current;
    if (!el || !isAtBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  });

  return (
    <div
      className={cx(scrollArea, className)}
      ref={ref}
      onScroll={autoScrollToBottom ? handleScroll : undefined}
    >
      {children}
    </div>
  );
}
