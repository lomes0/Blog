"use client";
import { actions, useDispatch, useSelector } from "@/store";
import { Paper } from "@mui/material";
import { ChevronLeft } from "@mui/icons-material";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { alpha } from "@mui/material/styles";

const DocumentInfoDrawerArrow: React.FC = () => {
  const dispatch = useDispatch(); const pathname = usePathname();
  const drawerOpen = useSelector((state) => state.ui.drawer);

  // Only show the arrow in edit or view modes
  const showArrow = !!["/edit", "/view"].find((path) =>
    pathname.startsWith(path)
  );

  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const arrowRef = useRef<HTMLDivElement>(null);

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
      if (isDragging) {
        const dragDistance = startX - e.clientX;
        // If dragged more than 50px to the left, open the drawer
        if (dragDistance > 50 && !drawerOpen) {
          toggleDrawer();
          setIsDragging(false);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging) {
        const dragDistance = startX - e.touches[0].clientX;
        // If dragged more than 50px to the left, open the drawer
        if (dragDistance > 50 && !drawerOpen) {
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
  }, [isDragging, drawerOpen, startX]);

  if (!showArrow) {
    return null;
  }

  return (
    <Paper
      ref={arrowRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={toggleDrawer}
      elevation={3}
      sx={{
        position: "fixed",
        top: "50%",
        right: 0,
        transform: "translateY(-50%)",
        zIndex: 1200,
        cursor: "pointer",
        height: 40, // Reduced height from 80 to 40
        width: 22, // Increased from 12 to fix icon squashing
        borderTopLeftRadius: 4, // Reduced radius from 8 to 4
        borderBottomLeftRadius: 4,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: (theme) =>
          drawerOpen
            ? alpha(theme.palette.primary.main, 0.7) // Reduced opacity from 0.9 to 0.7
            : alpha(theme.palette.background.paper, 0.5), // Reduced opacity from 0.9 to 0.5
        transition: (theme) =>
          theme.transitions.create(
            ["background-color", "width"],
            { duration: theme.transitions.duration.shorter },
          ),
        "&:hover": {
          width: 32, // Slightly wider on hover for better visibility
          backgroundColor: (theme) =>
            drawerOpen
              ? alpha(theme.palette.primary.dark, 0.9)
              : alpha(theme.palette.action.hover, 0.7),
        },
        displayPrint: "none",
      }}
      aria-label="document info"
    >
      <ChevronLeft
        fontSize="medium" // Changed from "small" to "medium" for better visibility
        sx={{
          color: (theme) =>
            drawerOpen
              ? theme.palette.primary.contrastText
              : alpha(theme.palette.text.primary, 0.6), // Reduced opacity for text
          transform: drawerOpen ? "rotate(180deg)" : "none",
          transition: (theme) =>
            theme.transitions.create(
              ["transform"],
              { duration: theme.transitions.duration.standard },
            ),
        }}
      />
    </Paper>
  );
};

export default DocumentInfoDrawerArrow;
