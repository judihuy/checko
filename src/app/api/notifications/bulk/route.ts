// DELETE /api/notifications/bulk — Mehrere Benachrichtigungen löschen
// Body: { ids: string[] } oder { readOnly: true } oder { all: true } oder { category: "..." }
//
// Modi:
// 1. { all: true }              → ALLE Benachrichtigungen des Users löschen
// 2. { all: true, category: X } → Alle einer Kategorie löschen
// 3. { readOnly: true }         → Alle gelesenen löschen
// 4. { ids: [...] }             → Bestimmte IDs löschen (max 500 pro Batch)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

export async function DELETE(request: NextRequest) {
  const rl = checkRateLimit(request, "notifications-bulk-delete", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let body: { ids?: string[]; readOnly?: boolean; all?: boolean; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  // Modus 1: ALLE Benachrichtigungen löschen (optional nach Kategorie gefiltert)
  if (body.all === true) {
    const where: { userId: string; category?: string } = {
      userId: session.user.id,
    };
    if (body.category) {
      where.category = body.category;
    }

    const result = await prisma.notification.deleteMany({ where });
    return NextResponse.json({ success: true, deleted: result.count });
  }

  // Modus 2: Alle gelesenen löschen
  if (body.readOnly === true) {
    const result = await prisma.notification.deleteMany({
      where: {
        userId: session.user.id,
        isRead: true,
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  }

  // Modus 3: Bestimmte IDs löschen (max 500 pro Batch)
  if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.slice(0, 500);

    const result = await prisma.notification.deleteMany({
      where: {
        id: { in: ids },
        userId: session.user.id, // Owner Check
      },
    });

    return NextResponse.json({ success: true, deleted: result.count });
  }

  return NextResponse.json(
    { error: "Bitte 'ids' Array, 'readOnly: true' oder 'all: true' angeben" },
    { status: 400 }
  );
}
