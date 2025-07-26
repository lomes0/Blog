"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { actions, useDispatch, useSelector } from "@/store";
import {
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Article,
  ChevronRight,
  ExpandMore,
  Folder,
  FolderOpen,
  Home,
  MoreVert,
} from "@mui/icons-material";
import { DocumentType, UserDocument } from "@/types";
import ContextMenu from "./ContextMenu";
import FileBrowserTreeItem from "./TreeItem";
import documentDB, { revisionDB } from "@/indexeddb";
import "./styles.css";

interface FileBrowserProps {
  open: boolean; // Whether sidebar is expanded
  domainId?: string | null; // Optional domain ID to filter by
}

interface FileBrowserTreeItemData {
  id: string;
  name: string;
  type: DocumentType;
  children: FileBrowserTreeItemData[];
  parentId: string | null;
  sort_order: number | null; // Add sort_order field
}

const FileBrowser: React.FC<FileBrowserProps> = ({ open, domainId }) => {
  const documents = useSelector((state) => state.documents);
  const domains = useSelector((state) => state.domains);
  const initialized = useSelector((state) => state.ui.initialized);
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useDispatch();

  const [treeData, setTreeData] = useState<FileBrowserTreeItemData[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);

  // Get current domain info for root entry
  const currentDomain = domainId
    ? domains.find((d) => d.id === domainId)
    : null;

  // Trigger data loading if it hasn't been initialized yet
  useEffect(() => {
    if (!initialized) {
      setIsLoading(true);
      dispatch(actions.load()).then(() => {
        setIsLoading(false);
      });
    }
  }, [initialized, dispatch]);

  // Ensure domain data is loaded when accessing a domain-specific view
  useEffect(() => {
    if (domainId && domains.length === 0) {
      setIsLoading(true);
      dispatch(actions.fetchUserDomains()).then(() => {
        setIsLoading(false);
      });
    }
  }, [domainId, domains.length, dispatch]);

  // Determine if we're in edit mode to trigger autosave
  const isEditMode = pathname.startsWith("/edit/");

  // Custom Link component that handles auto-saving before navigation
  const SafeNavigationLink = ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: any;
  }) => {
    const handleClick = (e: React.MouseEvent) => {
      // Only perform autosave if we're in edit mode
      if (isEditMode) {
        e.preventDefault();

        // Dispatch a special action to trigger autosave
        dispatch({
          type: "TRIGGER_AUTOSAVE_BEFORE_NAVIGATION",
          payload: { targetUrl: href },
        });

        // After a short delay to allow autosave to start, navigate to the target URL
        setTimeout(() => {
          router.push(href);
          if (onClick) onClick();
        }, 100);
      } else {
        // If not in edit mode, just navigate normally
        router.push(href);
        if (onClick) onClick();
      }
    };

    return (
      <Box
        component="a"
        href={href}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Box>
    );
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<
    {
      mouseX: number;
      mouseY: number;
      item: FileBrowserTreeItemData | null;
    } | null
  >(null);

  // In-place editing state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");

  // Extract directory ID from pathname
  useEffect(() => {
    // Handle domain-specific routes first
    if (pathname.startsWith("/domains/")) {
      const pathParts = pathname.split("/").filter(Boolean);

      // Check if path has enough parts and follows domain route pattern
      if (pathParts.length >= 3) {
        // pathParts[0] should be "domains", pathParts[1] is the domain slug

        // Handle domain-specific browse routes
        if (pathParts[2] === "browse" && pathParts.length >= 4) {
          const dirId = pathParts[3];
          setCurrentDirectory(dirId);

          // Auto-expand parents of current directory
          if (dirId) {
            const expandParents = (id: string) => {
              const doc = documents.find(
                (d) => (d.local?.id === id || d.cloud?.id === id),
              );

              if (doc) {
                const parentId = doc.local?.parentId ||
                  doc.cloud?.parentId;
                if (parentId) {
                  setExpandedNodes((prev) => {
                    const newSet = new Set(prev);
                    newSet.add(parentId);
                    return newSet;
                  });
                  expandParents(parentId);
                }
              }
            };

            expandParents(dirId);
          }

          // Handle domain-specific view/edit routes
        } else if (
          (pathParts[2] === "view" || pathParts[2] === "edit") &&
          pathParts.length >= 4
        ) {
          const docId = pathParts[3];

          if (docId) {
            // Find the document and its parent
            const doc = documents.find((d) => d.id === docId);
            if (doc) {
              const parentId = doc.local?.parentId || doc.cloud?.parentId;
              if (parentId) {
                setCurrentDirectory(parentId);

                // Auto-expand parent directories
                const expandParents = (id: string) => {
                  setExpandedNodes((prev) => {
                    const newSet = new Set(prev);
                    newSet.add(id);
                    return newSet;
                  });

                  const parent = documents.find((d) => d.id === id);
                  if (parent) {
                    const grandParentId = parent.local?.parentId ||
                      parent.cloud?.parentId;
                    if (grandParentId) {
                      expandParents(grandParentId);
                    }
                  }
                };

                expandParents(parentId);
              } else {
                setCurrentDirectory(null); // Root directory
              }
            }
          }
        }
      }
    } // Handle standard routes
    else if (pathname.startsWith("/browse/")) {
      const dirId = pathname.replace("/browse/", "");
      setCurrentDirectory(dirId);

      // Auto-expand parents of current directory
      if (dirId) {
        const expandParents = (id: string) => {
          const doc = documents.find(
            (d) => (d.local?.id === id || d.cloud?.id === id),
          );

          if (doc) {
            const parentId = doc.local?.parentId ||
              doc.cloud?.parentId;
            if (parentId) {
              setExpandedNodes((prev) => {
                const newSet = new Set(prev);
                newSet.add(parentId);
                return newSet;
              });
              expandParents(parentId);
            }
          }
        };

        expandParents(dirId);
      }
    } else if (
      pathname.startsWith("/view/") || pathname.startsWith("/edit/")
    ) {
      // For view and edit routes, highlight the current document and expand its parent directories
      const docId = pathname.replace(/^\/(view|edit)\//, "");

      if (docId) {
        // Find the document and its parent
        const doc = documents.find((d) => d.id === docId);
        if (doc) {
          const parentId = doc.local?.parentId || doc.cloud?.parentId;
          if (parentId) {
            setCurrentDirectory(parentId);

            // Auto-expand parent directories
            const expandParents = (id: string) => {
              setExpandedNodes((prev) => {
                const newSet = new Set(prev);
                newSet.add(id);
                return newSet;
              });

              const parent = documents.find((d) => d.id === id);
              if (parent) {
                const grandParentId = parent.local?.parentId ||
                  parent.cloud?.parentId;
                if (grandParentId) {
                  expandParents(grandParentId);
                }
              }
            };

            expandParents(parentId);
          } else {
            setCurrentDirectory(null); // Root directory
          }
        }
      }
    } else {
      setCurrentDirectory(null);
    }
  }, [pathname, documents]);

  // Build tree data structure from flat documents list
  useEffect(() => {
    const isDirectory = (doc: UserDocument) =>
      (doc.local?.type === DocumentType.DIRECTORY) ||
      (doc.cloud?.type === DocumentType.DIRECTORY);

    // Function to determine if a document belongs to the selected domain
    const belongsToDomain = (doc: UserDocument) => {
      if (!domainId) return false; // If no domain filter, exclude all documents

      // Check if document has a matching domainId in either local or cloud version
      const docDomainId = doc.local?.domainId || doc.cloud?.domainId;
      if (docDomainId === domainId) return true;

      // If not directly in domain, check if it's a descendant of a directory in this domain
      const checkAncestorDomain = (
        docId: string,
        visited = new Set<string>(),
      ): boolean => {
        // Prevent infinite loops
        if (visited.has(docId)) return false;
        visited.add(docId);

        const currentDoc = documents.find((d) => d.id === docId);
        if (!currentDoc) return false;

        const parentId = currentDoc.local?.parentId ||
          currentDoc.cloud?.parentId;
        if (!parentId) return false;

        const parent = documents.find((d) => d.id === parentId);
        if (!parent) return false;

        // Check if parent is in the domain
        const parentDomainId = parent.local?.domainId || parent.cloud?.domainId;
        if (parentDomainId === domainId) return true;

        // Recursively check parent's ancestors
        return checkAncestorDomain(parentId, visited);
      };

      return checkAncestorDomain(doc.id);
    };

    // Create tree structure
    const buildTree = () => {
      const items: FileBrowserTreeItemData[] = [];
      const map = new Map<string, FileBrowserTreeItemData>();

      // First pass: create all tree items without children, filtered by domain if needed
      documents.forEach((doc) => {
        // Skip documents that don't belong to the current domain if domain filtering is active
        if (!belongsToDomain(doc)) return;
        const name = doc.local?.name || doc.cloud?.name || "Untitled";
        const type = isDirectory(doc)
          ? DocumentType.DIRECTORY
          : DocumentType.DOCUMENT;
        const parentId = doc.local?.parentId || doc.cloud?.parentId ||
          null;
        const sort_order = doc.local?.sort_order || doc.cloud?.sort_order ||
          null;

        const item: FileBrowserTreeItemData = {
          id: doc.id,
          name,
          type,
          children: [],
          parentId,
          sort_order,
        };

        map.set(doc.id, item);
      });

      // Second pass: build hierarchy
      map.forEach((item) => {
        if (item.parentId) {
          const parent = map.get(item.parentId);
          if (parent) {
            parent.children.push(item);
          } else {
            // Parent not found, add to root level
            items.push(item);
          }
        } else {
          // Root level item
          items.push(item);
        }
      });

      // Sort items: directories first, then by sort_order, then by name
      const sortItems = (items: FileBrowserTreeItemData[]) => {
        items.sort((a, b) => {
          // Directories first
          if (
            a.type === DocumentType.DIRECTORY &&
            b.type !== DocumentType.DIRECTORY
          ) return -1;
          if (
            a.type !== DocumentType.DIRECTORY &&
            b.type === DocumentType.DIRECTORY
          ) return 1;

          // If both are the same type (both directories or both documents)
          // Check if both have valid sort_order (> 0)
          const aHasValidSortOrder = a.sort_order !== null && a.sort_order > 0;
          const bHasValidSortOrder = b.sort_order !== null && b.sort_order > 0;

          // Items with valid sort_order come first
          if (aHasValidSortOrder && !bHasValidSortOrder) return -1;
          if (!aHasValidSortOrder && bHasValidSortOrder) return 1;

          // If both have valid sort_order, sort by sort_order value
          if (aHasValidSortOrder && bHasValidSortOrder) {
            return (a.sort_order as number) - (b.sort_order as number);
          }

          // If neither has a valid sort_order, sort by name alphabetically
          return a.name.localeCompare(b.name);
        });

        // Sort children recursively
        items.forEach((item) => {
          if (item.children.length) {
            sortItems(item.children);
          }
        });

        return items;
      };

      return sortItems(items);
    };

    setTreeData(buildTree());
  }, [documents, domainId]);

  const handleItemClick = (item: FileBrowserTreeItemData) => {
    // Check if we're in a domain context by looking at the current pathname
    const isDomainRoute = pathname.startsWith("/domains/");

    if (isDomainRoute) {
      // Extract the domain slug from the pathname
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && parts[0] === "domains") {
        const domainSlug = parts[1];

        if (item.type === DocumentType.DIRECTORY) {
          // Navigate to directory while preserving domain context
          router.push(`/domains/${domainSlug}/browse/${item.id}`);
        } else {
          // Navigate to document view while preserving domain context
          router.push(`/domains/${domainSlug}/view/${item.id}`);
        }
        return;
      }
    }

    // Default behavior (outside domain context)
    if (item.type === DocumentType.DIRECTORY) {
      // Navigate to directory
      router.push(`/browse/${item.id}`);
    } else {
      // Navigate to document view
      router.push(`/view/${item.id}`);
    }
  };

  const handleExpandClick = (
    item: FileBrowserTreeItemData,
    event: React.MouseEvent,
  ) => {
    // Prevent the click from triggering the parent ListItemButton click
    event.stopPropagation();

    // Only toggle expansion state without navigating
    if (item.type === DocumentType.DIRECTORY) {
      setExpandedNodes((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(item.id)) {
          newSet.delete(item.id);
        } else {
          newSet.add(item.id);
        }
        return newSet;
      });
    }
  };

  // Context menu handlers
  const handleContextMenu = (
    event: React.MouseEvent,
    item: FileBrowserTreeItemData,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    console.log("Opening context menu for item:", item);

    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      item: item,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle starting in-place editing for an item
  const startEditing = (
    item: { id: string; name: string; type: DocumentType },
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    setEditingItemId(item.id);
    setEditingText(item.name);
    handleCloseContextMenu();
  };

  // Handle the edit input change
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingText(e.target.value);
  };

  // Handle canceling the edit
  const cancelEditing = () => {
    setEditingItemId(null);
    setEditingText("");
  };

  // Track if we've already submitted the edit to prevent double submission
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Handle submitting the edit
  const submitEditing = async () => {
    // Prevent double submission
    if (isSubmitting) return;

    if (editingItemId && editingText.trim() !== "") {
      // Check if the name has actually changed
      const editingItem = treeData.flat(Infinity).find((item: any) =>
        item.id === editingItemId
      );
      const originalName = editingItem?.name || "";

      // If name hasn't changed, just cancel editing without reload
      if (editingText.trim() === originalName) {
        cancelEditing();
        return;
      }

      setIsSubmitting(true);

      try {
        // Find the item being edited
        const itemToEdit = documents.find((doc) => doc.id === editingItemId);
        if (!itemToEdit) {
          setIsSubmitting(false);
          cancelEditing();
          return;
        }

        console.log(
          "Renaming document/folder:",
          editingItemId,
          "to:",
          editingText.trim(),
        );

        // 1. Redux approach
        console.log("Attempting to rename document with ID:", editingItemId);
        await dispatch(
          actions.updateLocalDocument({
            id: editingItemId,
            partial: {
              name: editingText.trim(),
            },
          }),
        );

        // 2. Direct IndexedDB approach as fallback
        try {
          const originalDoc = await documentDB.getByID(editingItemId);
          if (originalDoc) {
            const updatedDoc = {
              ...originalDoc,
              name: editingText.trim(),
              updatedAt: new Date().toISOString(),
            };

            await documentDB.update(updatedDoc);
            console.log("Document renamed in IndexedDB:", updatedDoc);
          }
        } catch (dbError) {
          console.error("Direct IndexedDB update failed:", dbError);
        }

        // Show confirmation notification
        dispatch(
          actions.announce({
            message: {
              title: `Renamed successfully`,
              subtitle: `Item renamed to "${editingText.trim()}"`,
            },
          }),
        );

        // Cancel the editing state before reload
        cancelEditing();

        // Use setTimeout to ensure state updates happen before reload
        setTimeout(() => {
          // Reload the current page to refresh the file list
          window.location.reload();
        }, 50);
      } catch (error) {
        console.error("Failed to rename:", error);
        dispatch(
          actions.announce({
            message: {
              title: `Failed to rename`,
              subtitle: `Error occurred when trying to rename item`,
            },
          }),
        );
        setIsSubmitting(false);
        cancelEditing();
      }
    } else {
      cancelEditing();
    }
  };

  // Recursive component to render tree items
  const renderTreeItems = (
    items: FileBrowserTreeItemData[],
    level: number = 0,
  ) => {
    return items.map((item) => {
      const isExpanded = expandedNodes.has(item.id);
      const isDirectory = item.type === DocumentType.DIRECTORY;
      const isCurrentDirectory = item.id === currentDirectory;

      // Check if this is the current document (when in view/edit mode)
      const isCurrentDocument = !isDirectory && (
        pathname === `/view/${item.id}` ||
        pathname === `/edit/${item.id}` ||
        // Also check for domain-specific routes
        Boolean(
          pathname.match(new RegExp(`/domains/[^/]+/view/${item.id}$`)),
        ) ||
        Boolean(pathname.match(new RegExp(`/domains/[^/]+/edit/${item.id}$`)))
      );

      return (
        <Box key={item.id}>
          <FileBrowserTreeItem
            item={item}
            level={level}
            isExpanded={isExpanded}
            isCurrentDirectory={isCurrentDirectory}
            isCurrentDocument={isCurrentDocument}
            editingItemId={editingItemId}
            editingText={editingText}
            onItemClick={handleItemClick}
            onExpandClick={handleExpandClick}
            onContextMenu={handleContextMenu}
            startEditing={startEditing}
            handleEditChange={handleEditChange}
            submitEditing={submitEditing}
            cancelEditing={cancelEditing}
            open={open}
            domainId={domainId}
          />

          {/* Render children if directory is expanded */}
          {isDirectory && isExpanded && (
            <Collapse in={true} timeout="auto" unmountOnExit>
              {renderTreeItems(item.children, level + 1)}
            </Collapse>
          )}
        </Box>
      );
    });
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 2,
          pt: 1,
          flexShrink: 0,
        }}
      >
        {open && (
          <SafeNavigationLink
            href="/browse"
            sx={{
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Files
            </Typography>
          </SafeNavigationLink>
        )}
      </Box>

      <List
        dense
        disablePadding
        sx={{
          overflow: "auto",
          flex: 1,
          minHeight: 0, /* Allow shrinking below content size */
        }}
      >
        {isLoading
          ? (
            <Box sx={{ p: 2, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Loading...
              </Typography>
            </Box>
          )
          : (
            <>
              {/* Domain root entry - only show when in domain context */}
              {domainId && currentDomain && (
                <>
                  <FileBrowserTreeItem
                    item={{
                      id: `domain-root-${domainId}`,
                      name: "Root",
                      type: DocumentType.DIRECTORY,
                      children: [],
                      parentId: null,
                      sort_order: null,
                    }}
                    level={0}
                    isExpanded={false}
                    isCurrentDirectory={false}
                    isCurrentDocument={false}
                    editingItemId=""
                    editingText=""
                    onItemClick={() => {
                      // Navigate to domain root
                      const parts = pathname.split("/").filter(Boolean);
                      if (parts.length >= 2 && parts[0] === "domains") {
                        const domainSlug = parts[1];
                        router.push(`/domains/${domainSlug}`);
                      }
                    }}
                    onExpandClick={() => {}}
                    onContextMenu={() => {}}
                    startEditing={() => {}}
                    handleEditChange={() => {}}
                    submitEditing={() => {}}
                    cancelEditing={() => {}}
                    open={open}
                    isDomainRoot={true}
                    domainId={domainId}
                  />
                </>
              )}

              {/* Regular tree items */}
              {treeData.length === 0 && domainId
                ? (
                  <Box sx={{ p: 2, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      No files in this domain
                    </Typography>
                  </Box>
                )
                : treeData.length > 0
                ? (
                  renderTreeItems(treeData, 0) // Start at level 0 for regular items
                )
                : !domainId && (
                  <Box sx={{ p: 1, textAlign: "center" }}>
                    {open && (
                      <Typography variant="caption" color="text.secondary">
                        No folders found
                      </Typography>
                    )}
                  </Box>
                )}
            </>
          )}
      </List>

      {/* Context Menu */}
      <ContextMenu
        open={Boolean(contextMenu)}
        anchorPosition={contextMenu
          ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
          : null}
        handleClose={handleCloseContextMenu}
        item={contextMenu?.item
          ? {
            id: contextMenu.item.id,
            name: contextMenu.item.name,
            type: contextMenu.item.type,
          }
          : null}
        onStartEditing={startEditing}
      />
    </Box>
  );
};

export default FileBrowser;
