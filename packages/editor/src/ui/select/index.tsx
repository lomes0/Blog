"use client";
/**
 * Adapted from haklex `rich-editor-ui/src/components/select` (MIT).
 *
 * `PortalThemeWrapper` dropped (see `ui/tooltip/index.tsx`), and the root is
 * generic. haklex types theirs `ComponentProps<typeof SelectPrimitive.Root>`,
 * which in Base UI 1.7 collapses `SelectRoot<Value, Multiple>` to
 * `<unknown, false>` — every call site then loses the value type and the
 * `multiple` overload. Declaring our own generic wrapper keeps both.
 */
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { mergeClass } from "../cx";
import * as css from "./styles.css";

export type SelectProps<
  Value,
  Multiple extends boolean | undefined = false,
> = SelectPrimitive.Root.Props<Value, Multiple>;

export function Select<Value, Multiple extends boolean | undefined = false>(
  props: SelectProps<Value, Multiple>,
): ReactElement {
  return <SelectPrimitive.Root {...props} />;
}

export type SelectTriggerProps =
  & Omit<ComponentProps<typeof SelectPrimitive.Trigger>, "render">
  & { children?: ReactNode; className?: string };

export function SelectTrigger(
  { children, className, ...props }: SelectTriggerProps,
): ReactElement {
  return (
    <SelectPrimitive.Trigger
      {...props}
      className={mergeClass(css.triggerButton, className)}
    >
      {children}
      <SelectPrimitive.Icon className={css.triggerIcon}>
        <ChevronDown size={16} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export type SelectValueProps = ComponentProps<typeof SelectPrimitive.Value>;
export function SelectValue(props: SelectValueProps): ReactElement {
  return <SelectPrimitive.Value {...props} />;
}

type SelectPositionerProps = ComponentProps<typeof SelectPrimitive.Positioner>;

export type SelectContentProps =
  & Omit<ComponentProps<typeof SelectPrimitive.Popup>, "render">
  & {
    align?: SelectPositionerProps["align"];
    alignItemWithTrigger?: SelectPositionerProps["alignItemWithTrigger"];
    side?: SelectPositionerProps["side"];
    sideOffset?: SelectPositionerProps["sideOffset"];
    children?: ReactNode;
    className?: string;
  };

export function SelectContent({
  children,
  className,
  align = "center",
  alignItemWithTrigger = true,
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectContentProps): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        className={css.positioner}
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          {...props}
          className={mergeClass(css.popup, className)}
        >
          <SelectPrimitive.ScrollUpArrow className={css.scrollButton}>
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className={css.scrollButton}>
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export type SelectItemProps =
  & ComponentProps<typeof SelectPrimitive.Item>
  & { className?: string };

export function SelectItem(
  { className, children, ...props }: SelectItemProps,
): ReactElement {
  return (
    <SelectPrimitive.Item {...props} className={mergeClass(css.item, className)}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className={css.itemIndicator}>
        <Check size={16} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export type SelectGroupProps =
  & ComponentProps<typeof SelectPrimitive.Group>
  & { className?: string };

export function SelectGroup(
  { className, ...props }: SelectGroupProps,
): ReactElement {
  return (
    <SelectPrimitive.Group {...props} className={mergeClass(css.group, className)} />
  );
}

export type SelectGroupLabelProps =
  & ComponentProps<typeof SelectPrimitive.GroupLabel>
  & { className?: string };

export function SelectGroupLabel(
  { className, ...props }: SelectGroupLabelProps,
): ReactElement {
  return (
    <SelectPrimitive.GroupLabel
      {...props}
      className={mergeClass(css.groupLabel, className)}
    />
  );
}

export type SelectSeparatorProps =
  & ComponentProps<typeof SelectPrimitive.Separator>
  & { className?: string };

export function SelectSeparator(
  { className, ...props }: SelectSeparatorProps,
): ReactElement {
  return (
    <SelectPrimitive.Separator
      {...props}
      className={mergeClass(css.separator, className)}
    />
  );
}
