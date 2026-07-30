import { ApiError, parseBody, publicRoute } from "@/lib/api-utils";
import { generateServerHtml } from "@/editor/utils/generateServerHtml";
import { editorStateSchema } from "../documents/schemas";

// Public: this renders editor state supplied in the request body and touches no
// stored data, so there is nothing here to authorize against.
export const POST = publicRoute(
  async (request) => {
    // The body *is* the editor state here, so the schema carries the `root` check
    // this route was already making by hand.
    const body = await parseBody(request, editorStateSchema);

    const html = await generateServerHtml(body);

    if (!html) {
      throw new ApiError(
        500,
        "Failed to generate HTML",
        "Generated HTML is empty",
      );
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  },
  { errorLabel: "Embed API error" },
);
