import { ApiError, userRoute } from "@/lib/api-utils";
import { requireDocument } from "@/lib/access";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { validate } from "uuid";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export const POST = userRoute<{ id: string }>(
  async (request, { params, user }) => {
    if (!validate(params.id)) {
      throw new ApiError(400, "Bad Request", "Invalid id");
    }

    await requireDocument(params.id, user, "own", {
      subtitle: "You are not authorized to modify this document",
    });

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new ApiError(400, "Bad Request", "No file uploaded");
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new ApiError(400, "File Too Large", "Maximum file size is 10MB");
    }

    try {
      // Generate a unique filename, preserving original extension.
      //
      // The extension is whatever follows the last dot in a name the uploader
      // controls, so it is constrained to word characters before use. It cannot
      // contain a dot (and so cannot traverse upward), but it could contain a
      // slash — `"a.b/../x"` yields `"/x"` — which turned the destination into
      // a nested path that was never created, failing the write with ENOENT.
      const originalName = file.name;
      const rawExt = originalName.split(".").pop() ?? "";
      const fileExt = /^\w{1,16}$/.test(rawExt) ? rawExt.toLowerCase() : "bin";
      const randomId = crypto.randomBytes(16).toString("hex");
      const fileName = `attach_${params.id}_${randomId}.${fileExt}`;

      // Create upload directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), "public/uploads/attachments");
      await mkdir(uploadDir, { recursive: true });

      // Save the file
      const filePath = path.join(uploadDir, fileName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // Return the attachment metadata with API URL for download
      const fileUrl = `/api/attachments/${fileName}`;

      return NextResponse.json({
        data: {
          url: fileUrl,
          filename: originalName,
          mimetype: file.type || "application/octet-stream",
          size: file.size,
        },
      });
    } catch (error) {
      console.error("File processing error:", error);
      throw new ApiError(
        500,
        "Upload Failed",
        "Failed to process the uploaded file",
      );
    }
  },
  { signInMessage: "Please sign in to upload attachments" },
);
