"use client";
import { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronDown, FileText, MoreHorizontal, Plus, X } from "lucide-react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

export interface TabMeta {
  id: string;
  name: string;
}

interface EditorTabBarProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  dirtyTabIds: string[];
  rootTabId: string;
  renamingTabId?: string | null;
  onSwitch: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onAdd: () => void;
  onRename: (tabId: string, newName: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onContextMenu: (tabId: string, isRoot: boolean, anchor: HTMLElement) => void;
}

interface TabItemProps {
  tab: TabMeta;
  index: number;
  isActive: boolean;
  isDirty: boolean;
  isRoot: boolean;
  isRenaming: boolean;
  onSwitch: () => void;
  onClose: () => void;
  onRename: (newName: string) => void;
  onContextMenu: (anchor: HTMLElement) => void;
  onRenameStarted: () => void;
}

const TabItem: React.FC<TabItemProps> = ({
  tab,
  index,
  isActive,
  isDirty,
  isRoot,
  isRenaming,
  onSwitch,
  onClose,
  onRename,
  onContextMenu,
  onRenameStarted,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // External trigger: enter rename mode when requested from context menu.
  useEffect(() => {
    if (isRenaming && !editing) {
      setDraft(tab.name);
      setEditing(true);
      onRenameStarted();
    }
  }, [isRenaming, editing, tab.name, onRenameStarted]);

  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.name) onRename(trimmed);
    else setDraft(tab.name);
  };

  return (
    <Draggable draggableId={tab.id} index={index} isDragDisabled={isRoot}>
      {(provided, snapshot) => (
        <Box
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onSwitch}
          onContextMenu={(e) => {
            e.preventDefault();
            onContextMenu(e.currentTarget);
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1.5,
            py: 0.75,
            minWidth: 80,
            maxWidth: 200,
            cursor: "pointer",
            userSelect: "none",
            bgcolor: isActive
              ? "background.paper"
              : snapshot.isDragging
              ? "action.selected"
              : "transparent",
            borderBottom: isActive ? "2px solid" : "2px solid transparent",
            borderBottomColor: isActive ? "primary.main" : "transparent",
            transition: "background-color 0.15s",
            flexShrink: 0,
            "&:hover .tab-close": { opacity: 1 },
            "&:hover .tab-more": { opacity: 1 },
          }}
        >
          {/* Tab icon */}
          <FileText
            size={14}
            style={{
              color: "var(--mui-palette-text-secondary)",
              flexShrink: 0,
            }}
          />

          {/* Dirty indicator */}
          {isDirty && (
            <Box
              sx={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                bgcolor: "warning.main",
                flexShrink: 0,
              }}
            />
          )}

          {/* Label or inline input */}
          {editing
            ? (
              <Box
                component="input"
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setDraft(tab.name);
                    setEditing(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "1px solid",
                  outlineColor: "primary.main",
                  borderRadius: 0.5,
                  bgcolor: "background.paper",
                  color: "text.primary",
                  fontSize: "0.85rem",
                  fontFamily: "inherit",
                  px: 0.5,
                  py: 0,
                }}
              />
            )
            : (
              <Typography
                noWrap
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setDraft(tab.name);
                  setEditing(true);
                }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.85rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "text.primary" : "text.secondary",
                }}
              >
                {tab.name}
              </Typography>
            )}

          {/* More button (⋯) — shown on hover for active tab */}
          {isActive && (
            <Tooltip title="Tab actions">
              <IconButton
                className="tab-more"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextMenu(e.currentTarget);
                }}
                sx={{
                  opacity: 0,
                  p: 0.25,
                  transition: "opacity 0.15s",
                  color: "text.secondary",
                }}
              >
                <MoreHorizontal size={14} />
              </IconButton>
            </Tooltip>
          )}

          {/* Close button — hidden on root tab */}
          {!isRoot && (
            <Tooltip title="Delete tab">
              <IconButton
                className="tab-close"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                sx={{
                  opacity: isActive ? 1 : 0,
                  p: 0.25,
                  transition: "opacity 0.15s",
                  color: "text.secondary",
                  "&:hover": { color: "error.main" },
                }}
              >
                <X size={14} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Draggable>
  );
};

const EditorTabBar: React.FC<EditorTabBarProps> = ({
  tabs,
  activeTabId,
  dirtyTabIds,
  rootTabId,
  renamingTabId,
  onSwitch,
  onClose,
  onAdd,
  onRename,
  onReorder,
  onContextMenu,
}) => {
  // Track which tab's rename was started so we can clear it after one use.
  const [localRenamingTabId, setLocalRenamingTabId] = useState<string | null>(
    renamingTabId ?? null,
  );

  useEffect(() => {
    setLocalRenamingTabId(renamingTabId ?? null);
  }, [renamingTabId]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const src = result.source.index;
    const dst = result.destination.index;
    if (src === dst) return;
    // Root tab is always pinned at index 0 — prevent moving anything before it
    if (dst === 0) return;

    const reordered = [...tabs];
    const [moved] = reordered.splice(src, 1);
    reordered.splice(dst, 0, moved);
    onReorder(reordered.map((t) => t.id));
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        mb: 2,
        ml: { xs: -5, sm: -10, md: -12 },
        mr: { xs: -4, sm: -6, md: -8 },
        pl: 2,
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        "&::-webkit-scrollbar": { height: 3 },
        "&::-webkit-scrollbar-thumb": { bgcolor: "divider" },
      }}
    >
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="editor-tabs" direction="horizontal">
          {(provided) => (
            <Box
              ref={provided.innerRef}
              {...provided.droppableProps}
              sx={{ display: "flex", alignItems: "stretch" }}
            >
              {tabs.map((tab, index) => (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  index={index}
                  isActive={tab.id === activeTabId}
                  isDirty={dirtyTabIds.includes(tab.id)}
                  isRoot={tab.id === rootTabId}
                  isRenaming={localRenamingTabId === tab.id}
                  onSwitch={() => onSwitch(tab.id)}
                  onClose={() => onClose(tab.id)}
                  onRename={(name) => onRename(tab.id, name)}
                  onContextMenu={(anchor) =>
                    onContextMenu(tab.id, tab.id === rootTabId, anchor)}
                  onRenameStarted={() => setLocalRenamingTabId(null)}
                />
              ))}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      </DragDropContext>

      <Box
        sx={{
          ml: "auto",
          display: "flex",
          alignItems: "stretch",
          flexShrink: 0,
        }}
      >
        <Tooltip title="New sub-doc">
          <IconButton
            size="small"
            onClick={onAdd}
            sx={{
              px: 1.5,
              borderRadius: 0,
              borderLeft: "1px solid",
              borderColor: "divider",
            }}
          >
            <Plus size={18} />
          </IconButton>
        </Tooltip>
        <TabOverflowMenu
          tabs={tabs}
          activeTabId={activeTabId}
          onSwitch={onSwitch}
        />
      </Box>
    </Box>
  );
};

interface TabOverflowMenuProps {
  tabs: TabMeta[];
  activeTabId: string | null;
  onSwitch: (id: string) => void;
}

const TabOverflowMenu: React.FC<TabOverflowMenuProps> = (
  { tabs, activeTabId, onSwitch },
) => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  return (
    <>
      <Tooltip title="Show all tabs">
        <IconButton
          size="small"
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            px: 1,
            borderRadius: 0,
            borderLeft: "1px solid",
            borderColor: "divider",
          }}
        >
          <ChevronDown size={18} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        {tabs.map((tab) => (
          <MenuItem
            key={tab.id}
            selected={tab.id === activeTabId}
            onClick={() => {
              onSwitch(tab.id);
              setAnchor(null);
            }}
            sx={{ gap: 1 }}
          >
            <FileText
              size={16}
              style={{ color: "var(--mui-palette-text-secondary)" }}
            />
            {tab.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default EditorTabBar;
