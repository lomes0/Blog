"use client";
import { useMemo } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import {
  DEFAULT_VIEW,
  isPanelOpen,
  NO_DOCUMENT_KEY,
  type PanelView,
  type ViewId,
} from "./panelState";

/**
 * Which view the focused document's right panel is showing, and how to change
 * it.
 *
 * Two components need this and must agree: `RightRail` draws the panel, and
 * `AppLayoutContent` sizes the grid column it lives in. They used to share a
 * `railMode` boolean in `LayoutModeContext`; the panel's open state is now
 * *derived* from whether a view is showing, so there is no boolean to share —
 * only the same derivation, made once here.
 */
export const useRailPanel = () => {
  const dispatch = useDispatch();

  // The panel describes whatever pane has focus, like the rest of the rail.
  const rootId = useSelector((state) => selectFocusedPane(state)?.rootId) ??
    null;
  // With nothing open the panel is not useless — `agent-changes` is global —
  // so that layout is remembered too, under a key no document can collide with.
  const docKey = rootId ?? NO_DOCUMENT_KEY;

  const stored = useSelector((state) => state.ui.railPanel[docKey]);
  // A document nobody has touched opens on the default; `null` is a panel the
  // user closed, and is not the same thing.
  const view: PanelView = stored === undefined ? DEFAULT_VIEW : stored;

  const gestures = useMemo(() => ({
    selectView: (next: ViewId) =>
      dispatch(actions.railViewSelected({ docId: docKey, view: next })),
    closePanel: () => dispatch(actions.railPanelClosed({ docId: docKey })),
  }), [dispatch, docKey]);

  return { rootId, view, open: isPanelOpen(view), ...gestures };
};
