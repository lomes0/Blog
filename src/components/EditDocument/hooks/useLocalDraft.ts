import { useCallback, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { EditorState, LexicalEditor } from "lexical";
import type { RefObject } from "react";
import { actions, useDispatch } from "@/store";

/**
 * Preserves unsaved edits as a local draft when the editor unmounts (e.g. when
 * navigating from edit → view).
 *
 * The current editor content is written to the LOCAL IndexedDB document with a
 * fresh `head`, so it diverges from the cloud head. The cloud is left
 * untouched, which means:
 *
 *  - `view` keeps rendering the last saved (cloud) revision.
 *  - On the next visit to edit mode, `useDocumentLoader` sees
 *    `localHead !== cloudHead`, loads the local draft into the editor, keeps the
 *    cloud content as the saved baseline, and re-marks the tab dirty — so the
 *    unsaved version is shown again and can still be saved to the cloud.
 *
 * Returns an `onChange` handler to compose with the other editor change
 * handlers. It only stashes the latest editor state on each change (cheap,
 * no serialization) and serializes once on unmount. Because Lexical's
 * `OnChangePlugin` ignores the initial change, the stash stays empty until the
 * user genuinely edits, so navigating away without editing leaves the local
 * revision exactly as it was.
 */
export function useLocalDraft(
  docId: string,
  savedBaselineRef: RefObject<string | null>,
) {
  const dispatch = useDispatch();
  const latestStateRef = useRef<EditorState | null>(null);

  const track = useCallback((_state: EditorState, editor: LexicalEditor) => {
    latestStateRef.current = editor.getEditorState();
  }, []);

  // Stable cleanup that always reads the latest refs at unmount time.
  const persistRef = useRef<() => void>(() => {});
  persistRef.current = () => {
    const state = latestStateRef.current;
    if (!state) return; // user never edited — nothing to preserve

    const data = state.toJSON();
    const serialized = JSON.stringify(data);
    const baseline = savedBaselineRef.current;

    // When the saved (cloud) baseline is known and matches the current content,
    // there are no unsaved changes — leave the local revision as is.
    if (baseline !== null && serialized === baseline) return;

    dispatch(
      actions.updateLocalDocument({
        id: docId,
        partial: {
          data,
          head: uuidv4(),
          updatedAt: new Date().toISOString(),
        },
      }),
    );
  };

  useEffect(() => () => persistRef.current(), []);

  return track;
}
