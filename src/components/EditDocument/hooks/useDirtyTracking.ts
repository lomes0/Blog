import { useCallback, useEffect, useMemo, useRef } from "react";
import { debounce } from "@mui/material/utils";
import type { EditorState, LexicalEditor } from "lexical";
import type { RefObject } from "react";
import { actions, useDispatch } from "@/store";

/**
 * Live "unsaved changes" tracking for a single document tab.
 *
 * Keeps `ui.dirtyDocIds` in sync with the editor content so the Save button,
 * tab dots, and the save-state indicator all reflect reality while the user
 * types. "Dirty" is computed against the exact same baseline `saveToCloud`
 * uses (`lastSavedCloud`), so a tab is dirty iff a save would actually persist
 * something. Before the saved baseline is known (e.g. not yet loaded, or an
 * unauthenticated/local-only document), the editor's initial serialized
 * content captured on first change is used as the baseline instead.
 *
 * Returns an `onChange` handler to pass to ConnectedEditor. The underlying
 * OnChangePlugin already ignores selection-only updates, and the comparison is
 * debounced to avoid serializing large documents on every keystroke.
 */
export function useDirtyTracking(
  docId: string,
  savedBaselineRef: RefObject<string | null>,
) {
  const dispatch = useDispatch();
  const initialBaseline = useRef<string | null>(null);

  const evaluate = useMemo(
    () =>
      debounce((editor: LexicalEditor) => {
        const current = JSON.stringify(editor.getEditorState().toJSON());
        if (initialBaseline.current === null) {
          initialBaseline.current = current;
        }
        const baseline = savedBaselineRef.current ?? initialBaseline.current;
        if (current === baseline) {
          dispatch(actions.markDocClean(docId));
        } else {
          dispatch(actions.markDocDirty(docId));
        }
      }, 300),
    [dispatch, docId, savedBaselineRef],
  );

  useEffect(() => () => evaluate.clear(), [evaluate]);

  return useCallback(
    (_editorState: EditorState, editor: LexicalEditor) => {
      evaluate(editor);
    },
    [evaluate],
  );
}
