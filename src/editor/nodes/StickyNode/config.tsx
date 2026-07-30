// The sticky note's nested editor uses the shared nested node set. Kept as a
// re-export so the existing `./config` import path inside StickyNode still
// resolves; see `../nestedConfig` for why the container nodes are excluded.
export { nestedEditorConfig as editorConfig } from "../nestedConfig";
