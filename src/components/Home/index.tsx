"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { useSelector } from "@/store";
import { askCopilot } from "@/components/CopilotPanel/copilotHandoff";
import HomeComposer from "./HomeComposer";

/**
 * The home pane — the default route's center section.
 *
 * One affordance and nothing else: a composer that both starts a draft and asks
 * questions of the library. Submitting hands the prompt to the Copilot panel,
 * which owns the conversation; the home pane never renders a response itself.
 *
 * The empty space above the composer is the design, not a gap waiting to be
 * filled — the pane reads as a blank page with an input at its foot.
 */
const Home: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { setCopilotOpen } = useLayoutMode();
  const user = useSelector((state) => state.user);

  const handleSubmit = useCallback(() => {
    const text = prompt.trim();
    if (!text || !user) return;
    setPrompt("");
    setCopilotOpen(true);
    askCopilot(text);
  }, [prompt, setCopilotOpen, user]);

  // The composer is the route's one affordance, so it takes focus on arrival —
  // but only if nothing else has claimed it, so a keyboard path into another
  // surface (⌘K, the sidebar) is not yanked back here.
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    composerRef.current?.focus();
  }, []);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        py: 2,
      }}
    >
      {
        /* The pane shows no heading by design. Screen readers still need one to
          announce the route, so it is present and hidden rather than absent. */
      }
      <Box component="h1" sx={visuallyHidden}>Home</Box>

      <HomeComposer
        ref={composerRef}
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleSubmit}
        disabledReason={user ? undefined : "Sign in to use AI"}
      />
    </Box>
  );
};

export default Home;
