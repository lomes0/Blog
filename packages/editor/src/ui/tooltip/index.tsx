"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/tooltip` (MIT).
 *
 * `PortalThemeWrapper` is gone: our token contract is declared on `:root` with
 * an `html.dark` override, so a popup portaled to `document.body` inherits it
 * for free. That is the whole reason the contract has that shape — see the
 * header of `styles/tokens.css.ts`.
 */
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { mergeClass } from "../cx";
import * as css from "./styles.css";

export type TooltipProviderProps = ComponentProps<
  typeof TooltipPrimitive.Provider
>;
export function TooltipProvider(props: TooltipProviderProps) {
  return <TooltipPrimitive.Provider {...props} />;
}

export type TooltipRootProps = ComponentProps<typeof TooltipPrimitive.Root>;
export function TooltipRoot(props: TooltipRootProps) {
  return <TooltipPrimitive.Root {...props} />;
}

export type TooltipTriggerProps = ComponentProps<
  typeof TooltipPrimitive.Trigger
>;
export function TooltipTrigger(props: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export type TooltipPortalProps = ComponentProps<typeof TooltipPrimitive.Portal>;
export function TooltipPortal(props: TooltipPortalProps) {
  return <TooltipPrimitive.Portal {...props} />;
}

export type TooltipPositionerProps = ComponentProps<
  typeof TooltipPrimitive.Positioner
>;
export function TooltipPositioner({
  className,
  ...props
}: TooltipPositionerProps) {
  return (
    <TooltipPrimitive.Positioner
      className={mergeClass(css.positioner, className)}
      {...props}
    />
  );
}

export type TooltipPopupProps =
  & Omit<ComponentProps<typeof TooltipPrimitive.Popup>, "render">
  & { className?: string; children?: ReactNode };

export function TooltipPopup(
  { className, children, ...props }: TooltipPopupProps,
) {
  return (
    <TooltipPrimitive.Popup className={mergeClass(css.popup, className)} {...props}>
      {children}
    </TooltipPrimitive.Popup>
  );
}

export type TooltipContentProps = TooltipPopupProps & {
  side?: TooltipPositionerProps["side"];
  sideOffset?: TooltipPositionerProps["sideOffset"];
  align?: TooltipPositionerProps["align"];
};

export function TooltipContent({
  side = "top",
  sideOffset = 6,
  align = "center",
  className,
  children,
  ...popupProps
}: TooltipContentProps) {
  return (
    <TooltipPortal>
      <TooltipPositioner align={align} side={side} sideOffset={sideOffset}>
        <TooltipPopup className={className} {...popupProps}>
          {children}
        </TooltipPopup>
      </TooltipPositioner>
    </TooltipPortal>
  );
}

/**
 * Root + Trigger + Content in one, for the overwhelmingly common case: a
 * control that wants a label. Not in haklex — added because replacing a
 * `title=` attribute with five nested elements at every toolbar button is how
 * a toolbar stops being readable.
 *
 * The trigger is passed through Base UI's `render` prop, so `children` keeps
 * being the real element (a `Toggle`, an `ActionButton`) rather than being
 * wrapped in a span that would break flex layout and toggle-group keyboard
 * navigation.
 *
 * There is deliberately no `delay` prop. In Base UI 1.7 `delay`/`closeDelay`
 * live on `Tooltip.Provider` only — `Tooltip.Root` does not accept them — and
 * that is the right place anyway: a `Provider` around a toolbar makes the
 * *group* share one delay, so moving between buttons re-shows instantly
 * instead of waiting again at each one.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 6,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: TooltipPositionerProps["side"];
  sideOffset?: TooltipPositionerProps["sideOffset"];
}) {
  return (
    <TooltipRoot>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipContent side={side} sideOffset={sideOffset}>
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
}

export const createTooltipHandle = TooltipPrimitive.createHandle;
