"use client";
import type { LexicalEditor, RangeSelection } from "lexical";
import { $createCodeNode } from "@lexical/code";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getPreviousSelection,
  $getSelection,
  $isRangeSelection,
  $setSelection,
} from "lexical";

import {
  AlignLeft,
  Code,
  List,
  ListChecks,
  ListOrdered,
  Quote,
} from "lucide-react";
import { $isTableSelection } from "@/editor/nodes/TableNode";
import { ReactNode, useCallback } from "react";
import { ICON_SIZE } from "@/theme/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/editor/ui";
import * as css from "./menus.css";

const HeadingGlyph = ({ path }: { path: string }) => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    height={ICON_SIZE.dense}
    viewBox="0 96 960 960"
    width={ICON_SIZE.dense}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d={path} />
  </svg>
);

const H1 = () => (
  <HeadingGlyph path="M200 776V376h60v170h180V376h60v400h-60V606H260v170h-60Zm500 0V436h-80v-60h140v400h-60Z" />
);
const H2 = () => (
  <HeadingGlyph path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm420 0V606q0-24.75 17.625-42.375T600 546h180V436H540v-60h240q25 0 42.5 17.625T840 436v110q0 24.75-17.625 42.375T780 606H600v110h240v60H540Z" />
);
const H3 = () => (
  <HeadingGlyph path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm420 0v-60h240V606H620v-60h160V436H540v-60h240q25 0 42.5 17.625T840 436v280q0 24.75-17.625 42.375T780 776H540Z" />
);
const H4 = () => (
  <HeadingGlyph path="M120 776V376h60v170h180V376h60v400h-60V606H180v170h-60Zm620 0V646H540V376h60v210h140V376h60v210h80v60h-80v130h-60Z" />
);

export type BlockType =
  | "bullet"
  | "check"
  | "code"
  | "quote"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "number"
  | "paragraph";

/**
 * One list, read by both the trigger and the popup.
 *
 * MUI let the trigger re-render the selected `MenuItem`'s children, so the two
 * could not drift; Base UI's `Select.Value` renders whatever it is given, so
 * the shared table is what keeps that property.
 */
const BLOCK_OPTIONS: ReadonlyArray<
  { value: BlockType; label: string; icon: ReactNode }
> = [
  { value: "paragraph", label: "Normal", icon: <AlignLeft size={ICON_SIZE.dense} /> },
  { value: "h1", label: "Heading 1", icon: <H1 /> },
  { value: "h2", label: "Heading 2", icon: <H2 /> },
  { value: "h3", label: "Heading 3", icon: <H3 /> },
  { value: "h4", label: "Heading 4", icon: <H4 /> },
  { value: "bullet", label: "Bullet List", icon: <List size={ICON_SIZE.dense} /> },
  { value: "number", label: "Numbered List", icon: <ListOrdered size={ICON_SIZE.dense} /> },
  { value: "check", label: "Check List", icon: <ListChecks size={ICON_SIZE.dense} /> },
  { value: "quote", label: "Quote", icon: <Quote size={ICON_SIZE.dense} /> },
  { value: "code", label: "CodeBlock", icon: <Code size={ICON_SIZE.dense} /> },
];

export function BlockFormatSelect({ editor, blockType }: {
  blockType: BlockType;
  editor: LexicalEditor;
}) {
  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if (
        $isRangeSelection(selection) ||
        $isTableSelection(selection)
      ) {
        $setBlocksType(
          selection as RangeSelection,
          () => $createParagraphNode(),
        );
      }
    });
  };

  const formatHeading = (headingSize: HeadingTagType) => {
    if (blockType !== headingSize) {
      editor.update(() => {
        const selection = $getSelection();
        if (
          $isRangeSelection(selection) ||
          $isTableSelection(selection)
        ) {
          $setBlocksType(
            selection as RangeSelection,
            () => $createHeadingNode(headingSize),
          );
        }
      });
    }
  };

  const formatBulletList = () => {
    if (blockType !== "bullet") {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatCheckList = () => {
    if (blockType !== "check") {
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatNumberedList = () => {
    if (blockType !== "number") {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      formatParagraph();
    }
  };

  const formatQuote = () => {
    if (blockType !== "quote") {
      editor.update(() => {
        const selection = $getSelection();
        if (
          $isRangeSelection(selection) ||
          $isTableSelection(selection)
        ) {
          $setBlocksType(selection as RangeSelection, () => $createQuoteNode());
        }
      });
    }
  };

  const formatCode = () => {
    if (blockType !== "code") {
      editor.update(() => {
        let selection = $getSelection();

        if (
          $isRangeSelection(selection) ||
          $isTableSelection(selection)
        ) {
          if (selection.isCollapsed()) {
            $setBlocksType(
              selection as RangeSelection,
              () => $createCodeNode(),
            );
          } else {
            const textContent = selection.getTextContent();
            const codeNode = $createCodeNode();
            selection.insertNodes([codeNode]);
            selection = $getSelection();
            if ($isRangeSelection(selection)) {
              selection.insertRawText(textContent);
            }
          }
        }
      });
    }
  };

  /**
   * Every one of the formatters above runs against `$getSelection()`, which
   * outlives the popup — but DOM focus does not, so it has to be put back or
   * the caret vanishes after every use. Unchanged from the MUI version, and
   * still deferred a tick: the format update has to land before the selection
   * it produced is cloned forward.
   */
  const restoreFocus = useCallback(() => {
    setTimeout(() => {
      editor.update(() => {
        const selection = $getSelection() || $getPreviousSelection();
        if (!selection) return;
        $setSelection(selection.clone());
      }, {
        discrete: true,
        onUpdate() {
          editor.focus(undefined, { defaultSelection: "rootStart" });
        },
      });
    }, 0);
  }, [editor]);

  const applyBlockType = (next: BlockType | null) => {
    switch (next) {
      case "paragraph":
        return formatParagraph();
      case "h1":
      case "h2":
      case "h3":
      case "h4":
        return formatHeading(next);
      case "bullet":
        return formatBulletList();
      case "number":
        return formatNumberedList();
      case "check":
        return formatCheckList();
      case "quote":
        return formatQuote();
      case "code":
        return formatCode();
      default:
        return;
    }
  };

  return (
    <Select<BlockType>
      onOpenChange={(open) => {
        if (!open) restoreFocus();
      }}
      onValueChange={applyBlockType}
      value={blockType}
    >
      <SelectTrigger aria-label="block type" className={css.selectTrigger}>
        <SelectValue className={css.triggerValue}>
          {(value: BlockType | null) => {
            const option = BLOCK_OPTIONS.find((entry) => entry.value === value);
            if (!option) return null;
            return (
              <>
                <span className={css.optionIcon}>{option.icon}</span>
                <span className={css.triggerLabel}>{option.label}</span>
              </>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      {/*
        `alignItemWithTrigger` would slide the popup so the selected row sits
        over the trigger, which is Base UI's native-`<select>` behaviour and not
        what this control had: MUI's outlined `Select` drops its menu below the
        field. `finalFocus={false}` because focus belongs to the editor when
        this closes, not to the trigger — `restoreFocus` is the only thing that
        should decide, and letting Base UI also aim at the trigger makes the two
        race.
      */}
      <SelectContent
        alignItemWithTrigger={false}
        className={css.popupSurface}
        finalFocus={false}
      >
        {BLOCK_OPTIONS.map((option) => (
          <SelectItem key={option.value} label={option.label} value={option.value}>
            <span className={css.optionIcon}>{option.icon}</span>
            <span className={css.optionLabel}>{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
