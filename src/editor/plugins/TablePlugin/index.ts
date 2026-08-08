/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { JSX } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  registerTablePlugin,
  registerTableSelectionObserver,
} from "@lexical/table";
import { useEffect } from "react";

/**
 * A plugin to enable all of the features of Lexical's TableNode.
 *
 * These used to be a vendored copy of `@lexical/table`'s helpers, whose only
 * local change was importing our `TableNode`/`TableCellNode` subclasses so the
 * mutation listener and transforms would find them. At 0.49 that copy is no
 * longer maintainable: `applyTableHandlers` now takes a `TableObservers`
 * registry, and the pointerdown handling that starts a cell selection moved
 * into `registerTableWindowHandlers` — neither is exported from the package.
 * Instead `config.tsx` declares `withKlass` on the table replacement entries,
 * which makes upstream's `TableNode`/`TableCellNode` resolve to our subclasses
 * (`resolveRegisteredNodeAfterReplacements`), so the published helpers drive
 * our nodes directly.
 *
 * @param props - See type for documentation
 * @returns An element to render in your LexicalComposer
 */
export function TablePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => registerTablePlugin(editor), [editor]);

  useEffect(() => registerTableSelectionObserver(editor, true), [editor]);

  return null;
}
