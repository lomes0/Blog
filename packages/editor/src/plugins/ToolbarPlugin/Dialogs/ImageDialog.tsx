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
import { blobSrcOrFallback } from "@/editor/utils/uploadBlob";
import { useEditorDocumentId } from "@/editor/context/DocumentContext";
import {
  ActionButton,
  cx,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  Spinner,
  SwitchField,
  TextField,
} from "../../../ui";
import { dismissRequest, FilePickerButton } from "./parts";
import * as css from "./styles.css";
import { FileUp, ImageIcon, ImageOff } from "lucide-react";
import { ANNOUNCE_COMMAND } from "@/editor/commands";
import { ICON_SIZE } from "@/theme/icons";
import { isSafeImageSrc } from "@/editor/utils/imageSrc";

const ACCEPTABLE_IMAGE_TYPES = [
  "image/",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/webp",
];

/**
 * What the box under the URL field is showing.
 *
 * `empty` is a state and not the absence of one: the dialog is where an image
 * is *replaced*, and a reader who has pasted a URL needs to see that something
 * is being fetched, that it failed, or what arrived — DESIGN.md §9.
 */
type PreviewState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "loaded"; src: string; width: number; height: number };

function ImageDialog(
  { editor, node }: { editor: LexicalEditor; node: ImageNode | null },
) {
  const srcRef = useRef<HTMLInputElement>(null);
  // This editor's document, not the focused one: in a split both are mounted.
  const documentId = useEditorDocumentId();
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
        // Store the bytes once and reference them, rather than embedding the
        // data URI in every future revision (blob-storage.md §6). Falls back to
        // `result` when there is nothing to upload to — a guest draft, say.
        const src = await blobSrcOrFallback(file, result, documentId);
        try {
          const dimensions = await getImageDimensions(result);
          setFormData({
            ...formData,
            src,
            altText: files![0].name.replace(/\.[^/.]+$/, ""),
            ...dimensions,
          });
        } catch {
          setFormData({
            ...formData,
            src,
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

  const [preview, setPreview] = useState<PreviewState>({ status: "empty" });

  /**
   * Probe the src for a thumbnail, in the shape of haklex's `ReplacePanel`
   * — which shows the reader what they are about to commit instead of making
   * them confirm a URL and find out afterwards.
   *
   * This is a second `Image()` load beside the one `updateFormData` already
   * runs, and deliberately so: that one exists to *write* width and height
   * into the form, and it must stay on the keystroke path. Moving it here
   * would make it run on mount too, and re-probing an image the reader had
   * resized would silently reset the stored size to the intrinsic one the next
   * time they opened this dialog. The browser serves the second load from
   * cache.
   */
  useEffect(() => {
    const src = formData.src.trim();
    if (!src) {
      setPreview({ status: "empty" });
      return;
    }
    if (!isSafeImageSrc(src)) {
      setPreview({ status: "error", reason: "That is not an image address" });
      return;
    }
    setPreview({ status: "loading" });
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      setPreview({
        status: "loaded",
        src,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    };
    image.onerror = () => {
      if (cancelled) return;
      setPreview({ status: "error", reason: "This image could not be loaded" });
    };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [formData.src]);

  // An unsafe src is refused here rather than at the toolbar, so a `javascript:`
  // URL never reaches the node in the first place.
  const isDisabled = formData.src === "" || !isSafeImageSrc(formData.src);

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
            <div
              aria-live="polite"
              className={cx(
                css.previewFrame,
                preview.status === "loaded" && css.previewFrameLoaded,
              )}
            >
              {preview.status === "empty" && (
                <>
                  <ImageIcon aria-hidden size={ICON_SIZE.large} />
                  <span>The image appears here</span>
                </>
              )}
              {preview.status === "loading" && (
                <>
                  <Spinner size="md" />
                  <span>Loading preview…</span>
                </>
              )}
              {preview.status === "error" && (
                <>
                  <ImageOff aria-hidden size={ICON_SIZE.large} />
                  <span className={css.previewError}>{preview.reason}</span>
                </>
              )}
              {preview.status === "loaded" && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={formData.altText || "Preview"}
                    className={css.previewImage}
                    src={preview.src}
                  />
                  <span className={css.previewMeta}>
                    {preview.width} × {preview.height}
                  </span>
                </>
              )}
            </div>
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
