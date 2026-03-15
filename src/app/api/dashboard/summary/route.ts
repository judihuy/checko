// GET /api/dashboard/summary — Dashboard-Zusammenfassung nach Login
// Liefert: neue Treffer, Glücksrad-Status, ungelesene Benachrichtigungen

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import { getDailyWheelStatus } from "@/lib/wheel";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "dashboard-summary", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    // Parallel laden
    const [unreadNotifications, wheelStatus, newAlerts, balance] = await Promise.all([
      getUnreadCount(userId),
      getDailyWheelStatus(userId),
      // Neue Preisradar-Treffer (ungelesen)
      prisma.preisradarAlert.count({
        where: {
          search: { userId },
          isSeen: false,
        },
      }),
      // Aktueller Kontostand
      prisma.user.findFirst({
        where: { id: userId },
        select: { checkosBalance: true },
      }),
    ]);

    return NextResponse.json({
      newAlerts,
      wheelAvailable: wheelStatus.available,
      wheelBonusSpins: wheelStatus.bonusSpins || 0,
      unreadNotifications,
      checkosBalance: balance?.checkosBalance || 0,
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
