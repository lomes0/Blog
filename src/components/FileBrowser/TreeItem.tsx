"use client";
import React from "react";
import { Box, ListItemButton, ListItemIcon, ListItemText, TextField } from "@mui/material";
import { Article, ChevronRight, ExpandMore, Folder } from "@mui/icons-material";
import { DocumentType } from "@/types";
import { useDropTarget } from "../Layout/SideBar/hooks/useDropTarget";

interface FileBrowserTreeItemData {
  id: string;
  name: string;
  type: DocumentType;
  children: FileBrowserTreeItemData[];
  parentId: string | null;
  sort_order: number | null;
}

interface FileBrowserTreeItemProps {
  item: FileBrowserTreeItemData;
  level: number;
  isExpanded: boolean;
  isCurrentDirectory: boolean;
  isCurrentDocument: boolean;
  editingItemId: string | null;
  editingText: string;
  onItemClick: (item: FileBrowserTreeItemData) => void;
  onExpandClick: (item: FileBrowserTreeItemData, event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent, item: FileBrowserTreeItemData) => void;
  startEditing: (item: { id: string; name: string; type: DocumentType }, event: React.MouseEvent) => void;
  handleEditChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  submitEditing: () => void;
  cancelEditing: () => void;
  open: boolean;
  isDomainRoot?: boolean;
  domainIcon?: React.ReactNode;
  domainId?: string | null;
}

const FileBrowserTreeItem: React.FC<FileBrowserTreeItemProps> = ({
  item,
  level,
  isExpanded,
  isCurrentDirectory,
  isCurrentDocument,
  editingItemId,
  editingText,
  onItemClick,
  onExpandClick,
  onContextMenu,
  startEditing,
  handleEditChange,
  submitEditing,
  cancelEditing,
  open,
  isDomainRoot = false,
  domainIcon,
  domainId,
}) => {
  const isDirectory = item.type === DocumentType.DIRECTORY;

  // Add drop target support for directories and domain root
  const { isDropTarget, dragHandlers } = useDropTarget({
    targetId: isDomainRoot ? null : (isDirectory ? item.id : null),
    targetType: isDomainRoot ? "domain" : "directory",
    domainId: domainId,
    onDropComplete: () => {
      console.log(`Item dropped on ${isDomainRoot ? 'domain root' : 'directory'}: ${item.name}`);
    },
  });

  return (
    <ListItemButton
      onClick={() => onItemClick(item)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing({
          id: item.id,
          name: item.name,
          type: item.type,
        }, e);
      }}
      onContextMenu={(e) => onContextMenu(e, item)}
      selected={isCurrentDirectory || isCurrentDocument}
      {...((isDirectory || isDomainRoot) ? dragHandlers : {})}
      sx={{
        pl: level * 1.5 + 2.5, // Same padding for all items
        py: 0.5,
        minHeight: 36,
        "&.Mui-selected": {
          bgcolor: "action.selected",
        },
        "&:hover": {
          bgcolor: "rgba(0, 0, 0, 0.15) !important",
        },
        // Add drop target visual feedback
        ...((isDirectory || isDomainRoot) && isDropTarget && {
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:hover": {
            bgcolor: "primary.dark !important",
          },
        }),
        transition: "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      {/* Only show icon if it's not a domain root, or if it's a domain root with a specific icon */}
      {!(isDomainRoot && !domainIcon) && (
        <ListItemIcon
          sx={{
            minWidth: 30,
            color: ((isDirectory || isDomainRoot) && isDropTarget) ? "inherit" : "text.secondary",
            ml: 0,
          }}
        >
          {isDomainRoot && domainIcon 
            ? domainIcon 
            : isDirectory ? <Folder fontSize="small" /> : <Article fontSize="small" />}
        </ListItemIcon>
      )}

      {open && (
        <>
          {editingItemId === item.id ? (
            <TextField
              value={editingText}
              onChange={handleEditChange}
              autoFocus
              size="small"
              variant="standard"
              margin="dense"
              fullWidth
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEditing();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              onBlur={(e) => {
                setTimeout(() => {
                  if (editingItemId === item.id) {
                    submitEditing();
                  }
                }, 100);
              }}
              sx={{
                "& .MuiInputBase-input": {
                  fontSize: 14,
                  py: 0.5,
                },
                width: "90%",
                mr: 1,
              }}
              InputProps={{
                disableUnderline: false,
              }}
            />
          ) : (
            <ListItemText
              primary={item.name}
              primaryTypographyProps={{
                noWrap: true,
                fontSize: 14,
                fontWeight: (isCurrentDirectory || isCurrentDocument) ? "medium" : "normal",
                color: "text.primary",
              }}
            />
          )}

          {/* Expand/collapse arrow - hidden for domain root */}
          {isDirectory && isDomainRoot !== true && (
            <Box
              sx={{
                color: "text.secondary",
                cursor: "pointer",
                p: 0.5,
              }}
              onClick={(e) => onExpandClick(item, e)}
            >
              {isExpanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
            </Box>
          )}
        </>
      )}
    </ListItemButton>
  );
};

export default FileBrowserTreeItem;
