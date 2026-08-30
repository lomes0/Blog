import { findDocument } from "@/repositories/document";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams;
    const handle = url.pathname.split("/").pop()?.split(".pdf")[0];
    const revision = search.get("v");

    if (!handle) throw new Error("No handle provided");

    const document = await findDocument(handle, revision);
    if (!document || document.private) {
      throw new Error("Document not found");
    }

    // Redirect to embed page
    const embedUrl = new URL(url);
    embedUrl.pathname = `/embed/${handle}`;
    if (!revision) embedUrl.searchParams.set("v", document.headRevisionId);

    return NextResponse.redirect(embedUrl.toString());
  } catch (error) {
    console.error("[PDF] Error:", error);
    const url = new URL(request.url);
    url.pathname = url.pathname.replace("/pdf", "/embed").split(".pdf")[0];
    return NextResponse.redirect(url.toString());
  }
}
