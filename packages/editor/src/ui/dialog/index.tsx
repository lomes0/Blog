"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/dialog` (MIT).
 * `PortalThemeWrapper` dropped — see `ui/tooltip/index.tsx`.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { cx, mergeClass } from "../cx";
import * as css from "./styles.css";

export type DialogProps = ComponentProps<typeof DialogPrimitive.Root>;
export function Dialog(props: DialogProps) {
  return <DialogPrimitive.Root {...props} />;
}

export type DialogTriggerProps = ComponentProps<typeof DialogPrimitive.Trigger>;
export function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger {...props} />;
}

export type DialogPortalProps = ComponentProps<typeof DialogPrimitive.Portal>;
export function DialogPortal(props: DialogPortalProps) {
  return <DialogPrimitive.Portal {...props} />;
}

export type DialogBackdropProps = ComponentProps<
  typeof DialogPrimitive.Backdrop
>;
export function DialogBackdrop({ className, ...props }: DialogBackdropProps) {
  return (
    <DialogPrimitive.Backdrop
      className={mergeClass(css.backdrop, className)}
      {...props}
    />
  );
}

export type DialogPopupProps =
  & ComponentProps<typeof DialogPrimitive.Popup>
  & { showCloseButton?: boolean; className?: string; children?: ReactNode };

export function DialogPopup({
  showCloseButton = true,
  className,
  children,
  ...props
}: DialogPopupProps) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup className={mergeClass(css.popup, className)} {...props}>
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="Close"
            className={css.closeButton}
          >
            <X />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export type DialogCloseProps = ComponentProps<typeof DialogPrimitive.Close>;
export function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close {...props} />;
}

export type DialogHeaderProps = HTMLAttributes<HTMLDivElement>;
export function DialogHeader(
  { className, children, ...props }: DialogHeaderProps,
) {
  return (
    <div className={cx(css.header, className)} {...props}>
      <div className={css.headerContent}>{children}</div>
    </div>
  );
}

export type DialogFooterProps = HTMLAttributes<HTMLDivElement>;
export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return <div className={cx(css.footer, className)} {...props} />;
}

export type DialogTitleProps = ComponentProps<typeof DialogPrimitive.Title>;
export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title className={mergeClass(css.title, className)} {...props} />
  );
}

export type DialogDescriptionProps = ComponentProps<
  typeof DialogPrimitive.Description
>;
export function DialogDescription(
  { className, ...props }: DialogDescriptionProps,
) {
  return (
    <DialogPrimitive.Description
      className={mergeClass(css.description, className)}
      {...props}
    />
  );
}
