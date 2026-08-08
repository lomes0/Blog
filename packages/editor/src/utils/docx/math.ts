import { MathNode } from "@/editor/nodes/MathNode";
import {
  BookmarkEnd,
  BookmarkStart,
  bookmarkUniqueNumericIdGen,
  ImportedXmlComponent,
} from "docx";
import { convertLatexToMathMl } from "mathlive";
import { mml2omml } from "./mathml2omml";

export function $convertMathNode(node: MathNode) {
  try {
    const value = node.getValue();
    const mathml = convertLatexToMathMl(value);
    const ommlString = mml2omml(
      `<math xmlns="http://www.w3.org/1998/Math/MathML">${mathml}</math>`,
    ) as unknown as string;
    const xmlComponent: ImportedXmlComponent = ImportedXmlComponent
      .fromXmlString(
        ommlString,
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mathRun = (xmlComponent as unknown as { root: any[] }).root[0] as any;
    const id = node.getId();
    if (!id) return mathRun;
    const linkId = bookmarkUniqueNumericIdGen()();
    return [
      new BookmarkStart(id, linkId),
      mathRun,
      new BookmarkEnd(linkId),
    ];
  } catch (_e) {
    return null;
  }
}
