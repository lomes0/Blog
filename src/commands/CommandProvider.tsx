"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useColorScheme } from "@mui/material/styles";
import { type RootState, useDispatch, useSelector } from "@/store";
import {
  selectFocusedDocId,
  selectFocusedDocMode,
} from "@/store/selectors/layoutSelectors";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { type CommandContext, type RunCommand, runCommand } from "./types";

/**
 * Two contexts, not one, and the split is the point.
 *
 * `run` never changes identity, so a component that only *acts* — every menu
 * item, row and button in the app — subscribes to nothing and re-renders for
 * nothing. The context object underneath it changes on every navigation, theme
 * flip and Copilot toggle; only components that *read* it (the palette, for its
 * labels) should pay for that. Merging the two would put every memoised list row
 * on the Copilot's re-render path.
 */
const CommandRunContext = createContext<RunCommand | undefined>(undefined);
const CommandStateContext = createContext<CommandContext | undefined>(
  undefined,
);

/**
 * Builds a {@link CommandContext} out of the ambient React state and hands the
 * app a `run` bound to it.
 *
 * Must sit inside the store, the color-scheme provider and `LayoutModeProvider`
 * — see `components/Layout/AppLayout.tsx`, which is the only mount.
 */
export const CommandProvider: React.FC<{ children: React.ReactNode }> = (
  { children },
) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.user);
  const { mode, systemMode, setMode } = useColorScheme();
  const { copilotOpen, setCopilotOpen } = useLayoutMode();

  // Phase 1 parsed both of these out of the pathname and said the swap would be
  // a one-file change. It was — the values move, the context does not.
  const focusedDocumentId = useSelector(selectFocusedDocId);
  const focusedDocumentMode = useSelector(selectFocusedDocMode);
  const resolvedScheme = mode === "system" ? systemMode : mode;

  const context = useMemo<CommandContext>(() => ({
    dispatch,
    user,
    router,
    focusedDocumentId,
    focusedDocumentMode,
    theme: { resolved: resolvedScheme, set: setMode },
    copilot: { open: copilotOpen, setOpen: setCopilotOpen },
  }), [
    dispatch,
    user,
    router,
    focusedDocumentId,
    focusedDocumentMode,
    resolvedScheme,
    setMode,
    copilotOpen,
    setCopilotOpen,
  ]);

  // `run` reads the context through a ref so its own identity can be constant
  // for the life of the app — see the note on the two contexts above. Call sites
  // also put it in `useCallback` dependency lists, where a changing `run` would
  // invalidate every memoised handler in the tree.
  const contextRef = useRef(context);
  contextRef.current = context;

  const run = useCallback<RunCommand>(
    (command, ...args) => runCommand(command, contextRef.current, ...args),
    [],
  );

  return (
    <CommandRunContext.Provider value={run}>
      <CommandStateContext.Provider value={context}>
        {children}
      </CommandStateContext.Provider>
    </CommandRunContext.Provider>
  );
};

/** Run commands. Subscribes to nothing — prefer this wherever you only act. */
export const useCommandRun = (): RunCommand => {
  const run = useContext(CommandRunContext);
  if (!run) {
    throw new Error("useCommandRun must be used within CommandProvider");
  }
  return run;
};

/**
 * Read what a command *would* act on — which document is focused, in which
 * mode, which theme is painted. Re-renders whenever any of that changes, so
 * reach for {@link useCommandRun} unless you need the values themselves.
 */
export const useCommandContext = (): CommandContext => {
  const context = useContext(CommandStateContext);
  if (!context) {
    throw new Error("useCommandContext must be used within CommandProvider");
  }
  return context;
};
