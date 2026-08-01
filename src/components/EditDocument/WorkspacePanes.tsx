"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import {
  actions,
  postsSelectors,
  useDispatch,
  useSelector,
  useStore,
} from "@/store";
import type { RootState } from "@/store";
import {
  selectFocusedDocId,
  selectPaneShowingDoc,
} from "@/store/selectors/layoutSelectors";
import { workspaceUrlForFocus } from "@/lib/workspaceUrl";
import { useDragCapture } from "@/hooks/useResizablePanel";
import ResizeGripper, { GRIPPER_W } from "@/components/Layout/ResizeGripper";
import {
  DEFAULT_PANE_RATIO,
  MAX_PANE_RATIO,
  MIN_PANE_RATIO,
  type WorkspacePane,
} from "@/types";
import {
  flushWorkspaceWrite,
  readStoredWorkspace,
  readWorkspaceKeyHint,
} from "@/store/workspacePersistence";
import TabbedDocumentEditor from "./TabbedDocumentEditor";

/** One arrow-key press on the focused splitter. */
const RATIO_STEP = 0.02;

interface PaneFrameProps {
  pane: WorkspacePane;
  isFocused: boolean;
  /** False when this is the only pane — no chrome, no independent scroller. */
  isSplit: boolean;
  /** Share of the row, as a flex-grow factor. Ignored when not split. */
  grow: number;
}

/**
 * One viewport, plus the chrome that says which one it is.
 *
 * **Focus is DOM focus.** `onFocusCapture` fires for anything focusable inside
 * the pane — the `contenteditable`, a toolbar button, a tab — and
 * `onPointerDownCapture` covers a click that lands on something unfocusable
 * (padding, a heading) and would otherwise leave focus where it was. Both are
 * capture-phase so a handler inside the pane that stops propagation cannot make
 * the pane un-focusable.
 *
 * That is the keystone of plan §5.1: "active" used to mean *visible*, which is
 * unanswerable with two panes on screen at once. What must be singular — the
 * `<title>`, the `ActiveEditorContext` ref the Copilot writes through — keys off
 * the focused pane instead, and `EditorTabPanel` is where they are gated. The
 * formatting toolbar is no longer among them: each pane hosts its own in its
 * header, so the unfocused half of a split stays editable.
 */
const PaneFrame: React.FC<PaneFrameProps> = ({
  pane,
  isFocused,
  isSplit,
  grow,
}) => {
  const dispatch = useDispatch();
  const docId = pane.activeTabId ?? pane.rootId;
  const title = useSelector(
    (state: RootState) =>
      postsSelectors.selectById(state, docId)?.name ?? "Untitled",
  );

  const activate = useCallback(() => {
    if (!isFocused) dispatch(actions.focusPane(pane.id));
  }, [dispatch, isFocused, pane.id]);

  const editor = <TabbedDocumentEditor paneId={pane.id} rootId={pane.rootId} />;

  // Unsplit is the overwhelmingly common case and must render exactly as it did
  // before split view existed: no wrapper, no second scroller, the page's own
  // container scrolling the document.
  if (!isSplit) return editor;

  return (
    <Box
      id={`pane-${pane.id}`}
      role="group"
      aria-label={`${title} pane`}
      onFocusCapture={activate}
      onPointerDownCapture={activate}
      sx={{
        flex: `${grow} 1 0`,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        // Each pane scrolls its own document. Only reachable while split — see
        // the early return above.
        overflow: "hidden",
      }}
    >
      {
        /* No header row. The pane's name, its close button and the §17.3 accent
          that marks it focused all used to be drawn here, above a pane whose
          tabs were somewhere else entirely — in the app top bar. They are the
          header's now (`PaneHeader`), which sticks to the top of this
          scroller and so occupies the same line this row did. */
      }
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 1 }}>
        {editor}
      </Box>
    </Box>
  );
};

interface WorkspacePanesProps {
  /** The document named by the URL — the deep-link seam's answer. */
  rootId: string;
}

/**
 * The workspace's pane row: the layout half of plan §5.
 *
 * `EditorTabPanel` has always mounted a complete `ConnectedEditor` per open
 * document, all of them at once, hidden with `display: none` so undo history
 * survives a tab switch (§1.1). Split view does not add editors; it stops
 * hiding one of them. Two things follow from that:
 *
 * - **The `display: none` inside a pane stays.** Only the pane-level hiding
 *   goes away. Unmounting an inactive tab to save memory would throw away the
 *   undo stack that `display: none` was chosen to keep (§5.4).
 * - **Panes come from the store, not from this component.** It owns no pane id.
 *   The URL is one input among several — a sidebar click, the palette and the
 *   Copilot all dispatch `openPane` directly, and the reducer decides whether
 *   that retargets the focused pane or focuses the one already showing it.
 */
const WorkspacePanes: React.FC<WorkspacePanesProps> = ({ rootId }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const panes = useSelector((state: RootState) => state.ui.workspace.panes);
  const focusedPaneId = useSelector(
    (state: RootState) => state.ui.workspace.focusedPaneId,
  );
  const ratio = useSelector(
    (state: RootState) => state.ui.workspace.splitRatio,
  );
  const hydrated = useSelector(
    (state: RootState) => state.ui.workspaceHydrated,
  );

  // Read the layout back (plan §8.2). Kicked off here rather than in the app
  // layout because panes are a fact about *this* route: restoring them in the
  // shell would leave `/posts` and the home pane believing a document is open,
  // which is what `selectFocusedDocId` answers for the Copilot.
  //
  // Runs whenever the flag is down — which is on entry, and again if the
  // session turns out to belong to a different user than the key this guessed
  // (`workspaceKeyChanged`). `restoreWorkspace` is itself idempotent, so a
  // second read landing late is a no-op rather than a clobber.
  useEffect(() => {
    if (hydrated) return;
    let cancelled = false;
    const key = readWorkspaceKeyHint();
    void readStoredWorkspace(key).then((stored) => {
      if (cancelled) return;
      dispatch(actions.restoreWorkspace({ key, stored }));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, hydrated]);

  // The deep-link seam. `openPane` with no pane id means "show this where I am
  // looking": it retargets the focused pane, or mints the first one. On a URL
  // naming a document the other pane already holds it focuses that pane and
  // leaves both alone, which is the duplicate-open guard doing its job.
  //
  // Gated on the restore, and gated on `workspaceHydrated` rather than on
  // `ui.initialized`: the latter is the end of the `load` bootstrap, which
  // awaits the session, the posts and the series over the network, and the
  // editor's first paint must not wait on any of that. The gate is what closes
  // the race — the dispatch is deferred until the layout is in, not fired on
  // mount and then overwritten by it — and replaying through `openPane` rather
  // than through a second restore-aware path is what makes the two outcomes the
  // reducer's to decide: a URL naming a restored pane's document focuses that
  // pane, and any other URL retargets the focused one and leaves its neighbour.
  //
  // The projection back out — plan §0's other direction — is folded into the
  // *same* effect on purpose. It has to run after the replay above: on the
  // commit where the restore lands, a stored layout can name a different
  // focused pane than the URL does, and the URL wins. Reading state only after
  // `openPane` has settled that is what makes the first pass a no-op instead of
  // a race, and keeping the two in one effect means a later edit cannot reorder
  // them apart.
  //
  // From then on it is `store.subscribe`, not a dependency on a selected value,
  // for the same reason: the answer must be read at the moment of acting.
  // `workspaceUrlForFocus` refuses on every input that is not a genuine focus
  // change, so the listener is a handful of comparisons on almost every action.
  useEffect(() => {
    if (!hydrated) return;
    dispatch(actions.openPane({ rootId }));

    const project = () => {
      const state = store.getState();
      const next = workspaceUrlForFocus({
        // The address bar rather than `usePathname()`: this is the value being
        // overwritten, and it is also how the "only on /edit" guard stays true
        // in the beat between a navigation away and this component unmounting.
        currentPath: window.location.pathname,
        workspaceHydrated: state.ui.workspaceHydrated,
        urlDocId: rootId,
        focusedDocId: selectFocusedDocId(state),
        urlDocIsOpen: !!selectPaneShowingDoc(state, rootId),
      });
      // Next 15 patches `replaceState` to re-point its own canonical URL, so
      // `usePathname()` follows without an RSC fetch — see `workspaceUrl.ts`.
      // That re-render feeds a new `rootId` back into the effect above, which
      // replays `openPane` on the pane that is already focused: a no-op, which
      // is why this settles rather than oscillates.
      if (next) window.history.replaceState(null, "", next);
    };
    project();
    return store.subscribe(project);
  }, [dispatch, store, hydrated, rootId]);

  // Leaving the editor closes the workspace: nothing should survive to be
  // re-adopted by an unrelated route. What is *stored* survives — the
  // persistence middleware will not write an empty workspace, precisely so this
  // cleanup cannot erase the layout on the way out.
  useEffect(() => () => void dispatch(actions.closeAllPanes()), [dispatch]);

  // A reload within the write debounce would otherwise lose the change that
  // prompted it. `visibilitychange` is the last event a hidden tab reliably
  // gets; `beforeunload` is not fired on mobile at all.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") flushWorkspaceWrite();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  const rowRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const setRatio = useCallback(
    (next: number) => void dispatch(actions.setSplitRatio(next)),
    [dispatch],
  );

  const onDragMove = useCallback((e: MouseEvent) => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setRatio((e.clientX - rect.left) / rect.width);
  }, [setRatio]);
  const onDragEnd = useCallback(() => setIsResizing(false), []);
  useDragCapture(isResizing, onDragMove, onDragEnd);

  const onSplitterKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setRatio(ratio - RATIO_STEP);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setRatio(ratio + RATIO_STEP);
    }
  }, [ratio, setRatio]);

  const isSplit = panes.length > 1;

  // One pane renders with no wrapper at all, so the unsplit editor is exactly
  // the tree it was before split view: the page's container is still its
  // scroller, and nothing about its layout is downstream of this component.
  if (!isSplit) {
    const [pane] = panes;
    return pane
      ? (
        <PaneFrame
          pane={pane}
          isFocused={pane.id === focusedPaneId}
          isSplit={false}
          grow={1}
        />
      )
      : null;
  }

  return (
    <Box
      ref={rowRef}
      sx={{
        display: "flex",
        alignItems: "stretch",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
      }}
    >
      {panes.map((pane, index) => (
        <Fragment key={pane.id}>
          {index > 0 && (
            <Box
              sx={{
                // The rule is the 1px `divider` of §17.1; the 4px strip around
                // it is the grab area, and `ResizeGripper` paints it only on
                // hover/drag — the same ladder the other three panels use.
                position: "relative",
                width: GRIPPER_W,
                flexShrink: 0,
                borderLeft: "1px solid",
                borderColor: "divider",
              }}
            >
              <ResizeGripper
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsResizing(true);
                }}
                onDoubleClick={() => setRatio(DEFAULT_PANE_RATIO)}
                onKeyDown={onSplitterKeyDown}
                isResizing={isResizing}
                label="Resize panes"
                value={{
                  now: Math.round(ratio * 100),
                  min: Math.round(MIN_PANE_RATIO * 100),
                  max: Math.round(MAX_PANE_RATIO * 100),
                  text: `${Math.round(ratio * 100)}% left pane`,
                  controls: `pane-${panes[0].id}`,
                }}
              />
            </Box>
          )}
          <PaneFrame
            pane={pane}
            isFocused={pane.id === focusedPaneId}
            isSplit
            grow={index === 0 ? ratio : 1 - ratio}
          />
        </Fragment>
      ))}
    </Box>
  );
};

export default WorkspacePanes;
