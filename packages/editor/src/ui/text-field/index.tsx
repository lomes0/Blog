"use client";
/**
 * `TextField` — what MUI's was used for at the thirteen call sites in
 * `plugins/ToolbarPlugin/Dialogs`, minus the floating label and the `sx` prop.
 *
 * ## Why this is a plain `<label>` + `<input>` and not Base UI's `Field`
 *
 * `Field` would give label/control association, a `disabled` state on the
 * label and validity plumbing. We need the first two and not the third, and
 * `Field.Control` is typed `BaseUIComponentProps<'input'>` — so the multiline
 * variant (a `<textarea>` through `render`) can only be typed by casting away
 * the element, which costs more than the `useId` it would save. Association
 * here is two lines and covers `<input>`, `<textarea>` and a `Select` trigger
 * identically.
 *
 * ## Why `onChange` and not a value-only callback
 *
 * Every dialog that uses this reads `event.target.name` to decide which key of
 * a form-state object to write. A value-only callback would mean rewriting ten
 * handlers to gain nothing.
 *
 * ## The one deliberate visual departure
 *
 * The label sits **above** the control instead of riding a notch in the
 * outline. MUI's floating label is three coupled animations plus a
 * `<fieldset><legend>` measured from the label text; a static label is a fifth
 * of the CSS and it agrees with the label above a `Switch` or a `RadioGroup` a
 * few lines down the same form.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { cx } from "../cx";
import * as css from "./styles.css";

type SharedProps = {
  /** Visible label, rendered above the control and wired to it by `id`. */
  label?: ReactNode;
  /** Extra content under the control — a hint, or a validation message. */
  description?: ReactNode;
  /** Class for the wrapper, not for the control. */
  rootClassName?: string;
};

function FieldShell(
  { id, label, description, className, children }: {
    id: string;
    label?: ReactNode;
    description?: ReactNode;
    className?: string;
    children: ReactNode;
  },
) {
  return (
    <div className={cx(css.root, className)}>
      {label && <label className={css.label} htmlFor={id}>{label}</label>}
      {children}
      {description && <span className={css.label}>{description}</span>}
    </div>
  );
}

export type TextFieldProps =
  & Omit<InputHTMLAttributes<HTMLInputElement>, "size">
  & SharedProps
  & { ref?: Ref<HTMLInputElement> };

export function TextField({
  label,
  description,
  className,
  rootClassName,
  id,
  ...props
}: TextFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <FieldShell
      className={rootClassName}
      description={description}
      id={controlId}
      label={label}
    >
      <input
        className={cx(css.control, className)}
        id={controlId}
        {...props}
      />
    </FieldShell>
  );
}

export type TextAreaFieldProps =
  & TextareaHTMLAttributes<HTMLTextAreaElement>
  & SharedProps
  & { ref?: Ref<HTMLTextAreaElement> };

/** The `multiline` half of MUI's `TextField`, as its own component. */
export function TextAreaField({
  label,
  description,
  className,
  rootClassName,
  id,
  ...props
}: TextAreaFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <FieldShell
      className={rootClassName}
      description={description}
      id={controlId}
      label={label}
    >
      <textarea
        className={cx(css.textarea, className)}
        id={controlId}
        {...props}
      />
    </FieldShell>
  );
}

export type NumberStepperFieldProps = TextFieldProps & {
  /** Rendered to the left of the control. */
  decrement?: ReactNode;
  /** Rendered to the right of it. */
  increment?: ReactNode;
};

/**
 * A `TextField` flanked by two buttons — the shape `TableDialog` builds around
 * its row and column counts. Deliberately *not* Base UI's `NumberField`: that
 * primitive owns the value as a number and brings a scrub area and a format
 * locale, where the dialog it serves keeps its counts as strings and clamps
 * them itself.
 */
export function NumberStepperField({
  label,
  className,
  rootClassName,
  decrement,
  increment,
  id,
  ...props
}: NumberStepperFieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  return (
    <FieldShell className={rootClassName} id={controlId} label={label}>
      <div className={css.adornedRow}>
        {decrement}
        <input
          className={cx(css.control, className)}
          id={controlId}
          {...props}
        />
        {increment}
      </div>
    </FieldShell>
  );
}

export type StepperButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** The flanking button `NumberStepperField` expects, pre-styled to match. */
export function StepperButton({ className, ...props }: StepperButtonProps) {
  return (
    <button className={cx(css.stepper, className)} type="button" {...props} />
  );
}

export type FieldLabelTextProps = HTMLAttributes<HTMLSpanElement>;

/**
 * The field label on its own, for a control this module does not render — the
 * `Select` in `AIDialog`, the section headings in `ImageDialog`.
 */
export function FieldLabelText({ className, ...props }: FieldLabelTextProps) {
  return <span className={cx(css.label, className)} {...props} />;
}
