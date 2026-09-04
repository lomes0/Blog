/**
 * The right panel's slot transitions.
 *
 * The whole point of `panelState.ts` being import-free is that this file needs
 * no DOM: every rule the panel has is a function from one `PanelState` to the
 * next, and the React half only renders the answer.
 *
 * What is pinned here is the set of states that must be unreachable, not just
 * the happy paths. An open panel with nothing in it, a `focused` naming a slot
 * that is not there, and one view rendered in both slots are each a way the
 * model stops being able to answer "which slot does my next click fill".
 */
import {
  capPanelStates,
  clampRatio,
  closeFocusedSlot,
  closeSlot,
  DEFAULT_RATIO,
  DEFAULT_VIEW,
  defaultPanel,
  emptyPanel,
  focusSlot,
  isPanelOpen,
  isSplit,
  MAX_REMEMBERED_PANELS,
  MAX_RATIO,
  MIN_RATIO,
  type PanelState,
  type PreferredHeight,
  rememberPanel,
  resetRatio,
  sanitizePanelState,
  sanitizePanelStates,
  selectView,
  selectViewInOtherSlot,
  setRatio,
  sizingMode,
  slotOf,
  toggleSplit,
  type ViewId,
  VIEW_IDS,
} from "../panelState";

/** A panel showing one view, nothing dragged. */
const single = (view: ViewId): PanelState => ({
  ...emptyPanel(),
  slots: [view],
});

/** A panel showing two, with `focused` said out loud. */
const split = (
  top: ViewId,
  bottom: ViewId | null,
  focused: 0 | 1 = 0,
): PanelState => ({ ...emptyPanel(), slots: [top, bottom], focused });

describe("open and closed", () => {
  it("is closed only when no slot is filled", () => {
    expect(isPanelOpen(emptyPanel())).toBe(false);
    expect(isPanelOpen(single("outline"))).toBe(true);
    expect(isPanelOpen(split("outline", "revisions"))).toBe(true);
  });

  it("counts a placeholder as open — slot 0 still holds a view", () => {
    expect(isPanelOpen(split("outline", null))).toBe(true);
  });

  it("falls back to the outline for a document with no stored state", () => {
    expect(defaultPanel().slots).toEqual([DEFAULT_VIEW]);
    expect(defaultPanel().focused).toBe(0);
  });
});

describe("selectView", () => {
  it("opens into an empty panel", () => {
    const next = selectView(emptyPanel(), "revisions");
    expect(next.slots).toEqual(["revisions"]);
    expect(next.focused).toBe(0);
  });

  it("replaces the view in the focused slot", () => {
    const next = selectView(single("outline"), "properties");
    expect(next.slots).toEqual(["properties"]);
  });

  it("replaces in the focused slot of a split, leaving the other alone", () => {
    const next = selectView(split("outline", "revisions", 1), "backlinks");
    expect(next.slots).toEqual(["outline", "backlinks"]);
    expect(next.focused).toBe(1);
  });

  it("fills the placeholder a split opened", () => {
    const next = selectView(split("outline", null, 1), "revisions");
    expect(next.slots).toEqual(["outline", "revisions"]);
  });

  it("focuses a view that is already in the other slot", () => {
    const next = selectView(split("outline", "revisions", 0), "revisions");
    expect(next.slots).toEqual(["outline", "revisions"]);
    expect(next.focused).toBe(1);
  });

  it("closes when the view is already in the focused slot", () => {
    expect(selectView(single("outline"), "outline").slots).toEqual([]);
  });

  it("closes only that slot when split", () => {
    const next = selectView(split("outline", "revisions", 1), "revisions");
    expect(next.slots).toEqual(["outline"]);
    expect(next.focused).toBe(0);
  });

  it("never renders one view in both slots", () => {
    // Every view, from every two-slot arrangement: the invariant is that the
    // slots stay distinct however the click lands.
    for (const view of VIEW_IDS) {
      for (const focused of [0, 1] as const) {
        const next = selectView(split("outline", "revisions", focused), view);
        if (next.slots.length === 2) {
          expect(next.slots[0]).not.toBe(next.slots[1]);
        }
      }
    }
  });
});

describe("selectViewInOtherSlot", () => {
  it("splits from a single slot and focuses the new one", () => {
    const next = selectViewInOtherSlot(single("outline"), "revisions");
    expect(next.slots).toEqual(["outline", "revisions"]);
    expect(next.focused).toBe(1);
  });

  it("replaces the unfocused slot when already split", () => {
    const next = selectViewInOtherSlot(
      split("outline", "revisions", 0),
      "backlinks",
    );
    expect(next.slots).toEqual(["outline", "backlinks"]);
    expect(next.focused).toBe(1);
  });

  it("opens a closed panel without splitting", () => {
    // There is no "other" slot to open into yet, and a panel whose first frame
    // is half empty is a worse answer than the ordinary single slot.
    const next = selectViewInOtherSlot(emptyPanel(), "outline");
    expect(next.slots).toEqual(["outline"]);
  });

  it("focuses rather than duplicating a view already on screen", () => {
    const next = selectViewInOtherSlot(
      split("outline", "revisions", 1),
      "outline",
    );
    expect(next.slots).toEqual(["outline", "revisions"]);
    expect(next.focused).toBe(0);
  });
});

describe("toggleSplit", () => {
  it("opens an empty second slot and focuses it", () => {
    const next = toggleSplit(single("outline"));
    expect(next.slots).toEqual(["outline", null]);
    expect(next.focused).toBe(1);
  });

  it("keeps the focused view when un-splitting", () => {
    const next = toggleSplit(split("outline", "revisions", 1));
    expect(next.slots).toEqual(["revisions"]);
    expect(next.focused).toBe(0);
  });

  it("keeps the real view when un-splitting from the placeholder", () => {
    const next = toggleSplit(split("outline", null, 1));
    expect(next.slots).toEqual(["outline"]);
  });

  it("opens the default view on a closed panel without splitting", () => {
    expect(toggleSplit(emptyPanel()).slots).toEqual([DEFAULT_VIEW]);
  });

  it("round-trips back to the single slot it started from", () => {
    const start = single("properties");
    expect(toggleSplit(toggleSplit(start)).slots).toEqual(start.slots);
  });
});

describe("closing", () => {
  it("collapses the panel when the last slot goes", () => {
    const next = closeSlot(single("outline"), 0);
    expect(next.slots).toEqual([]);
    expect(isPanelOpen(next)).toBe(false);
  });

  it("promotes the survivor to slot 0 and focuses it", () => {
    const next = closeSlot(split("outline", "revisions", 1), 0);
    expect(next.slots).toEqual(["revisions"]);
    expect(next.focused).toBe(0);
  });

  it("promotes the survivor when the bottom slot goes", () => {
    const next = closeSlot(split("outline", "revisions", 0), 1);
    expect(next.slots).toEqual(["outline"]);
    expect(next.focused).toBe(0);
  });

  it("collapses rather than leaving a lone placeholder open", () => {
    // Closing the only real view while the split's placeholder is still there.
    // The survivor is nothing, and an open panel with nothing in it is the one
    // state the whole model exists to make unreachable.
    const next = closeSlot(split("outline", null, 0), 0);
    expect(next.slots).toEqual([]);
    expect(isPanelOpen(next)).toBe(false);
  });

  it("closes the focused slot on Escape", () => {
    const next = closeFocusedSlot(split("outline", "revisions", 1));
    expect(next.slots).toEqual(["outline"]);
  });

  it("does nothing to an already closed panel", () => {
    expect(closeSlot(emptyPanel(), 0).slots).toEqual([]);
  });

  it("keeps the ratio, so re-splitting returns to the chosen divider", () => {
    const dragged = setRatio(split("outline", "revisions"), 0.3);
    const closed = closeSlot(dragged, 1);
    expect(closed.ratio).toBe(0.3);
    expect(toggleSplit(closed).ratio).toBe(0.3);
  });
});

describe("focus", () => {
  it("cannot focus a slot that is not there", () => {
    expect(focusSlot(single("outline"), 1).focused).toBe(0);
    expect(focusSlot(emptyPanel(), 1).focused).toBe(0);
  });

  it("moves between two slots", () => {
    expect(focusSlot(split("outline", "revisions"), 1).focused).toBe(1);
  });

  it("reports which slot a view is in", () => {
    const state = split("outline", "revisions");
    expect(slotOf(state, "outline")).toBe(0);
    expect(slotOf(state, "revisions")).toBe(1);
    expect(slotOf(state, "backlinks")).toBeNull();
  });
});

describe("ratio", () => {
  it("clamps to the reachable range", () => {
    expect(clampRatio(0)).toBe(MIN_RATIO);
    expect(clampRatio(1)).toBe(MAX_RATIO);
    expect(clampRatio(0.5)).toBe(0.5);
  });

  it("clamps a drag and marks it the user's", () => {
    const low = setRatio(split("outline", "revisions"), -3);
    expect(low.ratio).toBe(MIN_RATIO);
    expect(low.ratioExplicit).toBe(true);

    expect(setRatio(split("outline", "revisions"), 9).ratio).toBe(MAX_RATIO);
  });

  it("resets to even and hands sizing back to preferredHeight", () => {
    const next = resetRatio(setRatio(split("outline", "revisions"), 0.75));
    expect(next.ratio).toBe(DEFAULT_RATIO);
    expect(next.ratioExplicit).toBe(false);
  });
});

describe("sizingMode", () => {
  const preferred = (view: ViewId): PreferredHeight =>
    view === "properties" || view === "backlinks" ? "content" : "grow";

  it("uses the ratio when both slots want to grow", () => {
    expect(sizingMode(split("outline", "revisions"), preferred)).toBe("ratio");
  });

  it("sizes a content view to its content beside a grow one", () => {
    expect(sizingMode(split("properties", "outline"), preferred))
      .toBe("content-top");
    expect(sizingMode(split("outline", "properties"), preferred))
      .toBe("content-bottom");
  });

  it("uses the ratio when both are content", () => {
    expect(sizingMode(split("properties", "backlinks"), preferred))
      .toBe("ratio");
  });

  it("lets a divider drag outrank preferredHeight", () => {
    const dragged = setRatio(split("properties", "outline"), 0.3);
    expect(sizingMode(dragged, preferred)).toBe("ratio");
  });

  it("splits a placeholder evenly — it has no appetite of its own", () => {
    expect(sizingMode(split("properties", null), preferred)).toBe("ratio");
  });
});

describe("sanitizePanelState", () => {
  it("falls back to the default for junk", () => {
    for (const junk of [null, undefined, 42, "outline", [], {}]) {
      expect(sanitizePanelState(junk).slots).toEqual([DEFAULT_VIEW]);
    }
  });

  it("round-trips a state it wrote", () => {
    const state = setRatio(split("outline", "revisions", 1), 0.35);
    expect(sanitizePanelState(JSON.parse(JSON.stringify(state))))
      .toEqual(state);
  });

  it("keeps a stored placeholder", () => {
    const state = sanitizePanelState({ slots: ["outline", null], focused: 1 });
    expect(state.slots).toEqual(["outline", null]);
    expect(state.focused).toBe(1);
  });

  it("discards the record whole when the top slot is unusable", () => {
    // Sliding the second view up would be inventing a layout the user never
    // chose — which of the two was on top was half the choice.
    expect(sanitizePanelState({ slots: ["gone", "outline"] }).slots)
      .toEqual([DEFAULT_VIEW]);
    expect(sanitizePanelState({ slots: [null, "outline"] }).slots)
      .toEqual([DEFAULT_VIEW]);
  });

  it("drops an unknown second slot rather than the whole record", () => {
    expect(sanitizePanelState({ slots: ["outline", "gone"] }).slots)
      .toEqual(["outline"]);
  });

  it("refuses one view in both slots", () => {
    expect(sanitizePanelState({ slots: ["outline", "outline"] }).slots)
      .toEqual(["outline"]);
  });

  it("clamps focused against the slots it actually has", () => {
    expect(sanitizePanelState({ slots: ["outline"], focused: 1 }).focused)
      .toBe(0);
  });

  it("discards a ratio that is not a usable number", () => {
    for (const bad of [NaN, Infinity, "0.5", null]) {
      expect(sanitizePanelState({ slots: ["outline"], ratio: bad }).ratio)
        .toBe(DEFAULT_RATIO);
    }
    expect(sanitizePanelState({ slots: ["outline"], ratio: 0.95 }).ratio)
      .toBe(MAX_RATIO);
  });

  it("does not take ratioExplicit on a truthy value alone", () => {
    expect(
      sanitizePanelState({ slots: ["outline"], ratioExplicit: "yes" })
        .ratioExplicit,
    ).toBe(false);
  });
});

describe("the per-document map", () => {
  it("drops entries that are not objects and keeps the rest", () => {
    const map = sanitizePanelStates({
      a: { slots: ["revisions"] },
      b: "nonsense",
      c: null,
    });
    expect(Object.keys(map)).toEqual(["a"]);
    expect(map.a.slots).toEqual(["revisions"]);
  });

  it("survives a stored value that is not a map at all", () => {
    expect(sanitizePanelStates(["outline"])).toEqual({});
    expect(sanitizePanelStates(null)).toEqual({});
  });

  it("caps the map, evicting the oldest", () => {
    const over: Record<string, PanelState> = {};
    for (let i = 0; i < MAX_REMEMBERED_PANELS + 10; i++) {
      over[`doc-${i}`] = single("outline");
    }
    const capped = capPanelStates(over);
    expect(Object.keys(capped)).toHaveLength(MAX_REMEMBERED_PANELS);
    expect(capped["doc-0"]).toBeUndefined();
    expect(capped[`doc-${MAX_REMEMBERED_PANELS + 9}`]).toBeDefined();
  });

  it("treats a rewrite as a use, so the cap is least-recently-used", () => {
    let map: Record<string, PanelState> = {};
    for (let i = 0; i < MAX_REMEMBERED_PANELS; i++) {
      map = rememberPanel(map, `doc-${i}`, single("outline"));
    }
    // Touch the oldest, then overflow by one. FIFO would evict `doc-0`.
    map = rememberPanel(map, "doc-0", single("revisions"));
    map = rememberPanel(map, "fresh", single("outline"));

    expect(map["doc-0"]).toBeDefined();
    expect(map["doc-1"]).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(MAX_REMEMBERED_PANELS);
  });
});

describe("invariants across every transition", () => {
  /** Every state a few clicks can reach from closed. */
  const reachable = (): PanelState[] => {
    const states: PanelState[] = [emptyPanel()];
    const seen = new Set<string>();
    let frontier: PanelState[] = [emptyPanel()];

    for (let depth = 0; depth < 4; depth++) {
      const next: PanelState[] = [];
      for (const state of frontier) {
        const moves = [
          ...VIEW_IDS.map((v) => selectView(state, v)),
          ...VIEW_IDS.map((v) => selectViewInOtherSlot(state, v)),
          toggleSplit(state),
          closeFocusedSlot(state),
          focusSlot(state, 0),
          focusSlot(state, 1),
        ];
        for (const move of moves) {
          const key = JSON.stringify(move);
          if (seen.has(key)) continue;
          seen.add(key);
          states.push(move);
          next.push(move);
        }
      }
      frontier = next;
    }
    return states;
  };

  const states = reachable();

  it("explores a meaningful number of states", () => {
    expect(states.length).toBeGreaterThan(50);
  });

  it("never focuses a slot that does not exist", () => {
    for (const state of states) {
      if (state.focused === 1) expect(state.slots).toHaveLength(2);
    }
  });

  it("never puts one view in both slots", () => {
    for (const state of states) {
      if (state.slots.length === 2 && state.slots[1] !== null) {
        expect(state.slots[0]).not.toBe(state.slots[1]);
      }
    }
  });

  it("never leaves the panel open with nothing in it", () => {
    for (const state of states) {
      if (isPanelOpen(state)) expect(state.slots[0]).toBeTruthy();
    }
  });

  it("never puts the placeholder in the top slot", () => {
    for (const state of states) expect(state.slots[0] ?? "ok").not.toBeNull();
  });

  it("keeps the ratio inside the reachable range", () => {
    for (const state of states) {
      expect(state.ratio).toBeGreaterThanOrEqual(MIN_RATIO);
      expect(state.ratio).toBeLessThanOrEqual(MAX_RATIO);
    }
  });

  it("only ever reports a split with two slots", () => {
    for (const state of states) {
      expect(isSplit(state)).toBe(state.slots.length === 2);
    }
  });
});
