"use client";
import React from "react";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
} from "@mui/material";
import {
  CheckCircle,
  PlayArrow,
  RadioButtonUnchecked,
} from "@mui/icons-material";
import { actions, useDispatch, useSelector } from "@/store";
import { DocumentStatus, UserDocument } from "@/types";

interface StatusToggleProps {
  userDocument: UserDocument;
  variant?: "menuitem" | "iconbutton";
  closeMenu?: () => void;
}

const StatusToggle: React.FC<StatusToggleProps> = ({
  userDocument,
  variant = "iconbutton",
  closeMenu,
}) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user);

  const localDocument = userDocument?.local;
  const cloudDocument = userDocument?.cloud;
  const isLocal = !!localDocument;
  const isCloud = !!cloudDocument;
  const isAuthor = isCloud ? cloudDocument.author.id === user?.id : true;

  // Only show for authors
  if (!isAuthor) return null;

  const document = isLocal ? localDocument : cloudDocument;
  const currentStatus = document?.status || DocumentStatus.NEUTRAL;

  // Cycle through statuses: Neutral → Active → Done → Neutral
  const getNextStatus = (current: DocumentStatus): DocumentStatus => {
    switch (current) {
      case DocumentStatus.NEUTRAL:
        return DocumentStatus.ACTIVE;
      case DocumentStatus.ACTIVE:
        return DocumentStatus.DONE;
      case DocumentStatus.DONE:
        return DocumentStatus.NEUTRAL;
      default:
        return DocumentStatus.NEUTRAL;
    }
  };

  const getStatusIcon = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.ACTIVE:
        return <PlayArrow />;
      case DocumentStatus.DONE:
        return <CheckCircle />;
      default:
        return <RadioButtonUnchecked />;
    }
  };

  const getStatusLabel = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.ACTIVE:
        return "Active";
      case DocumentStatus.DONE:
        return "Done";
      default:
        return "Neutral";
    }
  };

  const getTooltipText = (current: DocumentStatus) => {
    const next = getNextStatus(current);
    return `Currently ${getStatusLabel(current)} - Click to mark as ${
      getStatusLabel(next)
    }`;
  };

  const handleToggleStatus = async () => {
    if (closeMenu) closeMenu();

    const nextStatus = getNextStatus(currentStatus);

    try {
      if (isLocal) {
        // Update local document
        await dispatch(actions.updateLocalDocument({
          id: userDocument.id,
          partial: { status: nextStatus },
        }));
      }

      if (isCloud) {
        // Update cloud document
        await dispatch(actions.updateCloudDocument({
          id: userDocument.id,
          partial: { status: nextStatus },
        }));
      }
    } catch (error) {
      console.error("Failed to update document status:", error);
    }
  };

  if (variant === "menuitem") {
    return (
      <MenuItem onClick={handleToggleStatus}>
        <ListItemIcon>
          {getStatusIcon(currentStatus)}
        </ListItemIcon>
        <ListItemText>
          Mark as {getStatusLabel(getNextStatus(currentStatus))}
        </ListItemText>
      </MenuItem>
    );
  }

  return (
    <Tooltip title={getTooltipText(currentStatus)} placement="top">
      <IconButton
        onClick={handleToggleStatus}
        size="small"
        aria-label={`Toggle status - currently ${
          getStatusLabel(currentStatus)
        }`}
        sx={{
          color: currentStatus === DocumentStatus.ACTIVE
            ? "#ff9800"
            : currentStatus === DocumentStatus.DONE
            ? "#9e9e9e"
            : "inherit",
        }}
      >
        {getStatusIcon(currentStatus)}
      </IconButton>
    </Tooltip>
  );
};

export default StatusToggle;
