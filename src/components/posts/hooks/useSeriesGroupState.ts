"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { compareDocumentsByRank } from "@/lib/documentOrder";
import { UserDocument } from "@/types";

export function useSeriesGroupState(
  posts: UserDocument[],
  defaultExpanded: boolean,
  seriesId: string,
  onExpand?: () => void,
  onCollapse?: () => void,
) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(!defaultExpanded);

  const sortedPosts = useMemo(
    () => [...posts].sort(compareDocumentsByRank),
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
      router.push(`/series/${seriesId}`);
    }
  };

  return { isCollapsed, sortedPosts, handleToggle, handleCardClick };
}
