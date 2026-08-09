"use client";
/**
 * `Switch`, and the labelled row MUI spelled `FormControlLabel + Switch`.
 *
 * Base UI's `Switch.Root` renders a `<span>` plus a hidden `<input>`, so the
 * row wraps both in a `<label>` — clicking the text toggles, which is the only
 * behaviour of `FormControlLabel` anything here relied on.
 */
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import type { ReactNode } from "react";
import { cx, mergeClass } from "../cx";
import * as css from "./styles.css";

export type SwitchProps = SwitchPrimitive.Root.Props;

export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={mergeClass(css.track, className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className={css.thumb} />
    </SwitchPrimitive.Root>
  );
}

export type SwitchFieldProps = SwitchProps & {
  label: ReactNode;
  /** Class for the wrapping `<label>`, not for the track. */
  rootClassName?: string;
};

export function SwitchField(
  { label, rootClassName, ...props }: SwitchFieldProps,
) {
  return (
    <label className={cx(css.row, rootClassName)}>
      <Switch {...props} />
      <span className={css.rowLabel}>{label}</span>
    </label>
  );
}
