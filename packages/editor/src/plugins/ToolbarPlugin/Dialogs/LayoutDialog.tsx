"use client";
import type { LexicalEditor } from "lexical";
import { INSERT_LAYOUT_COMMAND } from "@/editor/plugins/LayoutPlugin";
import React, { memo } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  RadioField,
  RadioGroup,
  RadioGroupLabel,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";

const LAYOUTS = [
  { label: "2 columns (equal width)", value: "1fr 1fr" },
  { label: "2 columns (25% - 75%)", value: "1fr 3fr" },
  { label: "3 columns (equal width)", value: "1fr 1fr 1fr" },
  { label: "3 columns (25% - 50% - 25%)", value: "1fr 2fr 1fr" },
  { label: "4 columns (equal width)", value: "1fr 1fr 1fr 1fr" },
];

function LayoutDialog({ editor }: { editor: LexicalEditor }) {
  const [formData, setFormData] = React.useState({
    layout: LAYOUTS[0].value,
  });

  const handleSubmit = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    editor.dispatchCommand(INSERT_LAYOUT_COMMAND, formData.layout);
    closeDialog();
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, {
      layout: { open: false },
    });
  };

  const handleClose = () => {
    closeDialog();
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup fullScreen="mobile">
        <DialogHeader>
          <DialogTitle>Insert Layout</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={css.form} noValidate onSubmit={handleSubmit}>
            <div>
              <RadioGroupLabel id="column-layout-group-label">
                Column Layout
              </RadioGroupLabel>
              <RadioGroup<string>
                aria-labelledby="column-layout-group-label"
                name="layouts"
                onValueChange={(layout) => setFormData({ ...formData, layout })}
                value={formData.layout}
              >
                {LAYOUTS.map(({ label, value }) => (
                  <RadioField key={value} label={label} value={value} />
                ))}
              </RadioGroup>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <ActionButton onClick={handleClose} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton onClick={handleSubmit} size="lg" variant="accent">
            Insert
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default memo(LayoutDialog);
