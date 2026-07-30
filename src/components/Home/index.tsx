"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Sparkles } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";
import { useLayoutMode } from "@/contexts/LayoutModeContext";
import { useSelector } from "@/store";
import { askCopilot } from "@/components/CopilotPanel/copilotHandoff";
import HomeComposer from "./HomeComposer";
import SuggestionChips from "./SuggestionChips";
import JumpBackIn from "./JumpBackIn";

/**
 * The home pane — the default route's center section.
 *
 * One primary affordance: a composer that both starts a draft and asks
 * questions of the library. Submitting hands the prompt to the Copilot panel,
 * which owns the conversation; the home pane never renders a response itself.
 * Recents fill the lower third so the route does not read as an empty state.
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

  // A chip fills the composer and puts the caret at the end; the user sends it.
  const handleSuggestion = useCallback((text: string) => {
    setPrompt(text);
    const input = composerRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(text.length, text.length);
  }, []);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        py: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: 2.5,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Sparkles size={ICON_SIZE.dense} />
        </Box>
        <Typography
          component="h1"
          variant="h5"
          sx={{ color: "text.primary", textAlign: "center" }}
        >
          Write something, or ask your posts
        </Typography>
      </Box>

      <HomeComposer
        ref={composerRef}
        value={prompt}
        onChange={setPrompt}
        onSubmit={handleSubmit}
        disabledReason={user ? undefined : "Sign in to use AI"}
      />

      <SuggestionChips onSelect={handleSuggestion} />

      <JumpBackIn />
    </Box>
  );
};

export default Home;
