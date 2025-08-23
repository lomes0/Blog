import { NextResponse } from "next/server";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch((error) => {
      return null;
    });

    if (!body) {
      return NextResponse.json({
        error: {
          title: "Invalid request",
          subtitle: "Request body is required and must be valid JSON",
        },
      }, { status: 400 });
    }

    // Validate that the body contains editor state data
    if (!body.root) {
      return NextResponse.json({
        error: {
          title: "Invalid editor state",
          subtitle: "Editor state must contain a root node",
        },
      }, { status: 400 });
    }

    const html = await generateServerHtml(body);

    if (!html) {
      return NextResponse.json({
        error: {
          title: "Failed to generate HTML",
          subtitle: "Generated HTML is empty",
        },
      }, { status: 500 });
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("Embed API error:", error);

    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";

    return NextResponse.json({
      error: {
        title: "Failed to generate HTML",
        subtitle: errorMessage,
      },
    }, { status: 500 });
  }
}
