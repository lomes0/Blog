/** Adapted from haklex `rich-editor-ui/src/components/spinner` (MIT). */
import type { ReactElement } from "react";
import { cx } from "../cx";
import { spinner } from "./styles.css";

export interface SpinnerProps {
  className?: string;
  size?: "sm" | "md";
}

export function Spinner({ size, className }: SpinnerProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cx(spinner({ size }), className)}
      role="status"
    />
  );
}
