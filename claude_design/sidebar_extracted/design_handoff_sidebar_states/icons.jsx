// icons.jsx — clean line icons matching the screenshot vocabulary
const Icon = ({ d, size = 22, stroke = 1.7, fill = "none", style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
       stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
       strokeLinejoin="round" style={style} aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

// Code logo glyph </> drawn white
const LogoGlyph = ({ size = 26 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.5 8.5 5 12l3.5 3.5" />
    <path d="M15.5 8.5 19 12l-3.5 3.5" />
    <path d="M13.2 6.4 10.8 17.6" />
  </svg>
);

// Document / file with text lines
const FileIcon = ({ size = 22 }) => (
  <Icon size={size} stroke={1.7}>
    <path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M13 3.5V8a1 1 0 0 0 1 1h4" />
    <path d="M8.5 13h7" />
    <path d="M8.5 16h7" />
    <path d="M8.5 10h2" />
  </Icon>
);

// Chat bubble (Notes)
const ChatIcon = ({ size = 22 }) => (
  <Icon size={size} stroke={1.7}>
    <path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3.5V15.5H7a2 2 0 0 1-2-2Z" />
  </Icon>
);

const SearchIcon = ({ size = 18 }) => (
  <Icon size={size} stroke={1.8}>
    <circle cx="11" cy="11" r="6.2" />
    <path d="m20 20-3.4-3.4" />
  </Icon>
);

const Chevron = ({ size = 16, dir = "right" }) => {
  const rot = { right: 0, down: 90, up: -90, left: 180 }[dir] || 0;
  return (
    <Icon size={size} stroke={2}>
      <path d="m9 6 6 6-6 6" style={{ transformOrigin: "12px 12px", transform: `rotate(${rot}deg)`, transition: "transform .22s cubic-bezier(.4,0,.2,1)" }} />
    </Icon>
  );
};

// Folder icon for collapsed tree representation
const FolderIcon = ({ size = 22 }) => (
  <Icon size={size} stroke={1.7}>
    <path d="M4 7.5a1.5 1.5 0 0 1 1.5-1.5h3.2a1.5 1.5 0 0 1 1.1.5l1 1.2a1.5 1.5 0 0 0 1.1.5h5.6A1.5 1.5 0 0 1 20 9.7v7.8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
  </Icon>
);

// Diagonal expand arrows (footer, open state) — collapse the sidebar
const CollapseArrows = ({ size = 18 }) => (
  <Icon size={size} stroke={1.9}>
    <path d="M9 5H5v4" />
    <path d="m5 5 5.5 5.5" />
    <path d="M15 19h4v-4" />
    <path d="m19 19-5.5-5.5" />
  </Icon>
);

// Expand-from-rail arrows (collapsed footer) — point outward
const ExpandArrows = ({ size = 18 }) => (
  <Icon size={size} stroke={1.9}>
    <path d="M4 10V5h5" />
    <path d="M5 5l6 6" />
    <path d="M20 14v5h-5" />
    <path d="M19 19l-6-6" />
  </Icon>
);

// Simple panel-toggle chevron button for the minimal handle
const PanelOpen = ({ size = 18 }) => (
  <Icon size={size} stroke={2}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

Object.assign(window, {
  Icon, LogoGlyph, FileIcon, ChatIcon, SearchIcon, Chevron, FolderIcon,
  CollapseArrows, ExpandArrows, PanelOpen,
});
