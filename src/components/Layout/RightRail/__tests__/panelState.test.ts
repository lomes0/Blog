/**
 * The right panel's state transitions.
 *
 * The whole point of `panelState.ts` being import-free is that this file needs
 * no DOM: every rule the panel has is a function from one view to the next, and
 * the React half only renders the answer.
 *
 * What is pinned here is the set of states that must be unreachable as much as
 * the happy paths — chiefly an open panel with nothing in it, which is the
 * thing the derived-open design exists to make impossible.
 */
import {
  capPanelViews,
  DEFAULT_VIEW,
  isPanelOpen,
  MAX_REMEMBERED_PANELS,
  type PanelView,
  rememberPanel,
  sanitizePanelView,
  sanitizePanelViews,
  selectView,
  type ViewId,
  VIEW_IDS,
} from "../panelState";

describe("open and closed", () => {
  it("is open iff a view is showing", () => {
    expect(isPanelOpen(null)).toBe(false);
    for (const view of VIEW_IDS) expect(isPanelOpen(view)).toBe(true);
  });

  it("defaults to the outline", () => {
    expect(DEFAULT_VIEW).toBe("outline");
  });
});

describe("selectView", () => {
  it("opens into a closed panel", () => {
    expect(selectView(null, "revisions")).toBe("revisions");
  });

  it("replaces the view on screen", () => {
    expect(selectView("outline", "properties")).toBe("properties");
  });

  it("closes when the view on screen is picked again", () => {
    expect(selectView("outline", "outline")).toBeNull();
  });

  it("round-trips: two clicks on one icon leave the panel as it was", () => {
    for (const view of VIEW_IDS) {
      expect(selectView(selectView(null, view), view)).toBeNull();
    }
  });

  it("only ever closes via the view that is already showing", () => {
    // Any other icon replaces rather than closes, so the panel cannot be shut
    // by accident while reaching for a different view.
    for (const current of VIEW_IDS) {
      for (const clicked of VIEW_IDS) {
        const next = selectView(current, clicked);
        if (clicked === current) expect(next).toBeNull();
        else expect(next).toBe(clicked);
      }
    }
  });
});

describe("sanitizePanelView", () => {
  it("keeps a view this build still has", () => {
    for (const view of VIEW_IDS) expect(sanitizePanelView(view)).toBe(view);
  });

  it("keeps null — a closed panel is a choice", () => {
    expect(sanitizePanelView(null)).toBeNull();
  });

  it("falls back to the default for anything unreadable", () => {
    // Not to null: a value we cannot read is not evidence the user wanted the
    // panel shut, and an unknown id would otherwise leave the panel open
    // rendering nothing at all.
    for (const junk of ["gone", "", 42, undefined, {}, []]) {
      expect(sanitizePanelView(junk)).toBe(DEFAULT_VIEW);
    }
  });
});

describe("the per-document map", () => {
  it("keeps usable entries and drops the rest", () => {
    const map = sanitizePanelViews({
      a: "revisions",
      b: null,
      c: "gone",
      d: 7,
      e: {},
    });
    // `c` is a string, so it was one of ours and defaults; `d` and `e` never
    // were, so the documents read as untouched instead.
    expect(map).toEqual({ a: "revisions", b: null, c: DEFAULT_VIEW });
  });

  it("survives a stored value that is not a map at all", () => {
    expect(sanitizePanelViews(["outline"])).toEqual({});
    expect(sanitizePanelViews(null)).toEqual({});
    expect(sanitizePanelViews("outline")).toEqual({});
  });

  it("distinguishes a closed panel from an untouched document", () => {
    const map = sanitizePanelViews({ closed: null });
    expect(map.closed).toBeNull();
    expect("untouched" in map).toBe(false);
  });

  it("caps the map, evicting the oldest", () => {
    const over: Record<string, PanelView> = {};
    for (let i = 0; i < MAX_REMEMBERED_PANELS + 10; i++) {
      over[`doc-${i}`] = "outline";
    }
    const capped = capPanelViews(over);
    expect(Object.keys(capped)).toHaveLength(MAX_REMEMBERED_PANELS);
    expect(capped["doc-0"]).toBeUndefined();
    expect(capped[`doc-${MAX_REMEMBERED_PANELS + 9}`]).toBe("outline");
  });

  it("treats a rewrite as a use, so the cap is least-recently-used", () => {
    let map: Record<string, PanelView> = {};
    for (let i = 0; i < MAX_REMEMBERED_PANELS; i++) {
      map = rememberPanel(map, `doc-${i}`, "outline");
    }
    // Touch the oldest, then overflow by one. FIFO would evict `doc-0`.
    map = rememberPanel(map, "doc-0", "revisions");
    map = rememberPanel(map, "fresh", "outline");

    expect(map["doc-0"]).toBe("revisions");
    expect(map["doc-1"]).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(MAX_REMEMBERED_PANELS);
  });

  it("records a closed panel rather than forgetting the document", () => {
    // Deleting the entry would make "I closed this" indistinguishable from
    // "never opened", which comes back on the default.
    const map = rememberPanel({ "doc-a": "outline" }, "doc-a", null);
    expect(map["doc-a"]).toBeNull();
    expect("doc-a" in map).toBe(true);
  });
});

describe("invariants across every reachable state", () => {
  /** Every state a few rail clicks can reach from closed. */
  const reachable = (): PanelView[] => {
    const seen = new Set<PanelView>([null]);
    let frontier: PanelView[] = [null];
    for (let depth = 0; depth < 3; depth++) {
      const next: PanelView[] = [];
      for (const state of frontier) {
        for (const view of VIEW_IDS) {
          const move = selectView(state, view);
          if (seen.has(move)) continue;
          seen.add(move);
          next.push(move);
        }
      }
      frontier = next;
    }
    return [...seen];
  };

  const states = reachable();

  it("reaches every view and the closed panel", () => {
    expect(states).toHaveLength(VIEW_IDS.length + 1);
  });

  it("never leaves the panel open with nothing in it", () => {
    for (const state of states) {
      if (isPanelOpen(state)) {
        expect(VIEW_IDS as readonly (ViewId | null)[]).toContain(state);
      }
    }
  });

  it("survives a persistence round-trip unchanged", () => {
    for (const state of states) {
      expect(sanitizePanelView(JSON.parse(JSON.stringify(state)))).toBe(state);
    }
  });
});
