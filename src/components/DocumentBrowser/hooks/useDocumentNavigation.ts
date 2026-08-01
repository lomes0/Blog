"use client";
import { useCallback } from "react";
import { documentCommands } from "@/commands";
import { useCommandRun } from "@/commands/CommandProvider";

type UseDocumentNavigationProps = Record<string, never>;

/**
 * Custom hook for blog post navigation actions
 * Simplified for blog structure without directories or domains
 */
export const useDocumentNavigation = (
  {}: UseDocumentNavigationProps = {},
) => {
  const run = useCommandRun();

  const createDocument = useCallback(() => {
    run(documentCommands.create);
  }, [run]);

  return { createDocument };
};
