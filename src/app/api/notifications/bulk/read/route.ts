// PUT /api/notifications/bulk/read — Ausgewählte Benachrichtigungen als gelesen markieren
// Body: { ids: string[] }

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function PUT(request: NextRequest) {
  const rl = checkRateLimit(request, "notifications-bulk-read", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json(
      { error: "Bitte 'ids' Array angeben" },
      { status: 400 }
    );
  }

  // Max 100 auf einmal
  const ids = body.ids.slice(0, 100);

  const result = await prisma.notification.updateMany({
    where: {
      id: { in: ids },
      userId: session.user.id,
      isRead: false,
    },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true, updated: result.count });
}
