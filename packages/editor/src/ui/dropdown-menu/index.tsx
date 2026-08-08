"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/dropdown-menu` (MIT).
 * `PortalThemeWrapper` dropped — see `ui/tooltip/index.tsx` for why.
 */
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cx, mergeClass } from "../cx";
import * as css from "./styles.css";

export type DropdownMenuProps = ComponentProps<typeof MenuPrimitive.Root>;
export function DropdownMenu(props: DropdownMenuProps) {
  return <MenuPrimitive.Root {...props} />;
}

export type DropdownMenuTriggerProps = ComponentProps<
  typeof MenuPrimitive.Trigger
>;
export function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <MenuPrimitive.Trigger {...props} />;
}

type PositionerProps = ComponentProps<typeof MenuPrimitive.Positioner>;

export type DropdownMenuContentProps =
  & Omit<ComponentProps<typeof MenuPrimitive.Popup>, "render">
  & {
    align?: PositionerProps["align"];
    alignOffset?: PositionerProps["alignOffset"];
    side?: PositionerProps["side"];
    sideOffset?: PositionerProps["sideOffset"];
    positionMethod?: PositionerProps["positionMethod"];
    /**
     * Position against something other than the trigger. Base UI 1.7 names
     * this `anchor` on every positioner; haklex never passes it, so it is
     * surfaced here for the plugins that anchor a menu to a selection rect.
     */
    anchor?: PositionerProps["anchor"];
    className?: string;
    children?: ReactNode;
  };

export function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  positionMethod = "absolute",
  anchor,
  className,
  children,
  ...popupProps
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className={css.positioner}
        positionMethod={positionMethod}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={mergeClass(css.popup, className)}
          {...popupProps}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export type DropdownMenuGroupProps = ComponentProps<typeof MenuPrimitive.Group>;
export function DropdownMenuGroup(props: DropdownMenuGroupProps) {
  return <MenuPrimitive.Group {...props} />;
}

export type DropdownMenuLabelProps = ComponentProps<
  typeof MenuPrimitive.GroupLabel
>;
export function DropdownMenuLabel(
  { className, ...props }: DropdownMenuLabelProps,
) {
  return (
    <MenuPrimitive.GroupLabel className={mergeClass(css.label, className)} {...props} />
  );
}

export type DropdownMenuItemProps =
  & ComponentProps<typeof MenuPrimitive.Item>
  & { className?: string };
export function DropdownMenuItem({ className, ...props }: DropdownMenuItemProps) {
  return <MenuPrimitive.Item className={mergeClass(css.item, className)} {...props} />;
}

export type DropdownMenuSeparatorProps = ComponentProps<
  typeof MenuPrimitive.Separator
>;
export function DropdownMenuSeparator(
  { className, ...props }: DropdownMenuSeparatorProps,
) {
  return (
    <MenuPrimitive.Separator
      className={mergeClass(css.separator, className)}
      {...props}
    />
  );
}

export type DropdownMenuRadioGroupProps = ComponentProps<
  typeof MenuPrimitive.RadioGroup
>;
export function DropdownMenuRadioGroup(props: DropdownMenuRadioGroupProps) {
  return <MenuPrimitive.RadioGroup {...props} />;
}

export type DropdownMenuRadioItemProps =
  & ComponentProps<typeof MenuPrimitive.RadioItem>
  & { className?: string };
export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      className={cx(css.item, css.radioItem, className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className={css.radioIndicator}>
        <Check size={16} />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export type DropdownMenuCheckboxItemProps =
  & ComponentProps<typeof MenuPrimitive.CheckboxItem>
  & { className?: string };
export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <MenuPrimitive.CheckboxItem
      className={cx(css.item, css.checkboxItem, className)}
      {...props}
    >
      {children}
      <MenuPrimitive.CheckboxItemIndicator className={css.checkboxIndicator}>
        <Check size={16} />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

/** The trailing keyboard-shortcut column on a menu row. */
export function DropdownMenuShortcut(
  { className, children }: { className?: string; children: ReactNode },
) {
  return <span className={cx(css.shortcut, className)}>{children}</span>;
}
