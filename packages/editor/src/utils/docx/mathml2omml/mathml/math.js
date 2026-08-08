export function math(
  element,
  targetParent,
  _previousSibling,
  _nextSibling,
  _ancestors,
) {
  targetParent.name = "m:oMath";
  targetParent.attribs = {
    "xmlns:m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
  };
  targetParent.type = "tag";
  targetParent.children = [];
  return targetParent;
}

export function semantics(
  element,
  targetParent,
  _previousSibling,
  _nextSibling,
  _ancestors,
) {
  // Ignore as default behavior
  return targetParent;
}
