/**
 * The editor package's UI primitives kit.
 *
 * Ported from haklex `packages/rich-editor-ui` (MIT, github.com/Innei/haklex)
 * per docs/plans/archive/haklex-adoption.md §5, so that their component code — the
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
 *
 * **Most of this directory is unconsumed today, and that is the expected
 * state, not a backlog.** At the end of phase 2, 256 of knip's findings sat
 * under `ui/` — 124 distinct symbols, two thirds of them the `XProps` aliases
 * a wrapper needs in order to be wrapped. They are not dead code by knip's
 * usual meaning: this is a *ported vendor surface*, kept complete on purpose
 * so haklex's phase-3 and phase-4 components compile against it unmodified.
 * Trimming it to what phase 2 happens to call would mean re-porting each piece
 * at the moment it is needed, and re-deriving the Base UI 1.7 adaptations
 * recorded on each component (see `select`, `tooltip`, `combobox`) a second
 * time. Three groups are entirely unconsumed and are the clearest case:
 * `combobox` (nothing in the editor is a searchable select yet), the low-level
 * `Popover*`/`Tooltip*` parts under the `Tooltip` / `ColorPicker` convenience
 * wrappers, and `Sheet` / `ScrollArea` / `ActionBar`.
 *
 * **This file is therefore a knip `entry`** (see `knip.json`), which is how
 * that intent is stated rather than repeated by hand: knip does not report an
 * entry's own exports and treats what it re-exports as consumed, so the kit
 * stops filling the report. Previously the note here said the findings should
 * stay visible instead — that traded 256 hits, none of which anyone would ever
 * action, against catching a primitive that lands and is never called, and the
 * report is the thing that has to stay readable. The trade is narrower than it
 * looks: the exemption is granted by *adding a symbol to this barrel*, so
 * anything under `ui/` this file does not re-export is still reported as rot
 * (`hsvToRgb` in `color-picker/color-math.ts` is the current example), and
 * **`pnpm exec knip --include-entry-exports` returns the whole surface** — 578
 * findings against the default report's 324. So the case the old note was
 * protecting is one flag away rather than gone: run it before porting a
 * component, to see what the kit already carries.
 *
 * Everything *outside* `ui/` gets ordinary treatment: an unused export there
 * is deleted or unexported. `utils/useColorScheme.ts` is the phase-2 example.
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
  DropdownMenuSubProps,
  DropdownMenuSubTriggerProps,
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
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
