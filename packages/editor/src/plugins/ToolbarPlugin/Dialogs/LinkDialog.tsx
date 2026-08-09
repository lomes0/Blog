"use client";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  isHTMLElement,
  LexicalEditor,
} from "lexical";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SET_DIALOGS_COMMAND } from "./commands";
import {
  ActionButton,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  FieldLabelText,
  RadioField,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextField,
} from "../../../ui";
import { dismissRequest } from "./parts";
import * as css from "./styles.css";
import { type LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { Unlink } from "lucide-react";
import { $isImageNode } from "@/editor/nodes/ImageNode";
import { $isMathNode } from "@/editor/nodes/MathNode";
import { $isTableNode } from "@/editor/nodes/TableNode";
import { getEditorNodes } from "@/editor/utils/getEditorNodes";
import { ICON_SIZE } from "@/theme/icons";

function LinkDialog(
  { editor, node }: { editor: LexicalEditor; node: LinkNode | null },
) {
  const [url, setUrl] = useState<string>("https://");
  const [rel, setRel] = useState<string | null>("external");
  const [target, setTarget] = useState<string | null>("_blank");
  const [figure, setFigure] = useState<string>("self");
  const urlRef = useRef<HTMLInputElement>(null);

  const figures = useMemo(() => {
    const editorState = editor.getEditorState();
    const nodes = editorState.read(() =>
      getEditorNodes(editor).filter((node) =>
        $isImageNode(node) || $isMathNode(node) || $isTableNode(node)
      )
    );
    type ContentEditableEl = HTMLElement & { __lexicalEditor?: LexicalEditor };
    const editors = [
      ...document.querySelectorAll<ContentEditableEl>(
        '[contenteditable="true"]',
      ),
    ].map((el) => el.__lexicalEditor).filter(Boolean) as LexicalEditor[];
    return nodes.reduce((map, node) => {
      const ownerEditor = editors.find((editor) =>
        editor._editorState._nodeMap.has(node.getKey())
      );
      if (!ownerEditor) return map;
      const element = $isTableNode(node)
        ? ownerEditor.getElementByKey(node.getKey())
        : node.exportDOM(ownerEditor).element;
      if (!isHTMLElement(element)) return map;
      map.set(node.getKey(), element);
      return map;
    }, new Map());
  }, [editor]);

  useEffect(() => {
    setUrl(node?.__url ?? "https://");
    setRel(node?.__rel ?? "external");
    setTarget(node?.__target ?? "_blank");
    if (node?.__rel === "bookmark") {
      const id = node.__url.slice(1);
      const figureKey = [...figures.entries()].find(([_key, element]) =>
        element.id === id
      )?.[0];
      const target = node.__target;
      const figure = figureKey
        ? figureKey
        : target === "_self"
        ? "self"
        : "none";
      setFigure(figure);
    }
  }, [node, figures]);

  const updateUrl = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    const url = rel === "bookmark"
      ? value.toLowerCase().padStart(1, "#")
      : value;
    setUrl(url);
  };

  const updateRel = (value: string) => {
    setRel(value);
    const nodeRel = node?.__rel ?? "external";
    const defaultUrl = value === "bookmark" ? getBookmarkUrl() : "https://";
    const nodeUrl = node?.__url ?? defaultUrl;
    const url = value === nodeRel ? nodeUrl : defaultUrl;
    setUrl(url);
    const target = value === "external"
      ? "_blank"
      : figure === "self"
      ? "_self"
      : null;
    setTarget(target);
  };

  const updateFigure = (value: string | null) => {
    if (value === null) return;
    setFigure(value);
    if (value === "self") setTarget("_self");
    else setTarget(null);
  };

  // Widened to SyntheticEvent because this is both the Button's onClick and the
  // popup's own onSubmit — `DialogPopup` is rendered as a `<form>`, so React
  // hands the handler a SubmitEvent while the buttons hand it a MouseEvent.
  // preventDefault is all this needs, and every synthetic event has it.
  const handleSubmit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (rel === "bookmark" && figure) setNodeId(figure, url.slice(1));
    if (!node) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url, rel, target });
    } else {editor.update(() => {
        node.setURL(url);
        node.setRel(rel);
        node.setTarget(target);
      });}
    closeDialog();
    setTimeout(() => {
      editor.focus();
    }, 0);
  };

  const closeDialog = () => {
    editor.dispatchCommand(SET_DIALOGS_COMMAND, { link: { open: false } });
  };

  const handleClose = () => {
    closeDialog();
  };

  const handleDelete = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    closeDialog();
  };

  const getBookmarkUrl = useCallback(() => {
    return editor.getEditorState().read(() => {
      if (node && node.getRel() === "bookmark") {
        return decodeURIComponent(node.getURL());
      }
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return "#";
      const textContent = selection.isCollapsed()
        ? selection.focus.getNode().getTextContent()
        : selection.getTextContent();
      return `#${textContent.trim()}`;
    });
  }, [editor, node]);

  const setNodeId = (key: string, id: string) => {
    type ContentEditableEl = HTMLElement & { __lexicalEditor?: LexicalEditor };
    const editors = [
      ...document.querySelectorAll<ContentEditableEl>(
        '[contenteditable="true"]',
      ),
    ].map((el) => el.__lexicalEditor).filter(Boolean) as LexicalEditor[];
    const previousFigureKey = [...figures.entries()].find(([k, element]) =>
      element.id === id && k !== key
    )?.[0];
    const previousEditor = editors.find((editor) =>
      editor._editorState._nodeMap.has(previousFigureKey)
    );
    if (previousEditor) {
      previousEditor.update(() => {
        const node = $getNodeByKey(previousFigureKey);
        if (
          !($isImageNode(node) || $isMathNode(node) ||
            $isTableNode(node))
        ) return;
        node.setId("");
      });
    }
    const currentEditor = editors.find((editor) =>
      editor._editorState._nodeMap.has(key)
    );
    if (!currentEditor) return;
    currentEditor.update(() => {
      const node = $getNodeByKey(key);
      if (
        !($isImageNode(node) || $isMathNode(node) || $isTableNode(node))
      ) return;
      node.setId(id);
    });
  };

  const figurePreview = (key: string) => {
    if (key === "self") return <>Self</>;
    if (key === "none") return <>None</>;
    return (
      <span
        className={css.figurePreview}
        dangerouslySetInnerHTML={{ __html: figures.get(key).outerHTML }}
      />
    );
  };

  return (
    <Dialog open onOpenChange={dismissRequest(handleClose)}>
      <DialogPopup
        initialFocus={urlRef}
        render={<form onSubmit={handleSubmit} />}
        size="md"
      >
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className={css.form}>
            <RadioGroup<string>
              aria-label="Link kind"
              onValueChange={updateRel}
              row
              value={rel ?? "external"}
            >
              <RadioField label="External" value="external" />
              <RadioField label="Internal" value="bookmark" />
            </RadioGroup>
            <TextField
              autoComplete="off"
              label="URL"
              onChange={updateUrl}
              ref={urlRef}
              value={url}
            />
            {rel === "bookmark" && (
              <div className={css.form}>
                <FieldLabelText id="link-figure-label">Figure</FieldLabelText>
                <Select<string> onValueChange={updateFigure} value={figure}>
                  <SelectTrigger aria-labelledby="link-figure-label">
                    <SelectValue>
                      {(value: string | null) =>
                        value ? figurePreview(value) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Self</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                    {[...figures.keys()].map((key) => (
                      <SelectItem key={key} value={key}>
                        {figurePreview(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {node && (
            <ActionButton
              className={css.footerStart}
              danger
              onClick={handleDelete}
              size="lg"
              variant="outline"
            >
              <Unlink size={ICON_SIZE.dense} />
              Unlink
            </ActionButton>
          )}
          <ActionButton onClick={handleClose} size="lg" variant="outline">
            Cancel
          </ActionButton>
          <ActionButton
            disabled={!url}
            onClick={handleSubmit}
            size="lg"
            type="submit"
            variant="accent"
          >
            Confirm
          </ActionButton>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export default memo(LinkDialog);
