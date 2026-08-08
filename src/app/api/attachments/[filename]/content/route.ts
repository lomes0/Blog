import { ApiError, optionalUserRoute } from "@/lib/api-utils";
import { isTextFile } from "@/utils/languageDetection";
import { attachmentPath, requireAttachmentRead } from "../../access";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";

// Maximum file size for content preview (1MB)
const MAX_CONTENT_SIZE = 1024 * 1024;

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const contentTypeMap: Record<string, string> = {
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    jsx: "application/javascript",
    ts: "application/typescript",
    tsx: "application/typescript",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    sh: "application/x-sh",
    py: "text/x-python",
    csv: "text/csv",
  };
  return ext
    ? (contentTypeMap[ext] || "application/octet-stream")
    : "application/octet-stream";
}

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

  // Get file stats
  const stats = statSync(filePath);
  const fileSize = stats.size;

  // Check file size limit
  if (fileSize > MAX_CONTENT_SIZE) {
    throw new ApiError(
      413,
      "File too large for content preview",
      `File size ${fileSize} exceeds maximum ${MAX_CONTENT_SIZE}`,
    );
  }

  // Determine mimetype
  const mimetype = getMimeType(filename);

  // Check if file is text-based
  if (!isTextFile(mimetype, filename)) {
    throw new ApiError(
      415,
      "Binary files cannot be previewed as text",
      `MIME type: ${mimetype}`,
    );
  }

  // Read file content
  const fileBuffer = await readFile(filePath);
  const content = fileBuffer.toString("utf-8");

  return NextResponse.json({
    content,
    encoding: "utf-8",
    size: fileSize,
    mimetype,
  });
}, { errorLabel: "Error reading attachment content" });
