// Feasibility spike: prove the headless nodes import and the round-trip works.
// Run: node --import tsx --import ./mcp/bootstrap.mjs mcp/spike.ts
import {
  editorStateToMarkdown,
  markdownToEditorState,
  unsupportedNodeTypes,
} from "./lexical";

const md = [
  "# Title",
  "",
  "Hello **world** with inline math $x^2 + 1$ and a list:",
  "",
  "- one",
  "- two",
  "",
  "```js",
  "const a = 1;",
  "```",
].join("\n");

console.log("=== markdown -> state -> markdown ===");
const state = markdownToEditorState(md);
const back = editorStateToMarkdown(state);
console.log(back);
console.log("=== unsupported nodes in that state ===");
console.log(unsupportedNodeTypes(state));
console.log("round-trip stable:", back.trim() === md.trim());
