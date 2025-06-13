import { authOptions } from "@/lib/auth";
import { deleteDocument, findEditorDocument, findUserDocument, updateDocument } from "@/repositories/document";
import { DeleteDocumentResponse, DocumentUpdateInput, GetDocumentResponse, PatchDocumentResponse } from "@/types";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server"
import { validate } from "uuid";
import { Prisma } from "@prisma/client";
import { validateHandle } from "../utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const response: GetDocumentResponse = {};
  try {
    const session = await getServerSession(authOptions);
    const userDocument = await findUserDocument(params.id, "all");
    if (!userDocument) {
      response.error = { title: "Document not found" }
      return NextResponse.json(response, { status: 404 })
    }
    const isCollab = userDocument.collab;
    if (!session && !isCollab) {
      response.error = { title: "This document is private", subtitle: "Please sign in to Edit it" }
      return NextResponse.json(response, { status: 401 })
    }
    if (session) {
      const { user } = session;
      if (user.disabled) {
        response.error = { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" }
        return NextResponse.json(response, { status: 403 })
      }
      const isAuthor = user.id === userDocument.author.id;
      const isCoauthor = userDocument.coauthors.some(coauthor => coauthor.id === user.id);
      if (!isAuthor && !isCoauthor && !isCollab) {
        response.error = { title: "This document is private", subtitle: "You are not authorized to Edit this document" }
        return NextResponse.json(response, { status: 403 })
      }
    }
    const editorDocument = await findEditorDocument(params.id);
    if (!editorDocument) {
      response.error = { title: "Document not found" }
      return NextResponse.json(response, { status: 404 })
    }
    response.data = { ...editorDocument, cloudDocument: userDocument };
    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.log(error);
    response.error = { title: "Something went wrong", subtitle: "Please try again later" }
    return NextResponse.json(response, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const response: PatchDocumentResponse = {};
  try {
    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid id" }
      return NextResponse.json(response, { status: 400 })
    }
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = { title: "This document is private", subtitle: "Please sign in to Edit it" }
      return NextResponse.json(response, { status: 401 })
    }
    const { user } = session;
    if (user.disabled) {
      response.error = { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" }
      return NextResponse.json(response, { status: 403 })
    }
    const userDocument = await findUserDocument(params.id);
    if (!userDocument) {
      response.error = { title: "Document not found" }
      return NextResponse.json(response, { status: 404 })
    }
    if (user.id !== userDocument.author.id) {
      response.error = { title: "This document is private", subtitle: "You are not authorized to Edit this document" }
      return NextResponse.json(response, { status: 403 })
    }

    const body: DocumentUpdateInput = await request.json();
    if (!body) {
      response.error = { title: "Bad Request", subtitle: "Invalid request body" }
      return NextResponse.json(response, { status: 400 })
    }

    const input: Prisma.DocumentUncheckedUpdateInput = {
      name: body.name,
      head: body.head,
      handle: body.handle,
      updatedAt: body.updatedAt,
      published: body.published,
      collab: body.collab,
      private: body.private,
      parentId: body.parentId,
    };

    if (body.handle && body.handle !== userDocument.handle) {
      input.handle = body.handle.toLowerCase();
      const validationError = await validateHandle(input.handle);
      if (validationError) {
        response.error = validationError;
        return NextResponse.json(response, { status: 400 })
      }
    }

    if (body.coauthors) {
      const documentId = params.id;
      const userEmails = body.coauthors;
      const InvalidEmails = userEmails.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      if (InvalidEmails.length > 0) {
        response.error = { title: "Invalid Coauther Email", subtitle: "One or more emails are invalid" }
        return NextResponse.json(response, { status: 400 })
      }
      input.coauthors = {
        deleteMany: {
          userEmail: { notIn: userEmails },
        },
        upsert: userEmails.map(userEmail => ({
          where: { documentId_userEmail: { documentId, userEmail } },
          update: {},
          create: {
            user: {
              connectOrCreate: {
                where: { email: userEmail },
                create: {
                  name: userEmail.split("@")[0],
                  email: userEmail,
                },
              }
            }
          },
        })),
      };
    }

    if (body.data) {
      input.revisions = {
        connectOrCreate: {
          where: { id: body.head },
          create: {
            id: body.head,
            authorId: user.id,
            createdAt: body.updatedAt,
            data: body.data as unknown as Prisma.InputJsonObject,
          }
        }
      }
    }


    response.data = await updateDocument(params.id, input);
    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.log(error);
    response.error = { title: "Something went wrong", subtitle: "Please try again later" }
    return NextResponse.json(response, { status: 500 })
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const response: DeleteDocumentResponse = {};
  try {
    if (!validate(params.id)) {
      response.error = { title: "Bad Request", subtitle: "Invalid id" }
      return NextResponse.json(response, { status: 400 })
    }
    const session = await getServerSession(authOptions);
    if (!session) {
      response.error = { title: "This document is private", subtitle: "Please sign in to delete it" }
      return NextResponse.json(response, { status: 401 })
    }
    const { user } = session;
    if (user.disabled) {
      response.error = { title: "Account Disabled", subtitle: "Account is disabled for violating terms of service" }
      return NextResponse.json(response, { status: 403 })
    }
    const userDocument = await findUserDocument(params.id);
    if (!userDocument) {
      response.error = { title: "Document not found" }
      return NextResponse.json(response, { status: 404 })
    }
    if (user.id !== userDocument.author.id) {
      response.error = { title: "This document is private", subtitle: "You are not authorized to delete this document" }
      return NextResponse.json(response, { status: 403 })
    }
    await deleteDocument(params.id);
    response.data = params.id;
    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.log(error);
    response.error = { title: "Something went wrong", subtitle: "Please try again later" }
    return NextResponse.json(response, { status: 500 })
  }
}
