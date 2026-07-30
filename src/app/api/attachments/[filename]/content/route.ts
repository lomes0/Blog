import { ApiError, optionalUserRoute } from "@/lib/api-utils";
import { attachmentPath, requireAttachmentRead } from "../../access";
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync, statSync } from "fs";

export const dynamic = "force-dynamic";

// Maximum file size for content preview (1MB)
const MAX_CONTENT_SIZE = 1024 * 1024;

// MIME types that can be read as text
const TEXT_MIME_TYPES = new Set([
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  "text/markdown",
  "text/xml",
  "text/javascript",
  "text/x-python",
  "application/json",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/xml",
  "application/x-sh",
  "application/x-shellscript",
  "application/yaml",
  "application/x-yaml",
]);

// File extensions that can be read as text
const TEXT_EXTENSIONS = new Set([
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
  "fish",
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
  "dockerignore",
  "editorconfig",
  "eslintrc",
  "prettierrc",
  "babelrc",
  "dockerfile",
  "makefile",
  "cmake",
  "toml",
  "ini",
  "cfg",
  "conf",
  "log",
  "csv",
  "tsv",
]);

function isTextFile(mimetype: string, filename: string): boolean {
  // Check MIME type
  if (TEXT_MIME_TYPES.has(mimetype)) {
    return true;
  }

  // Check if MIME type starts with text/
  if (mimetype.startsWith("text/")) {
    return true;
  }

  // Check file extension
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check for common config files without extensions
  const baseName = filename.toLowerCase();
  const configFiles = [
    "dockerfile",
    "makefile",
    "gemfile",
    "rakefile",
    "procfile",
    "jenkinsfile",
    "vagrantfile",
  ];
  if (configFiles.includes(baseName)) {
    return true;
  }

  return false;
}

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
