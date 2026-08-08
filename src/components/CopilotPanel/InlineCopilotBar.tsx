"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Tooltip } from "@mui/material";
import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSelector } from "@/store";
import { useAIModel } from "@/contexts/AIModelContext";
import { ICON_SIZE } from "@/theme/icons";
import CopilotChat from "./CopilotChat";
import { composerSurfaceSx, composerWrapperSx } from "./Composer";

/**
 * The design handoff's 760px content column, which it says should match the
 * chat thread's width.
 */
const COLUMN_W = "min(760px, 100%)";

/**
 * Cap on the conversation's height. Half the viewport keeps the document behind
 * it readable, which is the whole reason this is not the side panel.
 */
const MAX_H = "50vh";

/**
 * Routes that own their bottom edge, so the bar would either duplicate an
 * affordance or sit on top of one.
 *
 * A deny-list rather than an allow-list on purpose: the bar is meant to be
 * everywhere by default, and a route added next month should get it without
 * anyone remembering to opt in.
 */
/**
 * Height to keep clear at the foot of the scrolling content, so the last lines
 * of a document can be scrolled out from under the resting bar.
 *
 * "Floats over content" is about the *middle* of a document passing beneath it;
 * the end still has to be reachable. Sized for the bar at rest — 6px of surface
 * padding either side of the 34px control row, the 1px border, and the
 * wrapper's 16px bottom padding, rounded up for slack.
 *
 * Deliberately *not* sized for the focused bar, which is ~68px taller: that
 * state only exists while someone is typing in it, and reserving for it left
 * every page carrying the gap permanently. Focusing can cover the last line or
 * two; blurring gives it straight back.
 */
export const INLINE_BAR_CLEARANCE = 72;

const EXCLUDED_ROUTES = [
  // Reading surfaces with nothing for the agent to act on.
  "/privacy",
];

/**
 * Whether the bar renders on `pathname`. Exported because the layout has to
 * reserve {@link INLINE_BAR_CLEARANCE} on exactly the routes that show it, and
 * two lists that had to agree would eventually stop agreeing.
 */
export const hasInlineCopilotBar = (pathname: string): boolean =>
  !EXCLUDED_ROUTES.includes(pathname);

interface InlineCopilotBarProps {
  /**
   * The document in scope, or `null` on a route with none — the same value the
   * side panel gets, derived once in `AppLayoutContent`.
   */
  documentId: string | null;
}

/**
 * The bottom-anchored Copilot bar: a composer floating at the foot of the
 * content column that grows upward into a conversation.
 *
 * Deliberately *not* a hand-off to the side panel (the home pane's composer is
 * that). This renders its own chat so the answer arrives over the document you
 * are reading, without giving up the column the panel would take.
 *
 * Its thread is a scratch thread: in-memory only, and cleared whenever the
 * route or document changes — the panel remains the only writer of
 * `copilotStorage`, so the two surfaces can never disagree about history.
 */
const InlineCopilotBar: React.FC<InlineCopilotBarProps> = ({ documentId }) => {
  const pathname = usePathname();
  const user = useSelector((state) => state.user);
  const { llm: llmConfig, setLlm: setLlmConfig } = useAIModel();

  const [collapsed, setCollapsed] = useState(false);
  // Drives the composer's size. At rest the bar is a single row; taking focus
  // grows it to the full two-row composer, and losing focus gives the space
  // straight back — typed text is kept, just clipped to one line until you
  // return to it.
  const [focused, setFocused] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const acceptAllRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The scratch thread is scoped to one visit to one document. Remounting on
  // that key is what "cleared on navigation" means — there is no thread to
  // clear, because a new one is built.
  const scopeKey = `${pathname}:${documentId ?? "workspace"}`;

  useEffect(() => {
    setCollapsed(false);
    setFocused(false);
    setMessageCount(0);
    setPendingCount(0);
  }, [scopeKey]);

  // On the home pane the bar is the route's one affordance, so it takes focus
  // on arrival — but only if nothing else has claimed it, so a keyboard path
  // into another surface (⌘K, the sidebar) is not yanked back here. Behaviour
  // inherited from the composer this replaced.
  useEffect(() => {
    if (pathname !== "/") return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    inputRef.current?.focus();
  }, [pathname]);

  // ⌘/ focuses the bar. ⌘K is the command palette, ⌘I is italic in the editor
  // and ⌘A is select-all in the posts list; `/` is also what opens the bar's
  // own slash commands, so the chord reads as "go to the place slashes work".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setCollapsed(false);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const handleRegisterAcceptAll = useCallback((fn: () => void) => {
    acceptAllRef.current = fn;
  }, []);

  // Escape gets the bar out of the way: back to the resting strip, and back to
  // the composer alone if a transcript is open. Blurring is what shrinks it —
  // `focused` follows the DOM rather than being set here. The chat's own
  // composer takes Escape first while its slash menu is open, so this only
  // fires when nothing nearer has a use for it.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (messageCount > 0) setCollapsed(true);
    (e.target as HTMLElement).blur();
  };

  // focusin/focusout, so this covers the field and every control in the card.
  // The relatedTarget check is what keeps tabbing *between* those controls from
  // reading as leaving — without it, moving from the field to the send button
  // would shrink the bar out from under the pointer.
  const handleBlur = (e: React.FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setFocused(false);
  };

  if (!hasInlineCopilotBar(pathname)) return null;

  const expanded = messageCount > 0 && !collapsed;

  return (
    <Box
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        px: 2,
        pb: 2,
        // The wrapper spans the column but must not swallow clicks on the
        // document behind it; only the card itself is interactive.
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {
        /* The card is the composer's 1px border. A plain Box, not a Paper:
          Paper's root sets its own background and radius, and this element is
          nothing but a rule around the surface below. */
      }
      <Box
        onKeyDown={handleKeyDown}
        // Collapsed, a thread is invisible — the bar looks like an empty
        // composer. Returning to it brings it back, so Escape means "out of my
        // way" rather than "throw that away".
        onFocus={() => {
          setCollapsed(false);
          setFocused(true);
        }}
        onBlur={handleBlur}
        sx={(theme) => ({
          ...composerWrapperSx(theme),
          pointerEvents: "auto",
          width: COLUMN_W,
          // Always capped. `none` → a length is not an animatable pair, so the
          // old conditional could never have eased anything; the card grows
          // with its content and stops here.
          maxHeight: MAX_H,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        })}
      >
        {
          /* The surface. It holds the transcript as well as the composer,
            which is why the inline bar draws it rather than `CopilotChat`. */
        }
        <Box
          sx={(theme) => ({
            // Tight padding only when the surface *is* the resting strip. With
            // a transcript above the composer it goes back to the handoff's
            // metrics, which are what the messages need to breathe.
            ...composerSurfaceSx(theme, !focused && !expanded),
            minHeight: 0,
            overflow: "hidden",
          })}
        >
          {expanded && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                flexShrink: 0,
              }}
            >
              <Box sx={{ flex: 1 }} />
              {pendingCount > 0 && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => acceptAllRef.current?.()}
                  sx={{
                    textTransform: "none",
                    typography: "micro",
                    py: 0.25,
                    px: 1,
                    flexShrink: 0,
                  }}
                >
                  Accept all
                </Button>
              )}
              <Tooltip title="Collapse (Esc)">
                <IconButton
                  size="small"
                  onClick={() => setCollapsed(true)}
                  aria-label="Collapse Copilot"
                >
                  <ChevronDown size={ICON_SIZE.dense} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          <CopilotChat
            key={scopeKey}
            variant="inline"
            persist={false}
            documentId={documentId}
            llmConfig={llmConfig}
            setLlmConfig={setLlmConfig}
            onRegisterAcceptAll={handleRegisterAcceptAll}
            onPendingCountChange={setPendingCount}
            onMessageCountChange={setMessageCount}
            showTranscript={expanded}
            compactComposer={!focused}
            inputRef={inputRef}
            disabledReason={user ? undefined : "Sign in to use AI"}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default InlineCopilotBar;
