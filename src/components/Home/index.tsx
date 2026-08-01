"use client";
import { Box } from "@mui/material";
import { visuallyHidden } from "@mui/utils";

/**
 * The home pane — the default route's center section.
 *
 * Deliberately empty. The composer that used to live here is now the Copilot
 * bar that every route carries (`InlineCopilotBar`), so the pane's one
 * affordance is not the pane's to render: keeping a second copy here is what
 * made two composers that had to be kept in step and never quite were.
 *
 * The empty space is still the design, not a gap waiting to be filled — the
 * pane reads as a blank page with an input at its foot, and the input arrives
 * from the layout.
 */
const Home: React.FC = () => (
  <Box sx={{ flex: 1, minHeight: 0 }}>
    {
      /* The pane shows no heading by design. Screen readers still need one to
        announce the route, so it is present and hidden rather than absent. */
    }
    <Box component="h1" sx={visuallyHidden}>Home</Box>
  </Box>
);

export default Home;
