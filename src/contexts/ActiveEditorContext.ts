"use client";
import { createContext } from "react";
import type { RefObject } from "react";
import type { LexicalEditor } from "lexical";

export const ActiveEditorContext = createContext<
  RefObject<LexicalEditor | null>
>(
  { current: null },
);

export const SetActiveEditorContext = createContext<
  (ref: RefObject<LexicalEditor | null>) => void
>(() => {});
