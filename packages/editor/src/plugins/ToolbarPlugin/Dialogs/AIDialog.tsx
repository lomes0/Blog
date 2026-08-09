"use client";
import type { LexicalEditor } from "lexical";
import React, { memo, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Badge,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  FieldLabelText,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";
import { useAIModel } from "@/contexts/AIModelContext";
import { AI_MODELS } from "@/lib/ai";

function AIDialog({ editor }: { editor: LexicalEditor }) {
  const { llm, setLlm } = useAIModel();
  const [formData, setFormData] = useState(llm);

  const handleSubmit = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setLlm(formData);
    closeDialog();
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { ai: { open: false } });
  };

  const handleClose = () => {
    closeDialog();
  };

  const selectModel = (id: string | null) => {
    const model = AI_MODELS.find((candidate) => candidate.id === id);
    if (!model) return;
    setFormData({ provider: model.provider, model: model.id });
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Configure AI Models</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={css.form} noValidate onSubmit={handleSubmit}>
            <div className={css.form}>
              <FieldLabelText id="ai-model-label">
                Language Model
              </FieldLabelText>
              <Select<string>
                onValueChange={selectModel}
                value={formData.model}
              >
                <SelectTrigger aria-labelledby="ai-model-label">
                  <SelectValue>
                    {(value: string | null) =>
                      AI_MODELS.find((model) => model.id === value)?.name ??
                        value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className={css.modelRow}>
                        <span className={css.modelName}>{model.name}</span>
                        {model.metadata?.fast && (
                          <Badge size="sm" variant="success">Fast</Badge>
                        )}
                        {model.metadata?.reason && (
                          <Badge size="sm" variant="warning">Reason</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <ActionButton onClick={handleClose} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton onClick={handleSubmit} size="lg" variant="accent">
            Save
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default memo(AIDialog);
