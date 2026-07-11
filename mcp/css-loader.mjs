// Node module-customization hook: resolve `.css` (and other style asset)
// imports to an empty module so browser-oriented Lexical node files can be
// imported in a headless Node process (the MCP server).
const STYLE_EXT = /\.(css|scss|sass|less)$/;

export async function load(url, context, nextLoad) {
  if (STYLE_EXT.test(new URL(url).pathname)) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return nextLoad(url, context);
}
