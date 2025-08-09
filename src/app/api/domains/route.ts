import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to create a domain" },
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

    // Parse request body
    const body = await req.json();
    const { name, slug, description, color, icon } = body;

    // Validate input
    if (!name || !name.trim()) {
      return NextResponse.json(
        { message: "Domain name is required" },
        { status: 400 },
      );
    }

    // Check if slug already exists
    const finalSlug = slug || name.toLowerCase().replace(/\s+/g, "-");
    const existingDomain = await prisma.domain.findUnique({
      where: { slug: finalSlug },
    });

    if (existingDomain) {
      return NextResponse.json(
        { message: "A domain with this slug already exists" },
        { status: 400 },
      );
    }

    // Create domain
    const domain = await prisma.domain.create({
      data: {
        id: randomUUID(),
        name,
        slug: finalSlug,
        description,
        color,
        icon,
        userId: user.id,
      },
    });

    return NextResponse.json(domain, { status: 201 });
  } catch (error: any) {
    console.error("Error creating domain:", error);
    return NextResponse.json(
      { message: "Failed to create domain", error: error.message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to view domains" },
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

    // Get domains for user, ordered by custom order first, then by creation date
    const domains = await prisma.domain.findMany({
      where: { userId: user.id },
      orderBy: [
        { order: "asc" } as any, // TODO: Fix when Prisma types are updated
        { createdAt: "desc" }
      ],
    });

    return NextResponse.json(domains);
  } catch (error: any) {
    console.error("Error fetching domains:", error);
    return NextResponse.json(
      { message: "Failed to fetch domains", error: error.message },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
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

    // Get domain ID from query parameters
    const url = new URL(req.url);
    const domainId = url.searchParams.get("id");

    if (!domainId) {
      return NextResponse.json(
        { message: "Domain ID is required" },
        { status: 400 },
      );
    }

    // Check if domain exists and belongs to the user
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: user.id,
      },
    });

    if (!domain) {
      return NextResponse.json(
        {
          message: "Domain not found or you don't have permission to delete it",
        },
        { status: 404 },
      );
    }

    // Delete domain (will cascade delete all associated documents)
    await prisma.domain.delete({
      where: { id: domainId },
    });

    return NextResponse.json(
      { message: "Domain and all associated documents deleted successfully" },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error deleting domain:", error);
    return NextResponse.json(
      { message: "Failed to delete domain", error: error.message },
      { status: 500 },
    );
  }
}
