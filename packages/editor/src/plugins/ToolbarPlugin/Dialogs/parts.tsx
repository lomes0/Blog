"use client";
/**
 * The two things all ten toolbar dialogs need and the kit does not carry.
 *
 * Both exist to state a decision once. `dismissRequest` is where "Escape does
 * not close these" lives — a rule nine of the ten dialogs used to express as
 * MUI's `disableEscapeKeyDown` and which would otherwise be re-derived, and
 * silently varied, at every port. `FilePickerButton` replaces MUI's
 * `<Button component="label">`, which is the shape every upload control in
 * here had.
 */
import type { ChangeEvent, ReactNode, Ref } from "react";
import { useRef } from "react";
import { ActionButton } from "../../../ui";
import type { ActionButtonProps } from "../../../ui";
import * as css from "./styles.css";

/**
 * Reasons a Base UI dialog reports for closing itself, filtered to the ones
 * these dialogs decline to act on.
 *
 * MUI's `disableEscapeKeyDown` was set on nine of the ten: an editor dialog
 * holds work the surrounding document does not have yet — a sketch, an
 * uploaded file, a typed URL — and a stray Escape while a nested control has
 * focus threw it away. Base UI has no equivalent flag; the reason arrives on
 * the change event instead, so the same rule is a filter.
 *
 * `close-watcher` is here because a hardware back gesture reaches a dialog by
 * that name rather than as `escape-key`, and it means the same thing.
 */
const ESCAPE_REASONS = new Set(["escape-key", "close-watcher"]);

/**
 * Build the `onOpenChange` handler for a dialog that closes through the
 * imperative `SET_DIALOGS_COMMAND` system rather than by owning its own state.
 *
 * @param onClose  what to run when the user genuinely asked to close.
 * @param options  `escapeCloses` opts back in to Escape, for the one dialog
 *                 (`OCRDialog`) that never disabled it.
 */
export function dismissRequest(
  onClose: () => void,
  options?: { escapeCloses?: boolean },
) {
  return (open: boolean, eventDetails: { reason: string }) => {
    if (open) return;
    if (!options?.escapeCloses && ESCAPE_REASONS.has(eventDetails.reason)) {
      return;
    }
    onClose();
  };
}

type FilePickerButtonProps =
  & Omit<ActionButtonProps, "onChange" | "children">
  & {
    accept?: string;
    children: ReactNode;
    inputRef?: Ref<HTMLInputElement>;
    multiple?: boolean;
    onFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  };

/**
 * A real `<button>` that opens the file picker, rather than MUI's
 * `<Button component="label">` wrapping a hidden input.
 *
 * The `<label>` form only reaches the keyboard because MUI's `ButtonBase` adds
 * `tabIndex` and a synthetic key handler to it; a `<button>` that forwards its
 * click is the same behaviour with none of that, and it keeps the disabled
 * state real — a disabled `<label>` is not a thing, which is why the ported
 * dialogs had to disable the inner input separately and still showed a
 * clickable control.
 */
export function FilePickerButton({
  accept,
  children,
  disabled,
  inputRef,
  multiple,
  onFiles,
  variant = "outline",
  size = "lg",
  ...props
}: FilePickerButtonProps) {
  const internalRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <ActionButton
        disabled={disabled}
        onClick={() => internalRef.current?.click()}
        size={size}
        variant={variant}
        {...props}
      >
        {children}
      </ActionButton>
      <input
        accept={accept}
        className={css.visuallyHiddenInput}
        disabled={disabled}
        multiple={multiple}
        onChange={onFiles}
        ref={(node) => {
          internalRef.current = node;
          if (typeof inputRef === "function") inputRef(node);
          else if (inputRef) inputRef.current = node;
        }}
        tabIndex={-1}
        type="file"
      />
    </>
  );
}

/** The indeterminate progress line `OCRDialog` shows while the OCR runs. */
export function IndeterminateProgress({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      className={css.progressTrack}
      style={{ visibility: active ? "visible" : "hidden" }}
    >
      <div className={css.progressBar} />
    </div>
  );
}
