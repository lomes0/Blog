"use client";
/** Adapted from haklex `rich-editor-ui/src/components/auto-resize-textarea` (MIT). */
import type { Ref, TextareaHTMLAttributes } from "react";
import { useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { cx } from "../cx";
import { overflowing, textarea } from "./styles.css";

export interface AutoResizeTextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  maxRows?: number;
  minRows?: number;
  /**
   * React 19 passes `ref` as a plain prop, so haklex's `forwardRef` wrapper is
   * gone — the inner element is still reached through `useImperativeHandle`
   * because the component needs its own handle to measure with.
   */
  ref?: Ref<HTMLTextAreaElement>;
}

export function AutoResizeTextArea({
  maxRows = 6,
  minRows = 1,
  className,
  onInput,
  ref,
  ...props
}: AutoResizeTextAreaProps) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current!);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;

    el.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 21;
    const maxHeight = lineHeight * maxRows + 16;
    const scrollHeight = el.scrollHeight;

    if (scrollHeight > maxHeight) {
      el.style.height = `${maxHeight}px`;
      el.classList.add(overflowing);
    } else {
      el.style.height = `${scrollHeight}px`;
      el.classList.remove(overflowing);
    }
  }, [maxRows]);

  useEffect(() => {
    resize();
  }, [resize, props.value]);

  return (
    <textarea
      className={cx(textarea, className)}
      ref={innerRef}
      rows={minRows}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      {...props}
    />
  );
}
