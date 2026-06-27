// sidebar.jsx — refined open state + 3 collapsed rail directions
const { useState } = React;

const DOCS = [
  "LLVM DataFlowAnalyzer", "CIFS", "Linux Capabilities — Core Concepts",
  "DPDK virtio-user Hotplug: Core Concepts", "Virtio-user Exception Path: Core Concepts",
  "DPDK TAP Integration via rte_eal", "DPDK TAP Hotplug Packet Flow and Lifecycle",
  "DPDK on NVIDIA BlueField-3 VF: Setup", "DPDK Firewall on NVIDIA VF (mlx5)",
  "DPDK mlx5 VF Capture", "Virtio-User as Exception Path (DPDK)", "Linux TUN/TAP Concepts",
];
const FOLDERS = [
  { name: "LLVM Data Layout", count: 4, open: false,
    docs: ["Struct Layout Rules", "Alignment & Padding", "Pointer Width Targets", "Endianness Notes"] },
  { name: "ChatGPT Summarize", count: 132, open: true, docs: DOCS },
];

const ACCENT = "#2f6df6";

// ---- shared bits ----------------------------------------------------------
const Logo = ({ size = 44, onClick, title }) => (
  <button className="logo-btn" onClick={onClick} title={title} style={{
    width: size, height: size, borderRadius: size * 0.27, border: "none",
    background: "linear-gradient(160deg,#4b86f8,#2f6df6)", display: "grid",
    placeItems: "center", cursor: onClick ? "pointer" : "default", flex: "0 0 auto",
    boxShadow: "0 2px 6px rgba(47,109,246,.30)", padding: 0,
  }}>
    <LogoGlyph size={size * 0.6} />
  </button>
);

const Avatar = ({ size = 34 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", flex: "0 0 auto",
    background: "radial-gradient(120% 120% at 30% 25%, #9fb3c8 0%, #6b7f96 45%, #3f5168 100%)",
    boxShadow: "inset 0 1px 2px rgba(255,255,255,.25), inset 0 0 0 1px rgba(0,0,0,.06)",
    position: "relative", overflow: "hidden",
  }}>
    <div style={{
      position: "absolute", left: "50%", bottom: -size * 0.16, width: size * 0.62,
      height: size * 0.62, transform: "translateX(-50%)", borderRadius: "50%",
      background: "rgba(255,255,255,.42)",
    }} />
    <div style={{
      position: "absolute", left: "50%", top: size * 0.16, width: size * 0.34,
      height: size * 0.34, transform: "translateX(-50%)", borderRadius: "50%",
      background: "rgba(255,255,255,.5)",
    }} />
  </div>
);

// ===========================================================================
// OPEN STATE
// ===========================================================================
function OpenSidebar({ t, sel, setSel, folders, setFolders, activeDoc, setActiveDoc, onCollapse }) {
  const dens = { compact: 0.86, regular: 1, comfy: 1.14 }[t.density] || 1;
  const rowH = Math.round(46 * dens);
  const accentOn = t.accent;

  const NavRow = ({ id, icon, label }) => {
    const on = sel === id;
    return (
      <button className={"nav-row" + (on ? " on" : "")} onClick={() => setSel(id)}
        style={{ height: rowH }}>
        {accentOn && on && <span className="nav-accent" />}
        <span className="nav-ico">{icon}</span>
        <span className="nav-label">{label}</span>
      </button>
    );
  };

  return (
    <div className="sb-inner">
      {/* header */}
      <div className="sb-header">
        <Logo />
        <span className="sb-title">Blog</span>
      </div>

      {/* primary nav */}
      <div className="sb-nav">
        <NavRow id="posts" icon={<FileIcon />} label="Posts" />
        <NavRow id="notes" icon={<ChatIcon />} label="Notes" />
      </div>

      {/* search */}
      <div className="sb-search-wrap">
        <label className="sb-search">
          <span className="sb-search-ico"><SearchIcon /></span>
          <input placeholder="Search posts…" spellCheck={false} />
        </label>
      </div>

      {/* tree */}
      <div className="sb-tree custom-scroll">
        {folders.map((f, fi) => (
          <div key={f.name} className="tree-folder">
            <button className="folder-row" onClick={() =>
              setFolders(folders.map((x, i) => i === fi ? { ...x, open: !x.open } : x))}>
              <span className={"folder-chev" + (f.open ? " open" : "")}><Chevron size={15} /></span>
              <span className="folder-name">{f.name}</span>
              <span className="folder-count">{f.count}</span>
            </button>
            <div className="folder-kids" style={{
              maxHeight: f.open ? f.docs.length * (rowH - 6) + 8 : 0,
            }}>
              {f.docs.map((d) => {
                const on = activeDoc === d;
                return (
                  <button key={d} className={"doc-row" + (on ? " on" : "")}
                    onClick={() => setActiveDoc(d)} style={{ height: rowH - 8 }}>
                    {accentOn && on && <span className="doc-accent" />}
                    <span className="doc-ico"><FileIcon size={17} /></span>
                    <span className="doc-name">{d}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div className="sb-footer">
        <Avatar />
        <span className="sb-user">lomes0</span>
        <button className="footer-btn" title="Collapse sidebar" onClick={onCollapse}>
          <CollapseArrows />
        </button>
      </div>
    </div>
  );
}

// ===========================================================================
// COLLAPSED STATE — 3 directions
// ===========================================================================
function RailBtn({ children, label, on, onClick, onTip, offTip, danger }) {
  return (
    <button className={"rail-btn" + (on ? " on" : "")} onClick={onClick}
      onMouseEnter={(e) => onTip(e.currentTarget, label)} onMouseLeave={offTip}>
      {children}
    </button>
  );
}

function CollapsedRail({ t, sel, setSel, folders, activeDoc, setActiveDoc, onExpand, onTip, offTip }) {
  const style = t.collapsedStyle;
  const accentOn = t.accent;

  // ---- Direction C: minimal handle ----
  if (style === "handle") {
    return (
      <div className="rail-handle">
        <button className="handle-reopen" onClick={onExpand}
          onMouseEnter={(e) => onTip(e.currentTarget, "Open sidebar")} onMouseLeave={offTip}>
          <PanelOpen />
        </button>
      </div>
    );
  }

  const recent = folders.find((f) => f.name === "ChatGPT Summarize").docs.slice(0, 9);

  return (
    <div className="rail-inner">
      <div className="rail-top">
        <Logo size={40} onClick={onExpand} title="Open sidebar" />
      </div>

      <div className="rail-nav">
        <RailBtn label="Posts" on={sel === "posts"} onClick={() => setSel("posts")} onTip={onTip} offTip={offTip}>
          {accentOn && sel === "posts" && <span className="rail-accent" />}
          <FileIcon size={21} />
        </RailBtn>
        <RailBtn label="Notes" on={sel === "notes"} onClick={() => setSel("notes")} onTip={onTip} offTip={offTip}>
          {accentOn && sel === "notes" && <span className="rail-accent" />}
          <ChatIcon size={21} />
        </RailBtn>
      </div>

      <div className="rail-div" />

      {style === "nav" && (
        <div className="rail-folders">
          {folders.map((f) => (
            <RailBtn key={f.name} label={`${f.name} · ${f.count}`} onClick={onExpand} onTip={onTip} offTip={offTip}>
              <FolderIcon size={21} />
              <span className="rail-badge">{f.count > 99 ? "99+" : f.count}</span>
            </RailBtn>
          ))}
        </div>
      )}

      {style === "recent" && (
        <div className="rail-recent custom-scroll">
          {recent.map((d) => (
            <RailBtn key={d} label={d} on={activeDoc === d} onClick={() => setActiveDoc(d)} onTip={onTip} offTip={offTip}>
              {accentOn && activeDoc === d && <span className="rail-accent" />}
              <FileIcon size={20} />
            </RailBtn>
          ))}
        </div>
      )}

      <div className="rail-foot">
        <button className="rail-avatar-btn" onClick={onExpand}
          onMouseEnter={(e) => onTip(e.currentTarget, "lomes0")} onMouseLeave={offTip}>
          <Avatar size={34} />
        </button>
        <button className="rail-btn small" onClick={onExpand}
          onMouseEnter={(e) => onTip(e.currentTarget, "Expand")} onMouseLeave={offTip}>
          <ExpandArrows size={17} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { OpenSidebar, CollapsedRail, FOLDERS, DOCS, ACCENT });
