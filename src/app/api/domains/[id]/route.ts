import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/domains/[id] - Get a single domain
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to access domains" },
        { status: 401 },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 },
      );
    }

    // Fetch domain
    const domain = await prisma.domain.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!domain) {
      return NextResponse.json(
        { message: "Domain not found" },
        { status: 404 },
      );
    }

    // Check if user owns this domain
    if (domain.userId !== user.id) {
      return NextResponse.json(
        { message: "You do not have permission to access this domain" },
        { status: 403 },
      );
    }

    return NextResponse.json(domain);
  } catch (error: any) {
    console.error("Error fetching domain:", error);
    return NextResponse.json(
      { message: "Failed to fetch domain", error: error.message },
      { status: 500 },
    );
  }
}

// PUT /api/domains/[id] - Update a domain
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to update a domain" },
        { status: 401 },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 },
      );
    }

    // Check if domain exists and belongs to user
    const existingDomain = await prisma.domain.findUnique({
      where: { id },
    });

    if (!existingDomain) {
      return NextResponse.json(
        { message: "Domain not found" },
        { status: 404 },
      );
    }

    if (existingDomain.userId !== user.id) {
      return NextResponse.json(
        { message: "You do not have permission to update this domain" },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await req.json();
    const { name, slug, description, color } = body;

    // Validate input
    if (!name || !name.trim()) {
      return NextResponse.json(
        { message: "Domain name is required" },
        { status: 400 },
      );
    }

    // Check if slug already exists (but not for this domain)
    if (slug !== existingDomain.slug) {
      const slugExists = await prisma.domain.findUnique({
        where: { slug },
      });

      if (slugExists) {
        return NextResponse.json(
          { message: "A domain with this slug already exists" },
          { status: 400 },
        );
      }
    }

    // Update domain
    const updatedDomain = await prisma.domain.update({
      where: { id },
      data: {
        name,
        slug,
        description,
        color,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updatedDomain);
  } catch (error: any) {
    console.error("Error updating domain:", error);
    return NextResponse.json(
      { message: "Failed to update domain", error: error.message },
      { status: 500 },
    );
  }
}

// DELETE /api/domains/[id] - Delete a domain
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to delete a domain" },
        { status: 401 },
      );
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 },
      );
    }

    // Check if domain exists and belongs to user
    const existingDomain = await prisma.domain.findUnique({
      where: { id },
    });

    if (!existingDomain) {
      return NextResponse.json(
        { message: "Domain not found" },
        { status: 404 },
      );
    }

    if (existingDomain.userId !== user.id) {
      return NextResponse.json(
        { message: "You do not have permission to delete this domain" },
        { status: 403 },
      );
    }

    // Delete the domain (and associated documents will be cascade deleted)
    // The cascade delete is handled by the database according to the schema relationship
    await prisma.domain.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Domain and all associated documents deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting domain:", error);
    return NextResponse.json(
      { message: "Failed to delete domain", error: error.message },
      { status: 500 },
    );
  }
}
