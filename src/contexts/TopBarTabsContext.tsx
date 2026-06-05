"use client";
import React, { createContext, useCallback, useContext, useState } from "react";
import type { TabMeta } from "@/components/EditDocument/EditorTabBar";

export interface TabBarState {
  tabs: TabMeta[];
  activeTabId: string | null;
  rootTabId: string;
  /** Present only in edit mode */
  dirtyTabIds?: string[];
  renamingTabId?: string | null;
  onSwitch: (tabId: string) => void;
  /** Present only in edit mode */
  onClose?: (tabId: string) => void;
  /** Present only in edit mode */
  onAdd?: () => void;
  /** Present only in edit mode */
  onRename?: (tabId: string, newName: string) => void;
  /** Present only in edit mode */
  onReorder?: (orderedIds: string[]) => void;
  /** Present only in edit mode */
  onContextMenu?: (tabId: string, isRoot: boolean, anchor: HTMLElement) => void;
}

interface TopBarTabsContextType {
  tabBar: TabBarState | null;
  setTabBar: (bar: TabBarState | null) => void;
}

const TopBarTabsContext = createContext<TopBarTabsContextType | undefined>(
  undefined,
);

export const useTopBarTabs = () => {
  const ctx = useContext(TopBarTabsContext);
  if (!ctx) {
    throw new Error("useTopBarTabs must be used within TopBarTabsProvider");
  }
  return ctx;
};

export const TopBarTabsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [tabBar, setTabBarState] = useState<TabBarState | null>(null);
  const setTabBar = useCallback(
    (bar: TabBarState | null) => setTabBarState(bar),
    [],
  );

  return (
    <TopBarTabsContext.Provider value={{ tabBar, setTabBar }}>
      {children}
    </TopBarTabsContext.Provider>
  );
};
