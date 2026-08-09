"use client";
import type { LexicalEditor } from "lexical";
import type { ChangeEvent } from "react";
import {
  INSERT_IMAGE_COMMAND,
  InsertImagePayload,
} from "@/editor/plugins/ImagePlugin";
import { memo, useEffect, useRef, useState } from "react";
import { isMimeType, mediaFileReader } from "@lexical/utils";
import { ImageNode } from "@/editor/nodes/ImageNode";
import { SET_DIALOGS_COMMAND } from "./commands";
import { getImageDimensions } from "@/editor/nodes/utils";
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
import { dismissRequest, FilePickerButton } from "./parts";
import * as css from "./styles.css";
import { FileUp } from "lucide-react";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { ICON_SIZE } from "@/theme/icons";

const ACCEPTABLE_IMAGE_TYPES = [
  "image/",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/webp",
];

function ImageDialog(
  { editor, node }: { editor: LexicalEditor; node: ImageNode | null },
) {
  const srcRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<InsertImagePayload>({
    src: "",
    altText: "",
    width: 0,
    height: 0,
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
        altText: "",
        width: 0,
        height: 0,
        showCaption: true,
        id: "",
        style: "",
      });
    }
  }, [node]);

  const updateFormData = async (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    if (name === "src") {
      try {
        const dimensions = await getImageDimensions(value);
        setFormData({ ...formData, ...dimensions, [name]: value });
      } catch {
        setFormData({ ...formData, [name]: value });
      }
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const loadImage = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const filesResult = await mediaFileReader(
      [...files],
      [ACCEPTABLE_IMAGE_TYPES].flatMap((x) => x),
    );
    for (const { file, result } of filesResult) {
      if (isMimeType(file, ACCEPTABLE_IMAGE_TYPES)) {
        try {
          const dimensions = await getImageDimensions(result);
          setFormData({
            ...formData,
            src: result,
            altText: files![0].name.replace(/\.[^/.]+$/, ""),
            ...dimensions,
          });
        } catch {
          setFormData({
            ...formData,
            src: result,
            altText: files![0].name.replace(/\.[^/.]+$/, ""),
          });
        }
      } else {
        editor.dispatchCommand(ANNOUNCE_COMMAND, {
          message: {
            title: "Uploading image failed",
            subtitle: "Unsupported file type",
          },
        });
      }
    }
  };

  const isDisabled = formData.src === "";

  const insertImage = (payload: InsertImagePayload) => {
    if (!node) editor.dispatchCommand(INSERT_IMAGE_COMMAND, payload);
    else editor.update(() => node.update(payload));
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { image: { open: false } });
  };

  const handleSubmit = async () => {
    insertImage(formData);
    closeDialog();
  };

  const handleClose = () => {
    closeDialog();
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup fullScreen="mobile" initialFocus={srcRef}>
        <DialogHeader>
          <DialogTitle>Insert Image</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form className={css.form} noValidate>
            <h3 className={css.sectionHeading}>From URL</h3>
            <TextField
              autoComplete="off"
              label="Image URL"
              name="src"
              onChange={updateFormData}
              ref={srcRef}
              type="url"
              value={formData.src}
            />
            <h3 className={css.sectionHeading}>From File</h3>
            <FilePickerButton
              accept="image/*"
              onFiles={(e) => loadImage(e.target.files)}
            >
              <FileUp size={ICON_SIZE.dense} />
              Upload File
            </FilePickerButton>
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
            disabled={isDisabled}
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

export default memo(ImageDialog);
