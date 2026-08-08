/** Adapted from haklex `rich-editor-ui/src/components/badge` (MIT). */
import type { ReactElement, ReactNode } from "react";
import { cx } from "../cx";
import { badge } from "./styles.css";

export interface BadgeProps {
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  variant?: "neutral" | "success" | "error" | "warning" | "info";
}

export function Badge(
  { variant, size, children, className }: BadgeProps,
): ReactElement {
  return (
    <span className={cx(badge({ variant, size }), className)}>{children}</span>
  );
}
