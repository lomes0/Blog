"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Box } from "@mui/material";
import {
  actions,
  postsSelectors,
  useDispatch,
  useSelector,
  useStore,
} from "@/store";
import type { RootState } from "@/store";
import { useDragCapture } from "@/hooks/useResizablePanel";
import ResizeGripper from "@/components/Layout/ResizeGripper";
import {
  DEFAULT_PANE_RATIO,
  MAX_PANE_RATIO,
  MIN_PANE_RATIO,
  type WorkspacePane,
} from "@/types";
import {
  flushWorkspaceWrite,
  primeScrollMemory,
  readStoredWorkspace,
  readWorkspaceKeyHint,
} from "@/store/workspacePersistence";
import TabbedDocumentEditor from "./TabbedDocumentEditor";
import WorkspaceToolbar from "./WorkspaceToolbar";
import { PANE_ACTION_CLASS } from "./PaneHeader";
import { PANE_PAD_X, SPLITTER_W } from "./paneChrome";
import { hiddenScrollbarSx } from "@/theme/tokens";
import { cancelContentGutters } from "@/components/Layout/contentInset";
import { ToolbarSlotProvider } from "@/contexts/ToolbarSlotContext";

/** One arrow-key press on the focused splitter. */
const RATIO_STEP = 0.02;

interface PaneFrameProps {
  pane: WorkspacePane;
  isFocused: boolean;
  /** False when this is the only pane — no chrome, no independent scroller. */
  isSplit: boolean;
  /** Share of the row, as a flex-grow factor. Ignored when not split. */
  grow: number;
  /**
   * Hidden behind a maximized neighbour.
   *
   * `display: none`, not unmounted — the same choice `EditorTabPanel` makes for
   * an inactive tab, and for the same reason: the editor keeps its undo history
   * and its scroll offset, so restoring the split costs nothing and loses
   * nothing.
   */
  isHidden?: boolean;
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
 * `<title>`, the `ActiveEditorContext` ref the Copilot writes through, and the
 * formatting toolbar — keys off the focused pane instead, and `EditorTabPanel`
 * is where they are gated.
 */
const PaneFrame: React.FC<PaneFrameProps> = ({
  pane,
  isFocused,
  isSplit,
  grow,
  isHidden = false,
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
        display: isHidden ? "none" : "flex",
        flexDirection: "column",
        // Each pane scrolls its own document. Only reachable while split — see
        // the early return above.
        overflow: "hidden",
        // The pane owns the reveal, not the strip: the buttons are 24px targets
        // in a 32px row, and hovering *those* to make them appear is the thing
        // hover-reveal is supposed to avoid. `focus-within` is what keeps them
        // reachable by keyboard (DESIGN.md §9).
        [`&:hover .${PANE_ACTION_CLASS}, &:focus-within .${PANE_ACTION_CLASS}`]:
          { opacity: 1 },
      }}
    >
      {
        /* No header row. The pane's name, its close button and the §17.3 accent
          that marks it focused all used to be drawn here, above a pane whose
          tabs were somewhere else entirely — in the app top bar. They are the
          header's now (`PaneHeader`), which sticks to the top of this
          scroller and so occupies the same line this row did. */
      }
      {
        /* `position: relative` here is a standing requirement for any editor
          chrome that positions itself against this scroller, and it is cheap
          insurance rather than decoration.

          It was written for CodeActionMenuPlugin, which portalled code-block
          chrome into the nearest scrollable ancestor and positioned it in that
          scroller's coordinate space; static, the chrome hung off
          #editor-main-container instead — right at rest, and drifting away from
          the code the moment this pane scrolled, because it was anchored to
          something that does not scroll. That plugin no longer portals anything
          (docs/plans/archive/code-block-card.md: the chrome is part of the
          block now), so nothing currently depends on this. Any new scroller
          around the editor still needs it, and the next plugin that does depend
          on it will not think to come back here. */
      }
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          px: PANE_PAD_X,
          position: "relative",
          ...hiddenScrollbarSx,
        }}
      >
        {editor}
      </Box>
    </Box>
  );
};

/**
 * Where a workspace with nothing to restore sends you.
 *
 * Bare `/edit` is the workspace's own address (docs/plans/workspace-url.md §3),
 * so "no document named" stopped meaning "not found". With a stored layout
 * there is a workspace to show. With none there is nothing at all, and `/posts`
 * is the existing "what do I have" surface — no new UI, and no product argument
 * attached to a refactor (§6.2, decided). A home pane can take this over later
 * without anything else here changing.
 */
const EMPTY_WORKSPACE_ROUTE = "/posts";

/**
 * The workspace's own address, and its steady state (plan §3).
 *
 * `/edit/<id>` is a door in, not a place to stay: it is consumed on arrival and
 * replaced by this. A bare literal rather than an import, because the module
 * that used to export it was the projection machinery this plan deleted.
 */
const WORKSPACE_ROUTE = "/edit";

interface WorkspacePanesProps {
  /**
   * The document named by the URL — the deep-link seam's answer — or `null` on
   * bare `/edit`, which names none and is the steady state after §3's consume.
   * Null means "nothing to replay": the stored layout is the whole answer, and
   * if there is no stored layout either, see {@link EMPTY_WORKSPACE_ROUTE}.
   */
  rootId: string | null;
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
  const router = useRouter();
  const panes = useSelector((state: RootState) => state.ui.workspace.panes);
  const focusedPaneId = useSelector(
    (state: RootState) => state.ui.workspace.focusedPaneId,
  );
  const ratio = useSelector(
    (state: RootState) => state.ui.workspace.splitRatio,
  );
  const maximizedPaneId = useSelector(
    (state: RootState) => state.ui.workspace.maximizedPaneId,
  );
  const hydrated = useSelector(
    (state: RootState) => state.ui.workspaceHydrated,
  );
  /**
   * The document the URL arrived with, kept after the address bar has been
   * cleared of it. Only the re-armed restore below reads it.
   */
  const entryDocId = useRef<string | null>(null);

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
      // Scroll offsets ride in the same record, so they are seeded from this
      // read rather than costing a second one on the way to first paint. Before
      // the dispatch, so a pane that mounts on this commit already has them.
      primeScrollMemory(stored);
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
  // Then the URL is **consumed** (plan §3): one `history.replaceState` back to
  // `/edit`, and the address bar is out of the workspace's business for good.
  // It is not a projection of focus any more — clicking between panes, opening
  // a tab, splitting and closing all touch nothing but the store, which is
  // where the answer was always more complete than one id could be.
  //
  // `replaceState` rather than a router call for the same reason the projection
  // used it: Next 15 patches it into an `ACTION_RESTORE`, which only re-points
  // `canonicalUrl` and never consults the server. `usePathname()` follows, so
  // `rootId` comes back null on the next commit and this effect re-runs into
  // its own early return — one pass, then quiet.
  useEffect(() => {
    if (rootId) entryDocId.current = rootId;
    if (!hydrated) return;
    // Bare `/edit` names nothing, so there is usually nothing to replay. The
    // exception is a re-armed restore: `workspaceKeyChanged` empties the
    // workspace and lowers `workspaceHydrated` when the guessed key turns out
    // to be the wrong user, and by then the entry has already been consumed out
    // of the address bar. Replaying it from the ref is what stops the document
    // the user actually followed being dropped in favour of the other account's
    // stored layout — the reducer's docblock promises that replay, and after
    // the consume the URL can no longer supply it.
    const entry = rootId ?? entryDocId.current;
    if (!entry) return;
    dispatch(actions.openPane({ rootId: entry }));
    if (rootId) window.history.replaceState(null, "", WORKSPACE_ROUTE);
  }, [dispatch, hydrated, rootId]);

  // The empty-workspace answer (plan §4.3, §6.2): arriving at bare `/edit` with
  // no stored layout leaves nothing to show, so it hands over to `/posts`.
  //
  // **The layout is checked first, and that ordering is the whole risk here.**
  // The gate is `workspaceHydrated`, which nothing but `restoreWorkspace`
  // raises — so by the time this runs the stored record has already been read
  // and installed, layout or nothing. The panes are then read back through
  // `store.getState()` rather than off the selected value, so "were there panes
  // at the moment we decided" is a fact rather than a render-timing
  // coincidence. Redirecting a user who has a perfectly good stored workspace
  // is the failure this is shaped against.
  //
  // One shot, and deliberately not a standing watch on an empty workspace. The
  // question is about *arrival* — "I came to /edit and there is nothing here" —
  // not about the workspace becoming empty later: closing the last pane out
  // from under a deleted document is `useCloseDeletedDocument`'s to answer, and
  // a second navigation racing that one would be the bug.
  const emptyDecided = useRef(false);
  useEffect(() => {
    if (!hydrated || rootId || emptyDecided.current) return;
    emptyDecided.current = true;
    if (store.getState().ui.workspace.panes.length === 0) {
      router.replace(EMPTY_WORKSPACE_ROUTE);
    }
  }, [hydrated, rootId, router, store]);

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

  // Esc gives the row back, which is the way out of a maximize that does not
  // need the pointer to find a 24px button again.
  //
  // On the row rather than on `window`: the keystroke is only ours while the
  // focus is inside the workspace, and a bubbling handler sees it after the
  // editor, a dialog or an open menu has had it — each of which calls
  // `preventDefault` on the Esc it consumed, so `defaultPrevented` is the test
  // for "nothing else wanted this".
  const onRowKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented || !maximizedPaneId) return;
    e.preventDefault();
    dispatch(actions.unmaximizePane());
  }, [dispatch, maximizedPaneId]);

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
  //
  // `ToolbarSlotProvider` wraps both branches — one provider for the workspace,
  // where each pane used to nest its own. It renders no DOM, so the unsplit tree
  // is unchanged; what it settles is that the workspace has a *single* toolbar
  // slot, and the two branches differ only in where the target for it is drawn:
  // inside the lone pane's header when unsplit, above the row when split.
  if (!isSplit) {
    const [pane] = panes;
    return pane
      ? (
        <ToolbarSlotProvider>
          <PaneFrame
            pane={pane}
            isFocused={pane.id === focusedPaneId}
            isSplit={false}
            grow={1}
          />
        </ToolbarSlotProvider>
      )
      : null;
  }

  const focusedPane = panes.find((pane) => pane.id === focusedPaneId);

  return (
    <ToolbarSlotProvider>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <WorkspaceToolbar
          hasToolbar={focusedPane?.mode === "write"}
          reserve={panes.some((pane) => pane.mode === "write")}
        />
        <Box
          ref={rowRef}
          onKeyDown={onRowKeyDown}
          sx={{
            display: "flex",
            alignItems: "stretch",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            // Full bleed. Two documents do not want the page's one-column
            // gutters between them and the window — see `PANE_PAD_X`, which is
            // what each pane keeps instead.
            ...cancelContentGutters,
          }}
        >
          {panes.map((pane, index) => (
            <Fragment key={pane.id}>
              {index > 0 && !maximizedPaneId && (
                <Box
                  sx={{
                    // Reserves the grab strip and nothing else. The rule is the
                    // 1px `divider` of §17.1, but it is drawn *by the gripper*,
                    // centred (`variant="rule"`), rather than being a border on
                    // this box — a border would put the whole 11px of slack on
                    // one side of the line, and the seam between two documents
                    // has to look the same from both.
                    position: "relative",
                    width: SPLITTER_W,
                    flexShrink: 0,
                  }}
                >
                  <ResizeGripper
                    variant="rule"
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
                // A maximized pane takes the row whole; its neighbour keeps a
                // grow factor it is not using, so restoring is one flag rather
                // than a second source of truth about the ratio.
                grow={maximizedPaneId ? 1 : index === 0 ? ratio : 1 - ratio}
                isHidden={!!maximizedPaneId && pane.id !== maximizedPaneId}
              />
            </Fragment>
          ))}
        </Box>
      </Box>
    </ToolbarSlotProvider>
  );
};

export default WorkspacePanes;
