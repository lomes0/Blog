import {
  ApiError,
  optionalUserRoute,
  parseBody,
  userRoute,
} from "@/lib/api-utils";
import {
  attachmentPath,
  requireAttachmentRead,
  requireAttachmentWrite,
} from "../access";
import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { z } from "zod";
import { isEditable } from "@/utils/languageDetection";

export const dynamic = "force-dynamic";

const editAttachmentSchema = z.object({ content: z.string() }).strict();

export const GET = optionalUserRoute<{ filename: string }>(async (
  _request,
  { params, user },
) => {
  const { filename } = params;

  const filePath = attachmentPath(filename);
  await requireAttachmentRead(filename, user);

  // Check if file exists
  if (!existsSync(filePath)) {
    throw new ApiError(404, "File not found");
  }

  // Read file
  const fileBuffer = await readFile(filePath);

  // Determine content type based on extension
  const ext = filename.split(".").pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    txt: "text/plain",
    pdf: "application/pdf",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    sh: "application/x-sh",
    js: "application/javascript",
    json: "application/json",
    xml: "application/xml",
    md: "text/markdown",
    csv: "text/csv",
  };

  const contentType = ext
    ? (contentTypeMap[ext] || "application/octet-stream")
    : "application/octet-stream";

  // Return file with appropriate headers
  return new NextResponse(fileBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}, { errorLabel: "Error serving attachment" });

export const PUT = userRoute<{ filename: string }>(async (
  request,
  { params, user },
) => {
  const { filename } = params;

  const filePath = attachmentPath(filename);
  await requireAttachmentWrite(filename, user);

  // Check if file is editable
  if (!isEditable(filename)) {
    throw new ApiError(415, "This file type cannot be edited");
  }

  // Check if file exists
  if (!existsSync(filePath)) {
    throw new ApiError(404, "File not found");
  }

  const { content } = await parseBody(request, editAttachmentSchema);

  // Write the file
  await writeFile(filePath, content, "utf-8");

  // Get updated file size
  const stats = statSync(filePath);
  const newSize = stats.size;

  return NextResponse.json({
    success: true,
    size: newSize,
    filename,
  });
}, {
  errorLabel: "Error updating attachment",
  signInMessage: "Please sign in to edit attachments",
});
