// PUT /api/notifications/read-all — Alle Benachrichtigungen als gelesen markieren

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markAllAsRead } from "@/lib/notifications";

export async function PUT() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const result = await markAllAsRead(session.user.id);
  return NextResponse.json({ success: true, count: result.count });
}
