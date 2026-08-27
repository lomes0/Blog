/**
 * Which unit each of the four figure classes commits a resize drag in.
 *
 * `ImageNode.resizeUnit` is `"percent"` and `GraphNode`, `SketchNode` and
 * `IFrameNode` override it to `"px"` — one line each, and every one of them a
 * line that only a reader would notice going missing. The whole reason it is a
 * `static` rather than a serialized field is that a field would be four
 * constructors, four clones, four `importJSON`s and a migration
 * (docs/plans/archive/haklex-reprise.md §7.1); the cost of the static is that
 * nothing about the *serialization* checks it, so this spec is the check.
 *
 * Two claims, and the second is the one that will actually break:
 *
 *  1. Each class reports its own unit.
 *  2. An **instance** reports its class's unit. `getResizeUnit` resolves
 *     through `this.constructor`, which is what lets one `ImageComponent`
 *     serve all four; writing `ImageNode.resizeUnit` instead would compile,
 *     pass claim 1, and quietly give every graph and every embed a percentage
 *     width. That is a stored-data change, arriving through a class nobody
 *     edited.
 */
import { createHeadlessEditor } from "@lexical/headless";
import { $createImageNode, ImageNode } from "@/editor/nodes/ImageNode";
import { $createGraphNode, GraphNode } from "@/editor/nodes/GraphNode";
import { $createSketchNode, SketchNode } from "@/editor/nodes/SketchNode";
import { $createIFrameNode, IFrameNode } from "@/editor/nodes/IFrameNode";
import type { ImageResizeUnit } from "@/editor/nodes/imageLayout";

/** The shared half of every payload — none of it is what is under test. */
const base = { width: 640, height: 360, style: "", id: "" };

/**
 * `{ resizeUnit }` and not `typeof ImageNode`, and the reason is the hazard
 * this whole design exists to avoid: the three subclasses re-declare
 * `ImageNode`'s constructor *positionally* and insert their own argument in
 * the middle of it, so `typeof GraphNode` is not assignable to
 * `typeof ImageNode` — the construct signatures disagree at argument three.
 * The static is the only part of the four classes that has a common type.
 */
const CASES: ReadonlyArray<{
  name: string;
  unit: ImageResizeUnit;
  klass: { resizeUnit: ImageResizeUnit };
  create: () => ImageNode;
}> = [
  {
    name: "image",
    unit: "percent",
    klass: ImageNode,
    create: () => $createImageNode({ ...base, src: "/a.png", altText: "a" }),
  },
  {
    name: "graph",
    unit: "px",
    klass: GraphNode,
    create: () =>
      $createGraphNode({ ...base, src: "/a.svg", altText: "g", value: "{}" }),
  },
  {
    name: "sketch",
    unit: "px",
    klass: SketchNode,
    create: () => $createSketchNode({ ...base, src: "/a.svg", altText: "s" }),
  },
  {
    name: "iframe",
    unit: "px",
    klass: IFrameNode,
    create: () =>
      $createIFrameNode({ ...base, src: "https://example.com", altText: "i" }),
  },
];

/**
 * A `LexicalNode` constructor calls `$setNodeKey`, which needs an active
 * editor — so an instance can only be built inside an update. Headless is
 * enough: nothing here renders, and the caption editor each figure constructs
 * never mounts.
 */
const editor = createHeadlessEditor({
  namespace: "resizeUnit",
  nodes: [ImageNode, GraphNode, SketchNode, IFrameNode],
  onError: (e) => {
    throw e;
  },
});

const build = <T>(run: () => T): T => {
  let result!: T;
  editor.update(() => {
    result = run();
  }, { discrete: true });
  return result;
};

describe("resizeUnit", () => {
  for (const { name, unit, klass } of CASES) {
    it(`${name} commits a drag in ${unit}`, () => {
      expect(klass.resizeUnit).toBe(unit);
    });
  }

  for (const { name, unit, create } of CASES) {
    it(`a ${name} instance answers for its own class`, () => {
      expect(build(create).getResizeUnit()).toBe(unit);
    });
  }

  /**
   * The split is the point: exactly one of the four scales with the column.
   * A fifth class arriving as a copy of `GraphNode` would land on `"px"` by
   * inheritance and pass silently; one arriving as a copy of `ImageNode`
   * would land on `"percent"` and turn this red, which is the direction that
   * needs a decision.
   */
  it("is percent for the uploaded picture and pixels for the three generated ones", () => {
    const percent = CASES.filter((c) => c.klass.resizeUnit === "percent");
    expect(percent.map((c) => c.name)).toEqual(["image"]);
  });

  /** Every subclass inherits from `ImageNode`, so the override is a real one. */
  it("overrides rather than shadows — each subclass extends ImageNode", () => {
    for (const { create } of CASES) {
      expect(build(create)).toBeInstanceOf(ImageNode);
    }
  });
});
