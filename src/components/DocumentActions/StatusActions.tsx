"use client";
import React from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  CheckCircle,
  PlayArrow,
  RadioButtonUnchecked,
} from "@mui/icons-material";
import { actions, useDispatch } from "@/store";
import { DocumentStatus, UserDocument } from "@/types";
import useOnlineStatus from "@/hooks/useOnlineStatus";

interface StatusActionsProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}

const StatusActions: React.FC<StatusActionsProps> = ({
  userDocument,
  variant = "menuitem",
  closeMenu,
}) => {
  const dispatch = useDispatch();
  const isOnline = useOnlineStatus();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const document = cloudDocument || localDocument;
  const currentStatus = document?.status || DocumentStatus.ACTIVE;
  const isAuthor = cloudDocument ? cloudDocument.author : true;

  // Only show status actions if user is the author
  if (!isAuthor) {
    return null;
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (variant === "iconbutton") {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const updateStatus = async (newStatus: DocumentStatus) => {
    handleClose();
    if (closeMenu) closeMenu();

    try {
      // Update both local and cloud documents if they exist
      if (localDocument) {
        await dispatch(actions.updateLocalDocument({
          id: userDocument.id,
          partial: { status: newStatus },
        }));
      }

      if (cloudDocument && isOnline) {
        // Update cloud document only if online
        await dispatch(actions.updateCloudDocument({
          id: userDocument.id,
          partial: { status: newStatus },
        }));
      } else if (cloudDocument && !isOnline) {
        // Show warning if trying to update cloud document while offline
        dispatch(actions.announce({
          message: {
            title: "Status updated locally",
            subtitle: "Will sync to cloud when back online",
          },
        }));
      }
    } catch (error) {
      console.error("Failed to update document status:", error);
    }
  };

  const getStatusIcon = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.ACTIVE:
        return <PlayArrow sx={{ color: "#1976d2" }} />;
      case DocumentStatus.DONE:
        return <CheckCircle sx={{ color: "#2e7d32" }} />;
      default:
        return <RadioButtonUnchecked />;
    }
  };

  const getStatusLabel = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.ACTIVE:
        return "Mark as Active";
      case DocumentStatus.DONE:
        return "Mark as Done";
      default:
        return "Mark as Active";
    }
  };

  if (variant === "iconbutton") {
    return (
      <>
        <IconButton
          onClick={handleClick}
          size="small"
          aria-label="Change status"
          sx={{
            color: currentStatus === DocumentStatus.ACTIVE
              ? "#1976d2"
              : currentStatus === DocumentStatus.DONE
              ? "#2e7d32"
              : "inherit",
          }}
        >
          {getStatusIcon(currentStatus)}
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
        >
          {Object.values(DocumentStatus).map((status) => (
            <MenuItem
              key={status}
              onClick={() => updateStatus(status)}
              selected={currentStatus === status}
            >
              <ListItemIcon>
                {getStatusIcon(status)}
              </ListItemIcon>
              <ListItemText primary={getStatusLabel(status)} />
            </MenuItem>
          ))}
        </Menu>
      </>
    );
  }

  // Menu item variant
  return (
    <>
      {Object.values(DocumentStatus).map((status) => {
        if (status === currentStatus) return null; // Don't show current status
        return (
          <MenuItem
            key={status}
            onClick={() => updateStatus(status)}
          >
            <ListItemIcon>
              {getStatusIcon(status)}
            </ListItemIcon>
            <ListItemText primary={getStatusLabel(status)} />
          </MenuItem>
        );
      })}
    </>
  );
};

export default StatusActions;
