// app.jsx — mock app shell, collapse orchestration, tooltips, tweaks
const { useState: useS, useEffect: useE, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "collapsedStyle": "Nav rail",
  "accent": false,
  "accentColor": "#2f6df6",
  "density": "regular",
  "openWidth": 300
}/*EDITMODE-END*/;

const styleKey = (label) =>
  label.indexOf("Recent") > -1 || label.indexOf("recent") > -1 ? "recent"
  : label.indexOf("Minimal") > -1 ? "handle" : "nav";

function MainArea({ activeDoc, sel, onToggle, collapsed }) {
  const title = sel === "notes" ? "Notes" : (activeDoc || "All Posts");
  const rows = [
    { t: "DPDK TAP Hotplug Packet Flow and Lifecycle", m: "Edited 2h ago · Draft" },
    { t: "Linux Capabilities — Core Concepts", m: "Published · May 28" },
    { t: "DPDK on NVIDIA BlueField-3 VF: Setup", m: "Published · May 21" },
    { t: "Virtio-user Exception Path: Core Concepts", m: "Published · May 14" },
  ];
  return (
    <div className="main">
      <div className="main-topbar">
        <button className="ghost-btn" onClick={onToggle} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <span style={{ display: "inline-flex", transform: collapsed ? "none" : "scaleX(-1)" }}><PanelOpen size={18} /></span>
        </button>
        <div className="crumb"><span>Blog</span><span className="crumb-sep">/</span><span className="crumb-cur">{title}</span></div>
        <div style={{ flex: 1 }} />
        <button className="pill-btn ghost">Preview</button>
        <button className="pill-btn primary">New post</button>
      </div>
      <div className="main-scroll custom-scroll">
        <div className="main-head">
          <h1>{title}</h1>
          <p>{sel === "notes" ? "Your scratch notes and snippets." : "Drafts and published posts in this collection."}</p>
        </div>
        <div className="post-list">
          {rows.map((r, i) => (
            <div key={i} className="post-card">
              <div className="post-ic"><FileIcon size={20} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="post-t">{r.t}</div>
                <div className="post-m">{r.m}</div>
              </div>
              <div className={"post-dot" + (i === 0 ? " draft" : "")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [collapsed, setCollapsed] = useS(() => localStorage.getItem("sb-collapsed") === "1");
  const [sel, setSel] = useS("posts");
  const [folders, setFolders] = useS(FOLDERS);
  const [activeDoc, setActiveDoc] = useS(null);
  const [tip, setTip] = useS({ label: "", x: 0, y: 0, on: false });

  useE(() => { localStorage.setItem("sb-collapsed", collapsed ? "1" : "0"); }, [collapsed]);
  useE(() => { document.documentElement.style.setProperty("--accent", t.accentColor); }, [t.accentColor]);

  const cstyle = styleKey(t.collapsedStyle);
  const tnorm = { ...t, collapsedStyle: cstyle };
  const onTip = (el, label) => {
    const r = el.getBoundingClientRect();
    setTip({ label, x: r.right + 12, y: r.top + r.height / 2, on: true });
  };
  const offTip = () => setTip((p) => ({ ...p, on: false }));

  const collapsedW = cstyle === "handle" ? 18 : 64;
  const wrapW = collapsed ? collapsedW : t.openWidth;

  return (
    <div className="app-root">
      <div className="sb-wrap" style={{ width: wrapW, overflow: cstyle === "handle" && collapsed ? "visible" : "hidden" }}>
        <div className="sb-layer" style={{ width: t.openWidth, opacity: collapsed ? 0 : 1, pointerEvents: collapsed ? "none" : "auto" }}>
          <OpenSidebar t={tnorm} sel={sel} setSel={setSel} folders={folders} setFolders={setFolders}
            activeDoc={activeDoc} setActiveDoc={setActiveDoc} onCollapse={() => setCollapsed(true)} />
        </div>
        <div className="sb-layer rail" style={{ width: collapsedW, opacity: collapsed ? 1 : 0, pointerEvents: collapsed ? "auto" : "none" }}>
          <CollapsedRail t={tnorm} sel={sel} setSel={setSel} folders={folders}
            activeDoc={activeDoc} setActiveDoc={setActiveDoc} onExpand={() => setCollapsed(false)}
            onTip={onTip} offTip={offTip} />
        </div>
      </div>

      {collapsed && cstyle === "handle" && (
        <button className="handle-reopen-float" style={{ left: collapsedW - 2 }} onClick={() => setCollapsed(false)}
          onMouseEnter={(e) => onTip(e.currentTarget, "Open sidebar")} onMouseLeave={offTip}>
          <PanelOpen />
        </button>
      )}

      <MainArea activeDoc={activeDoc} sel={sel} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      {/* tooltip layer */}
      <div className="tip" style={{
        left: tip.x, top: tip.y, opacity: tip.on ? 1 : 0,
        transform: `translateY(-50%) translateX(${tip.on ? 0 : -4}px)`,
      }}>{tip.label}</div>

      <TweaksPanel>
        <TweakSection label="Collapsed rail" />
        <TweakRadio label="Style" value={t.collapsedStyle}
          options={["Nav rail", "Recent", "Minimal"]}
          onChange={(v) => setTweak("collapsedStyle", v)} />
        <TweakButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((c) => !c)} />
        <TweakSection label="Open state" />
        <TweakSlider label="Width" value={t.openWidth} min={260} max={340} step={2} unit="px"
          onChange={(v) => setTweak("openWidth", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Brand accent" />
        <TweakToggle label="Show accent bar" value={t.accent} onChange={(v) => setTweak("accent", v)} />
        <TweakColor label="Accent color" value={t.accentColor}
          options={["#2f6df6", "#1f8a5b", "#e0641b", "#7a5ae0"]}
          onChange={(v) => setTweak("accentColor", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
