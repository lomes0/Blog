"use client";
import { useState } from "react";
import {
  Box,
  ButtonBase,
  IconButton,
  InputBase,
  Menu,
  MenuItem,
  Paper,
  Popper,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, type Theme } from "@mui/material/styles";
import type { SystemStyleObject } from "@mui/system";
import { ArrowUp, ChevronDown, Mic, Plus, Square } from "lucide-react";
import { AI_MODELS } from "@/lib/ai/models";
import type { AIModel } from "@/lib/ai/types";
import { MONO_FONT } from "@/components/Layout/SideBar/constants";
import { ICON_SIZE } from "@/theme/icons";
import { FOCUS_RING, MOTION, SHADOW } from "@/theme/tokens";
import type { SlashCommand } from "./slashCommands";

/**
 * Metrics from the AI-composer design handoff (option 1a; the bundle is no
 * longer in the repo). Kept verbatim because it was high-fidelity: "all
 * colors, type sizes, radii, spacing, and shadows are final".
 *
 * Radii are the one place this knowingly leaves DESIGN.md §5's ladder
 * (4/6/8/10/12) — 9px icon buttons, a 17px surface inside an 18px border, a
 * 13px popover. They are written as px strings rather than `sx` numbers on
 * purpose: a bare `borderRadius` number is a ×4 multiple, which is exactly the
 * trap §5 documents.
 *
 * Colors are *not* verbatim. The handoff is a dark-only mock with literal
 * hexes; this app is scheme-aware and `npm run check:theme` enforces that, so
 * each of its tokens is mapped onto the palette (surface → `background.input`,
 * hover → `action.hover`, hint → `text.disabled`, accent → `primary`).
 */
const C = {
  wrapperRadius: "18px",
  surfaceRadius: "17px",
  /** Bottom is tighter: the 32px icon buttons carry their own optical padding. */
  surfacePadding: "14px 14px 10px",
  /** Field ↔ control row. */
  surfaceGap: 1.25, // 10px
  /** Aligns the caret with the toolbar glyphs rather than their hit boxes. */
  fieldPadding: "4px 6px 0",
  controlGap: 0.75, // 6px
  toolButton: 32,
  toolRadius: "9px",
  /** 2px larger than the tool buttons, so it reads as the primary action. */
  sendButton: 34,
  sendRadius: "10px",
  menuWidth: 268,
  menuRadius: "13px",
  /** ~7 rows at 16px/1.55, the handoff's 180px cap. */
  maxRows: 7,
  minRows: 2,
  /**
   * Idle metrics. The composer at rest is one row — the field sits *between*
   * the tool buttons and the model/send controls rather than above them, so
   * the whole thing is a 34px control row inside 6px of padding.
   *
   * Not from the handoff, which only ever drew the active state. The radii and
   * colours are unchanged; this trades the field's second row and the surface's
   * generous top padding for the ~68px of document it was covering while
   * nobody was typing.
   */
  compactSurfacePadding: "6px",
  /** No top bias to correct: a single row is centred against the glyphs. */
  compactFieldPadding: "0 6px",
} as const;

/** Brand colors — literal by nature, and the one thing the dot actually says. */
const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#D97757",
  google: "#4285F4",
  azure: "#0078D4",
  ollama: "#888888",
};

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic",
  google: "Google",
  azure: "Azure OpenAI",
  ollama: "Ollama",
};

/** The menu's second line. Derived from the model list, not written twice. */
const modelNote = (model: AIModel): string => {
  const provider = PROVIDER_LABEL[model.provider] ?? model.provider;
  const traits = [
    model.metadata?.fast ? "fast" : null,
    model.metadata?.reason ? "reasoning" : null,
  ].filter(Boolean);
  return traits.length ? `${provider} · ${traits.join(", ")}` : provider;
};

/**
 * Outer wrapper — the composer's border. Wraps whatever draws the surface, so
 * the inline bar (whose card holds a transcript above the composer) and the
 * panel (where the composer is alone) can both use it.
 *
 * A flat `divider` rule, not the handoff's padded top-lit gradient: by request,
 * this box borders like every other container in the app rather than carrying
 * its own lit edge. The geometry is the gradient's — a 1px border insets the
 * surface exactly as the 1px padding did, so the 18px outer / 17px inner radii
 * still meet.
 */
export const composerWrapperSx = (
  theme: Theme,
): SystemStyleObject<Theme> => ({
  borderRadius: C.wrapperRadius,
  border: "1px solid",
  borderColor: "divider",
  transition: `border-color ${MOTION.fast}ms, box-shadow ${MOTION.fast}ms`,
  // Focused, the rule goes accent and picks up the §10 card ring — this is what
  // says "you are typing here".
  //
  // `FOCUS_RING.card(theme)` by preference: it is the ring the composer carried
  // before the design-handoff rebuild, and it was the one asked for back. Note
  // that the helper runs `alpha()` over a palette value, so under CSS variables
  // the light scheme's indigo is baked into both schemes — the dark ring is the
  // *light* accent at 25%, not the lifted dark `primary.main`. That is the look
  // being kept, so do not "fix" it here to the channel variable (DESIGN.md §2)
  // without asking; it is the only difference the swap makes.
  "&:focus-within": {
    borderColor: "primary.main",
    boxShadow: FOCUS_RING.card(theme),
  },
});

/**
 * Inner surface — the field's own colour, its radius, padding and lift.
 *
 * `compact` is the idle inline bar, where the surface wraps a single control
 * row and the handoff's 14px top padding would be most of the bar's height.
 * Defaults to false, which is also what MUI passes when this is handed to `sx`
 * as a bare function.
 */
export const composerSurfaceSx = (
  theme: Theme,
  compact = false,
): SystemStyleObject<Theme> => ({
  bgcolor: "background.input",
  borderRadius: C.surfaceRadius,
  p: compact ? C.compactSurfacePadding : C.surfacePadding,
  display: "flex",
  flexDirection: "column",
  gap: C.surfaceGap,
  boxShadow: SHADOW.floating.light,
  ...theme.applyStyles("dark", { boxShadow: SHADOW.floating.dark }),
});

/** Attach · `/` · `@` · voice — 32px, transparent until hovered. */
const toolButtonSx = {
  width: C.toolButton,
  height: C.toolButton,
  p: 0,
  borderRadius: C.toolRadius,
  color: "text.secondary",
  transition: `background-color ${MOTION.fast}ms, color ${MOTION.fast}ms`,
  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
  "&:focus-visible": { outline: "none", boxShadow: FOCUS_RING.chrome },
  "&.Mui-disabled": { color: "text.disabled" },
} as const;

/** `/` and `@` are mono glyphs, not icons — they are what the user types. */
const glyphSx = {
  ...toolButtonSx,
  fontFamily: MONO_FONT,
  typography: "body2",
  fontWeight: 500,
  lineHeight: 1,
} as const;

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  /** Streaming — swaps send for stop in the same 34px footprint. */
  busy: boolean;
  canSend: boolean;
  placeholder: string;
  /**
   * Idle form: one row, field inline between the tools and the send button.
   * The caller drives this off focus, so the roomy two-row form only exists
   * while someone is actually typing in it.
   */
  compact?: boolean;
  /**
   * Shown instead of {@link placeholder} when compact. The full one names the
   * open document, which does not fit a row that also holds six controls.
   */
  compactPlaceholder?: string;
  /** Disables every control and replaces the model picker with this text. */
  disabledReason?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  llmConfig: { provider: string; model: string };
  setLlmConfig: (config: { provider: string; model: string }) => void;
  slashOpen: boolean;
  slashMatches: SlashCommand[];
  onPickSlash: (command: SlashCommand) => void;
}

/**
 * The composer body: the field, its toolbar, the model picker and send/stop.
 *
 * Draws no surface of its own — the caller wraps it in
 * {@link composerWrapperSx} + {@link composerSurfaceSx}, because the inline bar
 * needs a transcript inside that same surface and the panel does not.
 *
 * Has two forms. Compact is one row and is what the inline bar shows at rest;
 * the full form adds the field's second row and moves the controls below it,
 * and is what the panel always shows.
 *
 * The attach and voice buttons are the handoff's toolbar as specified; only `/`
 * is wired, since slash commands are the one feature behind them that exists
 * today. The `@` mention button is gone — it seeded a character no tool reads,
 * and the compact row has no width to spend on it.
 */
const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onKeyDown,
  onSend,
  onStop,
  busy,
  canSend,
  placeholder,
  compact = false,
  compactPlaceholder,
  disabledReason,
  inputRef,
  llmConfig,
  setLlmConfig,
  slashOpen,
  slashMatches,
  onPickSlash,
}) => {
  // State rather than a ref: the slash Popper needs a re-render once the
  // element it anchors to exists.
  const [fieldEl, setFieldEl] = useState<HTMLElement | null>(null);
  const [modelMenuAnchor, setModelMenuAnchor] = useState<null | HTMLElement>(
    null,
  );

  const disabled = Boolean(disabledReason);
  const currentModel = AI_MODELS.find((m) => m.id === llmConfig.model);
  const providerColor = PROVIDER_COLOR[llmConfig.provider] ?? "#888";

  // The model menu is portalled, so opening it moves focus out of the card and
  // the caller — which reads compactness off focus — asks to shrink. Refusing
  // here rather than reporting the menu upward keeps the menu's own anchor from
  // sliding out from under it, and keeps that entire concern in this file.
  const isCompact = compact && !modelMenuAnchor;

  /** Types a character into the field, as if the user had. */
  const seed = (char: string) => {
    onChange(value ? `${value}${char}` : char);
    (fieldEl?.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
  };

  const dotSx = (color: string, halo: boolean) => ({
    width: 7,
    height: 7,
    borderRadius: "99px",
    bgcolor: color,
    flexShrink: 0,
    display: "inline-block",
    ...(halo ? { boxShadow: `0 0 0 3px ${alpha(color, 0.15)}` } : {}),
  });

  const field = (
    <Box
      ref={setFieldEl}
      sx={{
        p: isCompact ? C.compactFieldPadding : C.fieldPadding,
        // Compact, the field is the row's only elastic element; `minWidth: 0`
        // is what lets it actually give way instead of forcing the controls
        // past the card's edge.
        ...(isCompact ? { flex: 1, minWidth: 0 } : null),
      }}
    >
      <InputBase
        inputRef={inputRef}
        multiline
        minRows={isCompact ? 1 : C.minRows}
        maxRows={isCompact ? 1 : C.maxRows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy || disabled}
        placeholder={isCompact ? compactPlaceholder ?? placeholder : placeholder}
        inputProps={{ "aria-label": "Message Copilot" }}
        sx={{
          p: 0,
          width: "100%",
          typography: "body1",
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
          color: "text.primary",
          "& textarea::placeholder": {
            color: "text.disabled",
            opacity: 1,
          },
        }}
      />
    </Box>
  );

  const attachButton = (
    <Tooltip title="Attach files">
      <span>
        <IconButton
          disabled={disabled}
          aria-label="Attach files"
          sx={toolButtonSx}
        >
          <Plus size={ICON_SIZE.dense} />
        </IconButton>
      </span>
    </Tooltip>
  );

  const slashButton = (
    <Tooltip title="Slash commands">
      <span>
        <IconButton
          disabled={disabled || busy}
          onClick={() => seed("/")}
          aria-label="Slash commands"
          sx={glyphSx}
        >
          /
        </IconButton>
      </span>
    </Tooltip>
  );

  const micButton = (
    <Tooltip title="Voice input">
      <span>
        <IconButton
          disabled={disabled}
          aria-label="Voice input"
          sx={toolButtonSx}
        >
          <Mic size={ICON_SIZE.dense} />
        </IconButton>
      </span>
    </Tooltip>
  );

  // Compact drops the model's *name*, not the control: the provider dot and
  // chevron still say which family is answering and still open the menu, and
  // the accessible name is unchanged either way.
  const modelControl = disabledReason
    ? (
      <Typography variant="micro" color="text.secondary" sx={{ px: 0.5 }}>
        {disabledReason}
      </Typography>
    )
    : (
      <ButtonBase
        onClick={(e) => setModelMenuAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={Boolean(modelMenuAnchor)}
        aria-label={`Model: ${
          currentModel?.name ?? llmConfig.model
        }. Change model`}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          height: C.toolButton,
          pl: isCompact ? "8px" : "10px",
          pr: isCompact ? "7px" : "9px",
          borderRadius: C.toolRadius,
          color: "text.secondary",
          typography: "dense",
          fontWeight: 500,
          whiteSpace: "nowrap",
          flexShrink: 0,
          transition:
            `background-color ${MOTION.fast}ms, color ${MOTION.fast}ms`,
          "&:hover": { bgcolor: "action.hover", color: "text.primary" },
          "&:focus-visible": {
            outline: "none",
            boxShadow: FOCUS_RING.chrome,
          },
        }}
      >
        <Box component="span" sx={dotSx(providerColor, true)} />
        {!isCompact && (currentModel?.name ?? llmConfig.model)}
        <ChevronDown
          size={ICON_SIZE.micro}
          style={{ opacity: 0.6, flexShrink: 0 }}
        />
      </ButtonBase>
    );

  const modelMenu = (
    <Menu
      anchorEl={modelMenuAnchor}
      open={Boolean(modelMenuAnchor)}
      onClose={() => setModelMenuAnchor(null)}
      anchorOrigin={{ vertical: "top", horizontal: "left" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      // The handoff's popover metrics. §17.4 says a menu needs no paper
      // blob; these two values are the exception it earns by being spec'd.
      slotProps={{
        paper: { sx: { width: C.menuWidth, borderRadius: C.menuRadius } },
        list: { sx: { p: 0.75 } },
      }}
    >
      {AI_MODELS.map((m) => (
        <MenuItem
          key={m.id}
          role="menuitemradio"
          aria-checked={m.id === llmConfig.model}
          selected={m.id === llmConfig.model}
          onClick={() => {
            setLlmConfig({ provider: m.provider, model: m.id });
            setModelMenuAnchor(null);
          }}
          sx={{
            gap: 1.25,
            px: 1.25,
            py: 1.125,
            borderRadius: C.toolRadius,
            alignItems: "center",
          }}
        >
          <Box
            component="span"
            sx={dotSx(PROVIDER_COLOR[m.provider] ?? "#888", false)}
          />
          <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <Typography variant="dense" sx={{ fontWeight: 500 }}>
              {m.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {modelNote(m)}
            </Typography>
          </Box>
        </MenuItem>
      ))}
    </Menu>
  );

  const sendSizeSx = {
    width: C.sendButton,
    height: C.sendButton,
    p: 0,
    borderRadius: C.sendRadius,
    flexShrink: 0,
  } as const;

  const sendButton = busy
    ? (
      <Tooltip title="Stop">
        <IconButton
          onClick={onStop}
          aria-label="Stop generating"
          sx={{
            ...sendSizeSx,
            bgcolor: "action.selected",
            color: "text.primary",
            transition: `background-color ${MOTION.fast}ms`,
            "&:hover": { bgcolor: "action.focus" },
            "&:focus-visible": {
              outline: "none",
              boxShadow: FOCUS_RING.chrome,
            },
          }}
        >
          <Square size={ICON_SIZE.inline} fill="currentColor" />
        </IconButton>
      </Tooltip>
    )
    : (
      <IconButton
        onClick={onSend}
        disabled={!canSend}
        aria-label="Send"
        sx={{
          ...sendSizeSx,
          bgcolor: "primary.main",
          color: "primary.contrastText",
          boxShadow:
            "0 6px 16px -6px rgba(var(--mui-palette-primary-mainChannel) / 0.8)",
          transition: `background-color ${MOTION.fast}ms`,
          "&:hover": { bgcolor: "primary.dark" },
          "&:focus-visible": {
            outline: "none",
            boxShadow: FOCUS_RING.chrome,
          },
          // Dimmed rather than recoloured, so the row keeps its shape
          // when there is nothing to send.
          "&.Mui-disabled": {
            bgcolor: "primary.main",
            color: "primary.contrastText",
            opacity: 0.45,
            boxShadow: "none",
            cursor: "default",
          },
        }}
      >
        <ArrowUp size={ICON_SIZE.dense} />
      </IconButton>
    );

  const slashPopper = (
    <>
      {
        /* Anchored to the field and portalled, so it is not clipped by the
          inline bar's rounded card the way an absolutely-positioned child
          was. */
      }
      <Popper
        open={slashOpen}
        anchorEl={fieldEl}
        placement="top-start"
        // Portalled to `body`, so it needs a z-index that clears the app shell
        // rather than one scoped to the composer.
        sx={(theme) => ({ zIndex: theme.zIndex.modal })}
        style={{ width: fieldEl?.offsetWidth }}
      >
        <Paper
          elevation={3}
          sx={{
            py: 0.75,
            mb: 1,
            maxHeight: 220,
            overflowY: "auto",
            borderRadius: C.menuRadius,
          }}
        >
          {slashMatches.map((cmd, idx) => (
            <Box
              key={cmd.command}
              onClick={() => onPickSlash(cmd)}
              sx={{
                mx: 0.75,
                px: 1.25,
                py: 1,
                borderRadius: C.toolRadius,
                cursor: "pointer",
                bgcolor: idx === 0 ? "action.hover" : "transparent",
                "&:hover": { bgcolor: "action.selected" },
              }}
            >
              <Typography
                variant="dense"
                component="p"
                sx={{ fontWeight: 500, fontFamily: MONO_FONT }}
              >
                {cmd.command}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {cmd.description}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Popper>
    </>
  );

  // Full form: the field owns a line, the controls sit beneath it separated
  // into content tools and model context.
  const stackedControls = (
    <Box sx={{ display: "flex", alignItems: "center", gap: C.controlGap }}>
      {attachButton}
      {slashButton}

      {/* Separates the content tools from the model context. */}
      <Box
        sx={{
          width: "1px",
          height: 20,
          bgcolor: "divider",
          mx: 0.5,
          flexShrink: 0,
        }}
      />

      {modelControl}
      {modelMenu}

      <Box sx={{ flex: 1 }} />

      {micButton}
      {sendButton}
    </Box>
  );

  return (
    // Its own flex container rather than a fragment: inline, the surface's
    // children are the transcript *and* this, so the gap between the field and
    // whatever follows it has to belong here.
    //
    // Compact collapses that column into a single row — the same six controls,
    // with the field wedged between them rather than stacked above. No divider
    // and no spacer: the elastic field already separates the two groups.
    <Box
      sx={{
        display: "flex",
        flexShrink: 0,
        ...(isCompact
          ? {
            flexDirection: "row",
            alignItems: "center",
            gap: C.controlGap,
          }
          : { flexDirection: "column", gap: C.surfaceGap }),
      }}
    >
      {isCompact
        ? (
          <>
            {attachButton}
            {slashButton}
            {field}
            {slashPopper}
            {modelControl}
            {modelMenu}
            {micButton}
            {sendButton}
          </>
        )
        : (
          <>
            {field}
            {slashPopper}
            {stackedControls}
          </>
        )}
    </Box>
  );
};

export default Composer;
