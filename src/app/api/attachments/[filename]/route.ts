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

export const dynamic = "force-dynamic";

const editAttachmentSchema = z.object({ content: z.string() }).strict();

// Text-based file extensions that can be edited
const EDITABLE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "xml",
  "yaml",
  "yml",
  "sh",
  "bash",
  "zsh",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "go",
  "rs",
  "swift",
  "kt",
  "scala",
  "sql",
  "graphql",
  "gql",
  "vue",
  "svelte",
  "astro",
  "prisma",
  "env",
  "gitignore",
  "dockerfile",
  "makefile",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

function isEditableFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (EDITABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  // Allow common config files without extensions
  const baseName = filename.toLowerCase();
  const configFiles = [
    "dockerfile",
    "makefile",
    "gemfile",
    "rakefile",
    "procfile",
  ];
  return configFiles.includes(baseName);
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
  if (!isEditableFile(filename)) {
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
