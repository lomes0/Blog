"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  DragIndicator,
  Close,
} from "@mui/icons-material";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Domain } from "@/types";

interface DomainOrderDialogProps {
  open: boolean;
  onClose: () => void;
  domains: Domain[];
  onReorder: (domainOrders: { id: string; order: number }[]) => Promise<void>;
}

const DomainOrderDialog: React.FC<DomainOrderDialogProps> = ({
  open,
  onClose,
  domains,
  onReorder,
}) => {
  const [orderedDomains, setOrderedDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Sort domains by current order, then by creation date
      const sorted = [...domains].sort((a, b) => {
        if (a.order != null && b.order != null) {
          return a.order - b.order;
        }
        if (a.order != null) return -1;
        if (b.order != null) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setOrderedDomains(sorted);
    }
  }, [open, domains]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(orderedDomains);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setOrderedDomains(items);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Create domain orders with new positions
      const domainOrders = orderedDomains.map((domain, index) => ({
        id: domain.id,
        order: index + 1, // Start from 1
      }));

      await onReorder(domainOrders);
      onClose();
    } catch (error) {
      console.error("Failed to reorder domains:", error);
      // Error handling is done in the parent component
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original order
    setOrderedDomains([]);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby="domain-order-dialog-title"
    >
      <DialogTitle
        id="domain-order-dialog-title"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        Reorder Domains
        <Tooltip title="Close">
          <IconButton
            onClick={handleCancel}
            size="small"
            disabled={isLoading}
          >
            <Close />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      
      <DialogContent sx={{ px: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, mb: 2 }}>
          Drag and drop domains to change their order in the sidebar.
        </Typography>

        {orderedDomains.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No domains to reorder
            </Typography>
          </Box>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="domains">
              {(provided) => (
                <List
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  sx={{ py: 0 }}
                >
                  {orderedDomains.map((domain, index) => (
                    <Draggable
                      key={domain.id}
                      draggableId={domain.id}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <ListItem
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          sx={{
                            backgroundColor: snapshot.isDragging
                              ? "action.hover"
                              : "transparent",
                            borderRadius: 1,
                            mx: 1,
                            "&:hover": {
                              backgroundColor: "action.hover",
                            },
                          }}
                        >
                          <ListItemIcon
                            {...provided.dragHandleProps}
                            sx={{ minWidth: 40, cursor: "grab" }}
                          >
                            <DragIndicator color="action" />
                          </ListItemIcon>
                          
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: domain.color || "#555",
                              mr: 2,
                            }}
                            role="img"
                            aria-label={`Domain color for ${domain.name}`}
                          />
                          
                          <ListItemText
                            primary={domain.name}
                            secondary={domain.description}
                            primaryTypographyProps={{
                              fontSize: "0.9rem",
                            }}
                            secondaryTypographyProps={{
                              fontSize: "0.8rem",
                            }}
                          />
                        </ListItem>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </List>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={isLoading || orderedDomains.length === 0}
        >
          {isLoading ? "Saving..." : "Save Order"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DomainOrderDialog;
