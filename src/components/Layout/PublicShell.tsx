"use client";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import RouterLink from "next/link";
import { Moon, Sun } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";
import { ICON_SIZE } from "@/theme/icons";
import useIsHydrated from "@/hooks/useIsHydrated";

/**
 * The chrome every anonymous visitor gets (plan §4.2, §8.1 DECIDED).
 *
 * Deliberately *not* the five-column workspace shell: no Redux store, no
 * sidebar, no Copilot. One render path for everyone, so a shared link looks the
 * same to its author as to a stranger, and the crawled surface stays cheap.
 *
 * The only chrome here is a brand link home and the color-scheme toggle. The
 * toggle is duplicated from `RightRail/SettingsPanel` rather than shared
 * because that panel lives inside the workspace shell — reaching for it would
 * pull the store back in, which is the one thing this surface must not have.
 */
const PublicShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, systemMode, setMode } = useColorScheme();
  // `mode` is undefined until MUI has read the stored preference, so the icon
  // would flip on hydration. Render the button disabled-looking-but-stable
  // until then instead of guessing.
  const hydrated = useIsHydrated();
  const resolved = mode === "system" ? systemMode : mode;
  const isDark = resolved === "dark";

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Box
        component="header"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          minHeight: 48,
          px: { xs: 2, sm: 3 },
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.default",
          position: "sticky",
          top: 0,
          zIndex: 10,
          displayPrint: "none",
        }}
      >
        <Typography
          component={RouterLink}
          href="/"
          prefetch={false}
          variant="subtitle2"
          sx={{
            color: "text.primary",
            textDecoration: "none",
            "&:hover": { color: "primary.main" },
          }}
        >
          Blog
        </Typography>
        <Box sx={{ ml: "auto" }}>
          <Tooltip title={isDark ? "Light mode" : "Dark mode"}>
            <IconButton
              size="small"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setMode(isDark ? "light" : "dark")}
              sx={{ color: "text.secondary" }}
            >
              {hydrated && isDark
                ? <Sun size={ICON_SIZE.dense} />
                : <Moon size={ICON_SIZE.dense} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          width: "100%",
          maxWidth: 1280,
          mx: "auto",
          px: { xs: 1, sm: 2, md: 3 },
          py: { xs: 1, sm: 2 },
          minWidth: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default PublicShell;
