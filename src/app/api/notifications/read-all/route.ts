// PUT /api/notifications/read-all — Alle Benachrichtigungen als gelesen markieren

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markAllAsRead } from "@/lib/notifications";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function PUT(request: Request) {
  const rl = checkRateLimit(request, "notifications-read-all", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const result = await markAllAsRead(session.user.id);
  return NextResponse.json({ success: true, count: result.count });
}
