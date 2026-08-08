export function mrow(
  element,
  targetParent,
  previousSibling,
  _nextSibling,
  _ancestors,
) {
  if (previousSibling.isNary) {
    const targetSibling =
      targetParent.children[targetParent.children.length - 1];
    return targetSibling.children[targetSibling.children.length - 1];
  } else {
    // Ignore as default behavior
    return targetParent;
  }
}
