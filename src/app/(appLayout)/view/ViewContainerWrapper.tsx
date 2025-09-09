"use client";
import { useSidebarState } from "@/components/Layout/SideBar/hooks/useSidebarState";
import { Box, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export default function ViewContainerWrapper(
  { children }: { children: React.ReactNode },
) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { open } = useSidebarState();

  // Calculate sidebar width dynamically
  const sidebarWidth = isMobile ? 0 : (open ? 240 : 72);

  // Calculate the offset needed to center content relative to the full viewport
  // We need to shift the content left by half the sidebar width to achieve true centering
  const centerOffset = sidebarWidth;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: {
          xs: "100%",
          sm: "calc(100% - 32px)",
          md: "800px", // Fixed max width for better reading experience
          lg: "900px",
          xl: "1000px",
        },
        // Dynamic centering that accounts for sidebar width
        mx: "auto",
        // On desktop, shift content left by half the sidebar width to achieve true screen centering
        marginLeft: {
          xs: "auto", // Mobile: normal centering (no sidebar)
          sm: isMobile ? "auto" : `calc(33% - ${centerOffset}px)`,
        },
        marginRight: "auto",
        px: {
          xs: 0, // Let the parent AppLayout handle padding
          sm: 0,
          md: 0,
        },
        // Smooth transition when sidebar toggles
        transition: theme.transitions.create([
          "margin-left",
          "max-width",
        ], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.leavingScreen,
        }),
      }}
    >
      {children}
    </Box>
  );
}
