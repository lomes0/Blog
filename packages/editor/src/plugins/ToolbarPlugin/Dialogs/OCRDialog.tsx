"use client";
import { ClipboardPaste, FileUp } from "lucide-react";
import type { ChangeEvent } from "react";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  TextAreaField,
} from "../../../ui";
import {
  dismissRequest,
  FilePickerButton,
  IndeterminateProgress,
} from "./parts";
import * as css from "./styles.css";
import {
  $createParagraphNode,
  $createTextNode,
  $insertNodes,
  LexicalEditor,
} from "lexical";
import { useCallback, useState } from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import { Announcement } from "@/types";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { isMimeType } from "@lexical/utils";
import { ICON_SIZE } from "@/theme/icons";

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL;
const ACCEPTABLE_IMAGE_TYPES = [
  "image/",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/webp",
];

const OCRDialog: React.FC<{ editor: LexicalEditor }> = ({ editor }) => {
  const [formData, setFormData] = useState({ value: "" });
  const [loading, setLoading] = useState(false);

  const updateFormData = async (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData({ ...formData, [name]: value });
  };

  const annouunce = useCallback((announcement: Announcement) => {
    editor.dispatchCommand(ANNOUNCE_COMMAND, announcement);
  }, [editor]);

  const ocr = useCallback(async (blob: Blob) => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", blob);

      const response = await fetch(`${FASTAPI_URL}/pix2text`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(
          `Server responded with status ${response.status}`,
        );
      }
      const result = await response.json();
      return result.generated_text;
    } catch (error: unknown) {
      annouunce({
        message: {
          title: "Something went wrong",
          subtitle: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [annouunce]);

  const updateValue = useCallback(async (blob: Blob) => {
    const latex = await ocr(blob);
    if (!latex) return;
    setFormData({ ...formData, value: latex });
  }, [formData, ocr]);

  const handleFilesChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      event.target.value = "";
      if (isMimeType(file, ACCEPTABLE_IMAGE_TYPES)) {
        updateValue(file);
      } else {
        annouunce({
          message: {
            title: "Uploading image failed",
            subtitle: "Unsupported file type",
          },
        });
      }
    },
    [updateValue, annouunce],
  );

  const readFromClipboard = useCallback(async () => {
    try {
      window.focus();
      const clipboardItem = await navigator.clipboard.read();
      if (!clipboardItem) {
        throw new Error("Clipboard is empty");
      }
      const data = await clipboardItem[0].getType("image/png").catch(
        (_err) => {
          throw new Error("Clipboard item is not an image");
        },
      );
      updateValue(data);
    } catch (err: unknown) {
      annouunce({
        message: {
          title: "Reading image failed",
          subtitle: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }, [updateValue, annouunce]);

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { ocr: { open: false } });
  };

  const handleSubmit = async () => {
    const { value } = formData;
    editor.update(() => {
      const nodes = value.split("\n").map((line) => {
        const textNode = $createTextNode(line);
        const paragraphNode = $createParagraphNode().append(textNode);
        return paragraphNode;
      });
      $insertNodes(nodes);
    });
    closeDialog();
  };

  return (
    <Dialog
      open
      onOpenChange={dismissRequest(closeDialog, { escapeCloses: true })}
    >
      <DialogPopup size="lg">
        <DialogHeader>
          <DialogTitle>Image to Text</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={css.form}>
            <div className={css.inlineRow}>
              <FilePickerButton
                accept="image/*"
                disabled={loading}
                onFiles={handleFilesChange}
              >
                <FileUp size={ICON_SIZE.dense} />
                Upload Image
              </FilePickerButton>
              <ActionButton
                disabled={loading}
                onClick={readFromClipboard}
                size="lg"
                variant="outline"
              >
                <ClipboardPaste size={ICON_SIZE.dense} />
                Paste from Clipboard
              </ActionButton>
            </div>
            <TextAreaField
              disabled={loading}
              id="value"
              label="Result"
              name="value"
              onChange={updateFormData}
              value={formData.value}
            />
            <IndeterminateProgress active={loading} />
          </div>
        </DialogBody>
        <DialogFooter>
          <ActionButton onClick={closeDialog} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton
            disabled={loading}
            onClick={handleSubmit}
            size="lg"
            variant="accent"
          >
            Save
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};

export default OCRDialog;
