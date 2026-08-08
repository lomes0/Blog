export function mglyph(
  element,
  targetParent,
  _previousSibling,
  _nextSibling,
  _ancestors,
) {
  // No support in omml. Output alt text.
  if (element.attribs && element.attribs.alt) {
    targetParent.children.push({
      type: "text",
      data: element.attribs.alt,
    });
  }
}
