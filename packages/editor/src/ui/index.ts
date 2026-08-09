/**
 * The editor package's UI primitives kit.
 *
 * Ported from haklex `packages/rich-editor-ui` (MIT, github.com/Innei/haklex)
 * per docs/plans/haklex-adoption.md §5, so that their component code — the
 * phase-3 image and code-block upgrades, the phase-4 diff review overlay —
 * drops in without being rewritten twice.
 *
 * Three things are true of everything below:
 *
 *  - **Colors come from `styles/tokens.css.ts`, never from a literal.** haklex
 *    ships a neutral/blue palette; ours aliases the app's MUI palette so the
 *    editor's interior cannot drift from the shell around it, and
 *    `npm run check:theme` fails on any `.css.ts` that reintroduces a hex.
 *  - **No `PortalThemeWrapper` / `ColorSchemeContext`.** haklex re-declares its
 *    theme inside every portal because its contract lives on a scoped class.
 *    Ours is `:root` + `html.dark`, so portaled content inherits for free —
 *    that is precisely why the contract has that shape.
 *  - **Base UI 1.7.0.** haklex peers `>=1.5.0`; anywhere the installed version
 *    disagrees with their usage, the note is on the component.
 *
 * Not ported: their three typographic variants (`article`/`note`/`comment`),
 * which are a CJK-publishing feature, and the `code-block`, `checkbox`,
 * `collapsible`, `animated-tabs`, `status-dot`, `viewport-gate` and
 * `quote-attribution` components, which no phase asks for yet.
 */

export { cx } from "./cx";

export type {
  ActionBarProps,
  ActionButtonProps,
  ActionButtonSize,
  ActionButtonVariant,
} from "./action-button";
export {
  ActionBar,
  ActionButton,
  getActionButtonClassName,
} from "./action-button";

export type { AlertProps } from "./alert";
export { Alert } from "./alert";

export type { AutoResizeTextAreaProps } from "./auto-resize-textarea";
export { AutoResizeTextArea } from "./auto-resize-textarea";

export type { BadgeProps } from "./badge";
export { Badge } from "./badge";

export type { ColorPickerProps } from "./color-picker";
export { ColorPicker } from "./color-picker";
export type { HSVA, RGBA } from "./color-picker/color-math";
export {
  hexToHsva,
  hsvaToCss,
  hsvaToHex,
  parseHex,
} from "./color-picker/color-math";

export type {
  ComboboxContentProps,
  ComboboxEmptyProps,
  ComboboxGroupLabelProps,
  ComboboxGroupProps,
  ComboboxInputProps,
  ComboboxItemIndicatorProps,
  ComboboxItemProps,
  ComboboxListProps,
  ComboboxProps,
  ComboboxTriggerProps,
} from "./combobox";
export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
} from "./combobox";

export type {
  DialogBackdropProps,
  DialogBodyProps,
  DialogCloseProps,
  DialogDescriptionProps,
  DialogFooterProps,
  DialogFullScreen,
  DialogHeaderProps,
  DialogPopupProps,
  DialogPortalProps,
  DialogProps,
  DialogSize,
  DialogTitleProps,
  DialogTriggerProps,
} from "./dialog";
export {
  Dialog,
  DialogBackdrop,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export type { SheetProps } from "./dialog/sheet";
export { Sheet } from "./dialog/sheet";

export type {
  DropdownMenuCheckboxItemProps,
  DropdownMenuContentProps,
  DropdownMenuGroupProps,
  DropdownMenuItemProps,
  DropdownMenuLabelProps,
  DropdownMenuProps,
  DropdownMenuRadioGroupProps,
  DropdownMenuRadioItemProps,
  DropdownMenuSeparatorProps,
  DropdownMenuTriggerProps,
} from "./dropdown-menu";
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export type {
  PopoverArrowProps,
  PopoverCloseProps,
  PopoverDescriptionProps,
  PopoverPanelProps,
  PopoverPopupProps,
  PopoverPortalProps,
  PopoverPositionerProps,
  PopoverProps,
  PopoverTitleProps,
  PopoverTriggerProps,
} from "./popover";
export {
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverDescription,
  PopoverPanel,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTitle,
  PopoverTrigger,
} from "./popover";

export type {
  RadioFieldProps,
  RadioGroupLabelProps,
  RadioGroupProps,
  RadioProps,
} from "./radio-group";
export {
  Radio,
  RadioField,
  RadioGroup,
  RadioGroupLabel,
} from "./radio-group";

export type { ScrollAreaProps } from "./scroll-area";
export { ScrollArea } from "./scroll-area";

export type {
  SegmentedControlItem,
  SegmentedControlProps,
} from "./segmented-control";
export { SegmentedControl } from "./segmented-control";

export type {
  SelectContentProps,
  SelectGroupLabelProps,
  SelectGroupProps,
  SelectItemProps,
  SelectProps,
  SelectSeparatorProps,
  SelectTriggerProps,
  SelectValueProps,
} from "./select";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

export type { SpinnerProps } from "./spinner";
export { Spinner } from "./spinner";

export type { SwitchFieldProps, SwitchProps } from "./switch";
export { Switch, SwitchField } from "./switch";

export type {
  FieldLabelTextProps,
  NumberStepperFieldProps,
  StepperButtonProps,
  TextAreaFieldProps,
  TextFieldProps,
} from "./text-field";
export {
  FieldLabelText,
  NumberStepperField,
  StepperButton,
  TextAreaField,
  TextField,
} from "./text-field";

export type {
  TooltipContentProps,
  TooltipPopupProps,
  TooltipPortalProps,
  TooltipPositionerProps,
  TooltipProviderProps,
  TooltipRootProps,
  TooltipTriggerProps,
} from "./tooltip";
export {
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipPopup,
  TooltipPortal,
  TooltipPositioner,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "./tooltip";
