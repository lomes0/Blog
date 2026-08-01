"use client";
import { useMemo, useState } from "react";
import { comparePostsByRank } from "@/lib/documentOrder";
import { seriesCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";
import { Post } from "@/types";

export function useSeriesGroupState(
  posts: Post[],
  defaultExpanded: boolean,
  seriesId: string,
  onExpand?: () => void,
  onCollapse?: () => void,
) {
  const run = useCommandRun();
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);

  const sortedPosts = useMemo(
    () => [...posts].sort(comparePostsByRank),
    [posts],
  );

  const handleToggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    if (newState) {
      onCollapse?.();
    } else {
      onExpand?.();
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isLinkClick = target.closest("a");
    if (!isLinkClick) {
      run(seriesCommands.open, { id: seriesId });
    }
  };

  return { isCollapsed, sortedPosts, handleToggle, handleCardClick };
}
