import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { message: "You must be signed in to reorder domains" },
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

    const body = await req.json();
    const { domainOrders } = body;

    // Validate the input
    if (!Array.isArray(domainOrders)) {
      return NextResponse.json(
        { message: "domainOrders must be an array" },
        { status: 400 },
      );
    }

    // Validate each domain order entry
    for (const entry of domainOrders) {
      if (!entry.id || typeof entry.order !== "number") {
        return NextResponse.json(
          { message: "Each domain order entry must have an id and numeric order" },
          { status: 400 },
        );
      }
    }

    // Verify all domains belong to the user
    const domainIds = domainOrders.map((entry: any) => entry.id);
    const userDomains = await prisma.domain.findMany({
      where: {
        id: { in: domainIds },
        userId: user.id,
      },
      select: { id: true },
    });

    if (userDomains.length !== domainIds.length) {
      return NextResponse.json(
        { message: "Some domains do not belong to you or do not exist" },
        { status: 403 },
      );
    }

    // Update domain orders in a transaction
    await prisma.$transaction(
      domainOrders.map((entry: any) =>
        prisma.domain.update({
          where: { id: entry.id },
          data: { order: entry.order } as any, // TODO: Fix when Prisma types are updated
        })
      )
    );

    return NextResponse.json({ message: "Domain order updated successfully" });
  } catch (error: any) {
    console.error("Error updating domain order:", error);
    return NextResponse.json(
      { message: "Failed to update domain order", error: error.message },
      { status: 500 },
    );
  }
}
