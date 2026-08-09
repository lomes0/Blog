"use client";
/**
 * `RadioGroup` / `RadioField` — MUI's `RadioGroup + FormControlLabel + Radio`.
 *
 * The group is generic over its value for the same reason `ui/select` is:
 * Base UI types `RadioGroup` as `<Value>(props) => Element`, and re-exporting
 * it through `ComponentProps<typeof RadioGroup>` would collapse `Value` to
 * `any` at every call site.
 */
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { cx } from "../cx";
import * as css from "./styles.css";

export type RadioGroupProps<Value> =
  & RadioGroupPrimitive.Props<Value>
  & {
    /** Lay the options out in a row rather than a column. */
    row?: boolean;
    className?: string;
  };

export function RadioGroup<Value>(
  { className, row = false, ...props }: RadioGroupProps<Value>,
): ReactElement {
  return (
    <RadioGroupPrimitive
      className={cx(row ? css.groupRow : css.group, className)}
      {...props}
    />
  );
}

export type RadioProps<Value> =
  & RadioPrimitive.Root.Props<Value>
  & { className?: string };

export function Radio<Value>(
  { className, ...props }: RadioProps<Value>,
): ReactElement {
  return (
    <RadioPrimitive.Root className={cx(css.control, className)} {...props}>
      <RadioPrimitive.Indicator className={css.indicator} />
    </RadioPrimitive.Root>
  );
}

export type RadioFieldProps<Value> = RadioProps<Value> & {
  label: ReactNode;
  /** Class for the wrapping `<label>`, not for the control. */
  rootClassName?: string;
};

export function RadioField<Value>(
  { label, rootClassName, ...props }: RadioFieldProps<Value>,
): ReactElement {
  return (
    <label className={cx(css.row, rootClassName)}>
      <Radio {...props} />
      <span className={css.rowLabel}>{label}</span>
    </label>
  );
}

export type RadioGroupLabelProps = HTMLAttributes<HTMLSpanElement>;

/** MUI's `FormLabel`: the heading above a group of options. */
export function RadioGroupLabel(
  { className, ...props }: RadioGroupLabelProps,
) {
  return <span className={cx(css.groupLabel, className)} {...props} />;
}
