// GET /api/notifications/ids — Alle Notification-IDs des Users laden
// Für "Alle auswählen" Feature: lädt nur die IDs, nicht die vollen Objekte
// Query params: ?category=wheel (optional)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "notifications-ids", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") || undefined;

  const where: { userId: string; category?: string } = {
    userId: session.user.id,
  };
  if (category) {
    where.category = category;
  }

  const notifications = await prisma.notification.findMany({
    where,
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  const ids = notifications.map((n) => n.id);

  return NextResponse.json({ ids, total: ids.length });
}
