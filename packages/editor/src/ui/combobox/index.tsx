"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/combobox` (MIT).
 * `PortalThemeWrapper` dropped — see `ui/tooltip/index.tsx`.
 */
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { mergeClass } from "../cx";
import * as css from "./styles.css";

export type ComboboxProps<
  Value,
  Multiple extends boolean | undefined = false,
> = ComboboxPrimitive.Root.Props<Value, Multiple>;

export function Combobox<Value, Multiple extends boolean | undefined = false>(
  props: ComboboxProps<Value, Multiple>,
): ReactElement {
  return <ComboboxPrimitive.Root {...props} />;
}

export type ComboboxTriggerProps =
  & ComponentProps<typeof ComboboxPrimitive.Trigger>
  & { className?: string };
export function ComboboxTrigger(props: ComboboxTriggerProps) {
  return <ComboboxPrimitive.Trigger {...props} />;
}

export type ComboboxInputProps =
  & ComponentProps<typeof ComboboxPrimitive.Input>
  & { className?: string };
export function ComboboxInput({ className, ...props }: ComboboxInputProps) {
  return (
    <ComboboxPrimitive.Input className={mergeClass(css.input, className)} {...props} />
  );
}

type PositionerProps = ComponentProps<typeof ComboboxPrimitive.Positioner>;

export type ComboboxContentProps =
  & Omit<ComponentProps<typeof ComboboxPrimitive.Popup>, "render">
  & {
    align?: PositionerProps["align"];
    alignOffset?: PositionerProps["alignOffset"];
    side?: PositionerProps["side"];
    sideOffset?: PositionerProps["sideOffset"];
    positionMethod?: PositionerProps["positionMethod"];
    anchor?: PositionerProps["anchor"];
    className?: string;
    children?: ReactNode;
  };

export function ComboboxContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod = "absolute",
  anchor,
  className,
  children,
  ...popupProps
}: ComboboxContentProps) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className={css.positioner}
        positionMethod={positionMethod}
        side={side}
        sideOffset={sideOffset}
      >
        <ComboboxPrimitive.Popup
          className={mergeClass(css.popup, className)}
          {...popupProps}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

export type ComboboxListProps = ComponentProps<typeof ComboboxPrimitive.List>;
export function ComboboxList(props: ComboboxListProps) {
  return <ComboboxPrimitive.List {...props} />;
}

export type ComboboxItemProps =
  & ComponentProps<typeof ComboboxPrimitive.Item>
  & { className?: string };
export function ComboboxItem({ className, ...props }: ComboboxItemProps) {
  return (
    <ComboboxPrimitive.Item className={mergeClass(css.item, className)} {...props} />
  );
}

export type ComboboxItemIndicatorProps = ComponentProps<
  typeof ComboboxPrimitive.ItemIndicator
>;
export function ComboboxItemIndicator(props: ComboboxItemIndicatorProps) {
  return <ComboboxPrimitive.ItemIndicator {...props} />;
}

export type ComboboxEmptyProps =
  & ComponentProps<typeof ComboboxPrimitive.Empty>
  & { className?: string };
export function ComboboxEmpty({ className, ...props }: ComboboxEmptyProps) {
  return (
    <ComboboxPrimitive.Empty className={mergeClass(css.empty, className)} {...props} />
  );
}

export type ComboboxGroupProps = ComponentProps<typeof ComboboxPrimitive.Group>;
export function ComboboxGroup(props: ComboboxGroupProps) {
  return <ComboboxPrimitive.Group {...props} />;
}

export type ComboboxGroupLabelProps = ComponentProps<
  typeof ComboboxPrimitive.GroupLabel
>;
export function ComboboxGroupLabel(props: ComboboxGroupLabelProps) {
  return <ComboboxPrimitive.GroupLabel {...props} />;
}
