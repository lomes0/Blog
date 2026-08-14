"use client";
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { registerCodeHighlighting } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";

export default function CodeHighlightPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    /**
     * `./shikiTokenizer` is reached by `import()`, not a static import, and
     * that is load-bearing rather than tidy: Shiki's engine and every grammar
     * hang off that module, and a static import would put them in whatever
     * chunk this plugin lands in — which is every page that mounts an editor.
     * The grammars themselves are a second `import()` deeper still, so nothing
     * is fetched until a code node is actually tokenized.
     *
     * Registration is therefore async, and the effect can be torn down before
     * it lands. `cancelled` covers that; without it a fast unmount leaks a
     * highlighter on a dead editor.
     */
    void import("./shikiTokenizer").then(({ createShikiTokenizer }) => {
      if (cancelled) return;
      dispose = registerCodeHighlighting(editor, createShikiTokenizer(editor));
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [editor]);

  return null;
}
