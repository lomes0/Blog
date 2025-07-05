import { getCachedRevision } from "@/repositories/revision";
import { unstable_cache } from "next/cache";

const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";
console.log("PUBLIC_URL:", PUBLIC_URL);

const getRevisionHtml = async (id: string) => {
  try {
    console.log("Getting HTML for revision:", id);
    const revision = await getCachedRevision(id);
    if (!revision) {
      console.log("Revision not found for HTML generation:", id);
      return null;
    }

    const data = revision.data;
    console.log("Sending data to embed API for HTML generation");

    try {
      const response = await fetch(`${PUBLIC_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!response.ok) {
        console.error(
          "Embed API returned error for HTML:",
          response.status,
          await response.text(),
        );
        return null;
      }

      const html = await response.text();
      console.log("HTML generation successful, length:", html.length);
      return html;
    } catch (error: any) {
      // During build, the API might not be available
      // This is not a critical error during build time
      console.log(
        "HTML fetch error (likely during build):",
        error.message || String(error),
      );
      return null;
    }
  } catch (error) {
    console.error("Error generating HTML:", error);
    return null;
  }
};

const findRevisionHtml = unstable_cache(getRevisionHtml, [], {
  tags: ["html"],
});

const getRevisionThumbnail = async (id: string) => {
  try {
    console.log("Generating thumbnail for revision:", id);
    const revision = await getCachedRevision(id);
    if (!revision) {
      console.log("Revision not found for thumbnail:", id);
      return null;
    }

    // Make sure we have valid data
    if (
      !revision.data || !revision.data.root ||
      !Array.isArray(revision.data.root.children)
    ) {
      console.error("Invalid revision data structure for thumbnail:", id);
      return null;
    }

    // Take only the first 3 children to create a thumbnail
    const data = revision.data;
    const thumbnailData = {
      ...data,
      root: {
        ...data.root,
        children: data.root.children.slice(0, 3),
      },
    };

    console.log("Sending thumbnail data to embed API");
    try {
      const response = await fetch(`${PUBLIC_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thumbnailData),
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!response.ok) {
        console.error(
          "Embed API returned error for thumbnail:",
          response.status,
          await response.text(),
        );
        return null;
      }

      const html = await response.text();
      console.log(
        "Thumbnail HTML generated successfully, length:",
        html.length,
      );
      return html;
    } catch (error: any) {
      // During build, the API might not be available
      // This is not a critical error during build time
      console.log(
        "Thumbnail fetch error (likely during build):",
        error.message || String(error),
      );
      return null;
    }
  } catch (error) {
    console.error("Error generating thumbnail:", error);
    return null;
  }
};

const findRevisionThumbnail = unstable_cache(getRevisionThumbnail, [], {
  tags: ["thumbnail"],
});

export { findRevisionHtml, findRevisionThumbnail };
