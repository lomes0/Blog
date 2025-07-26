"use client";
import {
  Box,
  IconButton,
  Paper,
  SwipeableDrawer,
  Typography,
} from "@mui/material";
import { Article, ChevronRight, Close } from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { useEffect, useRef, useState } from "react";
import { alpha } from "@mui/material/styles";

const AppDrawer: React.FC<React.PropsWithChildren<{ title: string }>> = (
  { title, children },
) => {
  const open = useSelector((state) => state.ui.drawer);
  const dispatch = useDispatch();
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const toggleDrawer = () => {
    dispatch(actions.toggleDrawer());
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartX(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && open) {
        const dragDistance = e.clientX - startX;
        // If dragged more than 50px to the right, close the drawer
        if (dragDistance > 50) {
          toggleDrawer();
          setIsDragging(false);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging && open) {
        const dragDistance = e.touches[0].clientX - startX;
        // If dragged more than 50px to the right, close the drawer
        if (dragDistance > 50) {
          toggleDrawer();
          setIsDragging(false);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, open, startX]);

  useEffect(() => {
    return () => {
      dispatch(actions.toggleDrawer(false));
    };
  }, []);

  return (
    <>
      <SwipeableDrawer
        anchor="right"
        open={open}
        onOpen={toggleDrawer}
        onClose={toggleDrawer}
        sx={{ displayPrint: "none" }}
        id="document-info-drawer"
      >
        <Box sx={{ p: 2, width: 300, position: "relative", height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Article sx={{ mr: 1 }} />
            <Typography variant="h6">{title}</Typography>
            <IconButton onClick={toggleDrawer} sx={{ ml: "auto" }}>
              <Close />
            </IconButton>
          </Box>
          {children}

          {/* Drag handle */}
          <Paper
            ref={dragHandleRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onClick={toggleDrawer} // Added onClick handler to close the drawer when clicked
            elevation={0}
            sx={{
              position: "absolute", // Changed back to absolute
              top: "50%",
              left: 0,
              transform: "translate(-50%, -50%)",
              zIndex: 1300,
              cursor: "grab",
              height: 40, // Reduced height from 80 to 40
              width: 12, // Reduced width from 24 to 12
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: 4, // Reduced radius from 8 to 4
              borderBottomLeftRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: (theme) =>
                alpha(theme.palette.primary.main, 0.7), // Reduced opacity from 0.9 to 0.7
              transition: (theme) =>
                theme.transitions.create(
                  ["background-color", "width"],
                  { duration: theme.transitions.duration.shortest }, // Changed from shorter to shortest
                ),
              "&:active": {
                cursor: "grabbing",
              },
              "&:hover": {
                width: 16, // Slightly wider on hover for better visibility
                backgroundColor: (theme) =>
                  alpha(theme.palette.primary.dark, 0.9),
              },
              // Added to ensure the element doesn't disappear
              visibility: "visible",
              pointerEvents: "auto",
            }}
            aria-label="drag to close document info"
          >
            <ChevronRight
              fontSize="small"
              sx={{ color: (theme) => theme.palette.primary.contrastText }}
            />
          </Paper>
        </Box>
      </SwipeableDrawer>
    </>
  );
};

export default AppDrawer;
