"use client";
import { createCommand, LexicalCommand } from "lexical";

export interface EditorDialogs {
  image?: {
    open: boolean;
  };
  graph?: {
    open: boolean;
  };
  sketch?: {
    open: boolean;
  };
  table?: {
    open: boolean;
  };
  iframe?: {
    open: boolean;
  };
  link?: {
    open: boolean;
  };
  layout?: {
    open: boolean;
  };
  ocr?: {
    open: boolean;
  };
  ai?: {
    open: boolean;
  };
  attachment?: {
    open: boolean;
  };
}

export type SetDialogsPayload = Readonly<Partial<EditorDialogs>>;

export const SET_DIALOGS_COMMAND: LexicalCommand<SetDialogsPayload> =
  createCommand();
