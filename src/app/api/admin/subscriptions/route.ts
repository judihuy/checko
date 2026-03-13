// Admin API: Subscription management
// GET — list all subscriptions

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: { select: { name: true, email: true } },
        module: { select: { name: true, slug: true, priceMonthly: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error("Error fetching subscriptions:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
