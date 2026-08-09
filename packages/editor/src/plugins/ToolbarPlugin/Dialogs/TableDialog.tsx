"use client";
import type { LexicalEditor } from "lexical";
import { INSERT_TABLE_COMMAND } from "@/editor/nodes/TableNode";
import React, { memo, useRef, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  NumberStepperField,
  StepperButton,
  SwitchField,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";
import { Minus, Plus } from "lucide-react";
import { ICON_SIZE } from "@/theme/icons";

const initialFormData = { rows: "3", columns: "3", includeHeaders: true };

function TableDialog({ editor }: { editor: LexicalEditor }) {
  const [formData, setFormData] = useState(initialFormData);
  const rowsRef = useRef<HTMLInputElement>(null);

  const setRows = (rows: number) => {
    setFormData({ ...formData, rows: Math.max(1, rows).toString() });
  };
  const setColumns = (columns: number) => {
    setFormData({ ...formData, columns: Math.max(1, columns).toString() });
  };
  const handleSubmit = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    editor.dispatchCommand(INSERT_TABLE_COMMAND, formData);
    closeDialog();
    setTimeout(() => {
      editor.focus();
    }, 0);
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { table: { open: false } });
    setFormData(initialFormData);
  };

  const handleClose = () => {
    closeDialog();
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup initialFocus={rowsRef}>
        <DialogHeader>
          <DialogTitle>Insert Table</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={css.form} noValidate onSubmit={handleSubmit}>
            <NumberStepperField
              decrement={
                <StepperButton
                  aria-label="One fewer row"
                  onClick={() => setRows(+formData.rows - 1)}
                >
                  <Minus size={ICON_SIZE.dense} />
                </StepperButton>
              }
              increment={
                <StepperButton
                  aria-label="One more row"
                  onClick={() => setRows(+formData.rows + 1)}
                >
                  <Plus size={ICON_SIZE.dense} />
                </StepperButton>
              }
              label="Rows"
              name="rows"
              onChange={(e) => setRows(+e.target.value)}
              ref={rowsRef}
              type="number"
              value={formData.rows}
            />
            <NumberStepperField
              decrement={
                <StepperButton
                  aria-label="One fewer column"
                  onClick={() => setColumns(+formData.columns - 1)}
                >
                  <Minus size={ICON_SIZE.dense} />
                </StepperButton>
              }
              increment={
                <StepperButton
                  aria-label="One more column"
                  onClick={() => setColumns(+formData.columns + 1)}
                >
                  <Plus size={ICON_SIZE.dense} />
                </StepperButton>
              }
              label="Columns"
              name="columns"
              onChange={(e) => setColumns(+e.target.value)}
              type="number"
              value={formData.columns}
            />
            <SwitchField
              checked={formData.includeHeaders}
              label="Include Headers"
              onCheckedChange={(includeHeaders) =>
                setFormData({ ...formData, includeHeaders })}
            />
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

export default memo(TableDialog);
