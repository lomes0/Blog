import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness/readiness probe for container orchestrators. Confirms the app is
// serving and the database is reachable. Returns 503 (not 500) on DB failure
// so a load balancer drains this instance instead of sending it traffic.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up" });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ status: "error", db: "down" }, { status: 503 });
  }
}
