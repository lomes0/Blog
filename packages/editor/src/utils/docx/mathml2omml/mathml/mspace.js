export function mspace(
  element,
  targetParent,
  _previousSibling,
  _nextSibling,
  _ancestors,
) {
  targetParent.children.push({
    name: "m:r",
    type: "tag",
    attribs: {},
    children: [{
      name: "m:t",
      type: "tag",
      attribs: {
        "xml:space": "preserve",
      },
      children: [
        {
          type: "text",
          data: " ",
        },
      ],
    }],
  });
}
