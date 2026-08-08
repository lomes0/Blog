"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/popover` (MIT).
 *
 * Two things dropped: `PortalThemeWrapper` (see `ui/tooltip/index.tsx`), and
 * haklex's `usePopover` context. The latter mirrors the `open` prop into local
 * state through a `useEffect` so descendants can read it — a second source of
 * truth for something Base UI already publishes as `[data-open]` on the popup,
 * and nothing in the kit consumed it.
 */
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";
import { mergeClass } from "../cx";
import * as css from "./styles.css";

export type PopoverProps = ComponentProps<typeof PopoverPrimitive.Root>;
export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

export type PopoverTriggerProps = ComponentProps<
  typeof PopoverPrimitive.Trigger
>;
export function PopoverTrigger(props: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger {...props} />;
}

export type PopoverPortalProps = ComponentProps<typeof PopoverPrimitive.Portal>;
export function PopoverPortal(props: PopoverPortalProps) {
  return <PopoverPrimitive.Portal {...props} />;
}

export type PopoverPositionerProps = ComponentProps<
  typeof PopoverPrimitive.Positioner
>;
export function PopoverPositioner(
  { className, ...props }: PopoverPositionerProps,
) {
  return (
    <PopoverPrimitive.Positioner
      className={mergeClass(css.positioner, className)}
      {...props}
    />
  );
}

export type PopoverPopupProps =
  & Omit<ComponentProps<typeof PopoverPrimitive.Popup>, "render">
  & { className?: string; children?: ReactNode };

export function PopoverPopup(
  { className, children, ...props }: PopoverPopupProps,
) {
  return (
    <PopoverPrimitive.Popup className={mergeClass(css.popup, className)} {...props}>
      {children}
    </PopoverPrimitive.Popup>
  );
}

export type PopoverPanelProps = PopoverPopupProps & {
  align?: PopoverPositionerProps["align"];
  side?: PopoverPositionerProps["side"];
  sideOffset?: PopoverPositionerProps["sideOffset"];
};

/** Portal + Positioner + Popup, the shape almost every caller wants. */
export function PopoverPanel({
  align = "center",
  side,
  sideOffset = 4,
  className,
  children,
  ...popupProps
}: PopoverPanelProps) {
  return (
    <PopoverPortal>
      <PopoverPositioner align={align} side={side} sideOffset={sideOffset}>
        <PopoverPopup className={className} {...popupProps}>
          {children}
        </PopoverPopup>
      </PopoverPositioner>
    </PopoverPortal>
  );
}

export type PopoverArrowProps = ComponentProps<typeof PopoverPrimitive.Arrow>;
export function PopoverArrow({ className, ...props }: PopoverArrowProps) {
  return (
    <PopoverPrimitive.Arrow className={mergeClass(css.arrow, className)} {...props} />
  );
}

export type PopoverCloseProps = ComponentProps<typeof PopoverPrimitive.Close>;
export function PopoverClose(props: PopoverCloseProps) {
  return <PopoverPrimitive.Close {...props} />;
}

export type PopoverTitleProps = ComponentProps<typeof PopoverPrimitive.Title>;
export function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title className={mergeClass(css.title, className)} {...props} />
  );
}

export type PopoverDescriptionProps = ComponentProps<
  typeof PopoverPrimitive.Description
>;
export function PopoverDescription(
  { className, ...props }: PopoverDescriptionProps,
) {
  return (
    <PopoverPrimitive.Description
      className={mergeClass(css.description, className)}
      {...props}
    />
  );
}
