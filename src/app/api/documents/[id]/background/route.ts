import { authOptions } from "@/lib/auth";
import { findUserPost, updatePost } from "@/repositories/post";
import { UploadBackgroundImageResponse } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { validate } from "uuid";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const response: UploadBackgroundImageResponse = {};

  try {
    console.log(
      "Processing background image upload for document:",
      params.id,
    );

    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid id" };
      return NextResponse.json(response, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = {
        title: "Unauthorized",
        subtitle: "Please sign in to upload images",
      };
      return NextResponse.json(response, { status: 401 });
    }

    const { user } = session;
    if (user.disabled) {
      response.error = {
        title: "Account Disabled",
        subtitle: "Account is disabled for violating terms of service",
      };
      return NextResponse.json(response, { status: 403 });
    }

    const userDocument = await findUserPost(params.id);
    if (!userDocument) {
      response.error = { title: "Document not found" };
      return NextResponse.json(response, { status: 404 });
    }

    console.log("Document retrieved:", {
      id: userDocument.id,
      type: userDocument.type,
      rawDocumentType: typeof userDocument.type === "string"
        ? userDocument.type
        : "not a string",
    });

    if (user.id !== userDocument.author.id) {
      response.error = {
        title: "Forbidden",
        subtitle: "You are not authorized to modify this document",
      };
      return NextResponse.json(response, { status: 403 });
    }

    // Since directories have been removed in blog refactor, reject all background operations
    response.error = {
      title: "Bad Request",
      subtitle:
        "Background images are only supported for directories, which have been removed",
    };
    return NextResponse.json(response, { status: 400 });

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    console.log(
      "File received:",
      file ? `${file.name} (${file.type}, ${file.size} bytes)` : "No file",
    );

    if (!file) {
      response.error = {
        title: "Bad Request",
        subtitle: "No file uploaded",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Check file type
    const fileType = file.type;
    if (!fileType.startsWith("image/")) {
      response.error = {
        title: "Bad Request",
        subtitle: "Only image files are allowed",
      };
      return NextResponse.json(response, { status: 400 });
    }

    try {
      // Generate a unique filename
      const fileExt = fileType.split("/")[1];
      const randomId = crypto.randomBytes(16).toString("hex");
      const fileName = `dir_${params.id}_${randomId}.${fileExt}`;

      console.log("Creating directory and saving file:", fileName);

      // Create upload directory if it doesn't exist
      const uploadDir = path.join(
        process.cwd(),
        "public/uploads/directories",
      );
      await mkdir(uploadDir, { recursive: true });

      // Save the file
      const filePath = path.join(uploadDir, fileName);
      console.log("File will be saved to:", filePath);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
      console.log("File saved successfully");

      // Update the document with the background image path
      const imagePath = `/uploads/directories/${fileName}`;

      console.log("Updating document with background_image:", imagePath);
      const updatedDocument = await updatePost(params.id, {
        background_image: imagePath,
        updatedAt: new Date(),
      });

      if (!updatedDocument) {
        response.error = {
          title: "Update Failed",
          subtitle: "Failed to update document with background image",
        };
        return NextResponse.json(response, { status: 500 });
      }

      response.data = {
        background_image: imagePath,
        document: updatedDocument!,
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      console.error("File processing error:", error);
      response.error = {
        title: "Upload Failed",
        subtitle: "Failed to process the uploaded file",
      };
      return NextResponse.json(response, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    response.error = {
      title: "Something went wrong",
      subtitle: "Please try again later",
    };
    return NextResponse.json(response, { status: 500 });
  }
}
