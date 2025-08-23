"use client";
import StoreProvider from "@/store/StoreProvider";
import SideBar from "./SideBar";
import DocumentInfoDrawerArrow from "./DocumentInfoDrawerArrow";
import ScrollTop from "./ScrollTop";
import AlertDialog from "./Alert";
import Announcer from "./Announcer";
import ProgressBar from "./ProgressBar";
import HydrationManager from "./HydrationManager";
import Breadcrumbs from "./Breadcrumbs";
import { Box, Container, Toolbar, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Suspense } from "react";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const sidebarWidth = isMobile ? 0 : 72; // Collapsed sidebar width

  return (
    <>
      <Suspense>
        <ProgressBar />
      </Suspense>
      <StoreProvider>
        <Box sx={{ display: "flex", minHeight: "100vh" }}>
          <SideBar />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              width: { sm: `calc(100% - ${sidebarWidth}px)` },
              ml: { sm: `${sidebarWidth}px` },
              overflow:
                "auto", /* Allow scrolling but scrollbar is hidden by CSS */
              transition: theme.transitions.create([
                "margin",
                "width",
              ], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            }}
          >
            <Toolbar
              id="back-to-top-anchor"
              sx={{
                displayPrint: "none",
                minHeight: "0 !important",
              }}
            />
            <Breadcrumbs />
            <HydrationManager>
              <Container
                className="editor-container"
                id="editor-main-container"
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  mx: "auto", /* Reset to center horizontally */
                  my: 2,
                  flex: 1,
                  position: "relative",
                  overflow:
                    "auto", /* Allow scrolling but scrollbar is hidden by CSS */
                  maxWidth: {
                    xs: "100% !important",
                    sm: "100% !important",
                    md:
                      "2000px !important", /* Increased from 1800px to 2000px */
                    lg:
                      "2000px !important", /* Added larger size for large screens */
                  },
                  px: {
                    xs: 1,
                    sm: 1,
                    md:
                      1, /* Added more horizontal padding for medium screens */
                  }, /* Adjusted horizontal padding */
                }}
              >
                {children}
              </Container>
            </HydrationManager>
          </Box>
          <ScrollTop />
        </Box>
        <AlertDialog />
        <Announcer />
        <DocumentInfoDrawerArrow />
      </StoreProvider>
    </>
  );
};

export default AppLayout;
