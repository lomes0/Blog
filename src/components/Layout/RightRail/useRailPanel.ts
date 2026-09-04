"use client";
import { useMemo } from "react";
import { actions, useDispatch, useSelector } from "@/store";
import { selectFocusedPane } from "@/store/selectors/layoutSelectors";
import type { RailSlotIndex } from "@/types";
import {
  defaultPanel,
  isPanelOpen,
  NO_DOCUMENT_KEY,
  type PanelState,
  type ViewId,
} from "./panelState";

/**
 * The focused document's right-panel layout, and the gestures that change it.
 *
 * Two components need this and must agree: `RightRail` draws the panel, and
 * `AppLayoutContent` sizes the grid column it lives in. They used to share a
 * `railMode` boolean in `LayoutModeContext`; the panel's open state is now
 * *derived* from whether any slot is filled, so there is no boolean to share —
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

  /**
   * A document nobody has touched opens on the default.
   *
   * Memoised on the stored value's identity so the fallback is not a fresh
   * object every render — `PanelSlots` takes it as a prop, and a new default
   * per render would defeat every memo downstream.
   */
  const panel: PanelState = useMemo(
    () => stored ?? defaultPanel(),
    [stored],
  );

  const gestures = useMemo(() => ({
    selectView: (view: ViewId, otherSlot = false) =>
      dispatch(actions.railViewSelected({ docId: docKey, view, otherSlot })),
    focusSlot: (index: RailSlotIndex) =>
      dispatch(actions.railSlotFocused({ docId: docKey, index })),
    closeSlot: (index: RailSlotIndex) =>
      dispatch(actions.railSlotClosed({ docId: docKey, index })),
    closeFocusedSlot: () =>
      dispatch(actions.railFocusedSlotClosed({ docId: docKey })),
    toggleSplit: () => dispatch(actions.railSplitToggled({ docId: docKey })),
    setRatio: (ratio: number) =>
      dispatch(actions.railRatioChanged({ docId: docKey, ratio })),
    resetRatio: () => dispatch(actions.railRatioReset({ docId: docKey })),
  }), [dispatch, docKey]);

  return { rootId, panel, open: isPanelOpen(panel), ...gestures };
};
