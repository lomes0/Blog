/** Adapted from haklex `rich-editor-ui/src/components/action-button` (MIT). */
import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cx } from "../cx";
import * as css from "./styles.css";

export type ActionButtonVariant = "ghost" | "solid" | "outline" | "accent";
export type ActionButtonSize = "sm" | "md" | "lg";

export type ActionBarProps = HTMLAttributes<HTMLDivElement> & {
  gap?: string | number;
};

export function ActionBar({ className, gap, style, ...props }: ActionBarProps) {
  return (
    <div
      className={cx(css.actionBar, css.semanticClassNames.actionBar, className)}
      style={gap != null ? { ...style, gap } : style}
      {...props}
    />
  );
}

export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  end?: boolean;
  danger?: boolean;
  icon?: boolean;
  rounded?: boolean;
};

export function ActionButton({
  variant,
  size,
  end = false,
  danger = false,
  icon = false,
  rounded = false,
  className,
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      className={cx(
        css.actionButton({ variant, size, end, danger, icon, rounded }),
        css.semanticClassNames.actionButton,
        end && css.semanticClassNames.actionButtonEnd,
        danger && css.semanticClassNames.actionButtonDanger,
        icon && css.semanticClassNames.actionButtonIcon,
        className,
      )}
      type={type}
      {...props}
    />
  );
}

/**
 * The class alone, for the case `ActionButton` cannot serve: a headless
 * primitive that renders its own `<button>` (Base UI's `Toggle`, `Menu.Trigger`
 * with `render`) and only accepts a `className`.
 */
export function getActionButtonClassName(options?: {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  icon?: boolean;
  rounded?: boolean;
}) {
  return cx(css.actionButton(options), css.semanticClassNames.actionButton);
}
