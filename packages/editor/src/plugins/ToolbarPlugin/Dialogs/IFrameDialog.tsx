"use client";
import type { LexicalEditor } from "lexical";
import React, { memo, useEffect, useRef, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  SwitchField,
  TextField,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";
import { INSERT_IFRAME_COMMAND } from "@/editor/plugins/IFramePlugin";
import { IFrameNode } from "@/editor/nodes/IFrameNode";

function IFrameDialog(
  { editor, node }: { editor: LexicalEditor; node: IFrameNode | null },
) {
  const srcRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    src: "",
    altText: "iframe",
    width: 560,
    height: 315,
    showCaption: true,
    id: "",
    style: "",
  });
  useEffect(() => {
    if (node) {
      const serializedNode = node?.exportJSON();
      setFormData({
        src: serializedNode.src,
        altText: serializedNode.altText,
        width: serializedNode.width,
        height: serializedNode.height,
        showCaption: serializedNode.showCaption,
        id: serializedNode.id,
        style: serializedNode.style,
      });
    } else {
      setFormData({
        src: "",
        altText: "iframe",
        width: 560,
        height: 315,
        showCaption: true,
        id: "",
        style: "",
      });
    }
  }, [node]);

  const updateFormData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    if (!node) editor.dispatchCommand(INSERT_IFRAME_COMMAND, formData);
    else editor.update(() => node.update(formData));
    closeDialog();
    setTimeout(() => {
      editor.focus();
    }, 0);
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, {
      iframe: { open: false },
    });
  };

  const handleClose = () => {
    closeDialog();
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup fullScreen="mobile" initialFocus={srcRef}>
        <DialogHeader>
          <DialogTitle>Insert IFrame</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={css.form} noValidate onSubmit={handleSubmit}>
            <TextField
              autoComplete="off"
              label="Embed URL"
              name="src"
              onChange={updateFormData}
              ref={srcRef}
              value={formData.src}
            />
            <TextField
              autoComplete="off"
              label="Alt Text"
              name="altText"
              onChange={updateFormData}
              value={formData.altText}
            />
            <TextField
              autoComplete="off"
              label="Width"
              name="width"
              onChange={updateFormData}
              value={formData.width}
            />
            <TextField
              autoComplete="off"
              label="Height"
              name="height"
              onChange={updateFormData}
              value={formData.height}
            />
            <SwitchField
              checked={formData.showCaption}
              label="Show Caption"
              name="showCaption"
              onCheckedChange={(showCaption) =>
                setFormData({ ...formData, showCaption })}
            />
          </form>
        </DialogBody>
        <DialogFooter>
          <ActionButton onClick={handleClose} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton
            disabled={!formData.src}
            onClick={handleSubmit}
            size="lg"
            variant="accent"
          >
            Confirm
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default memo(IFrameDialog);
