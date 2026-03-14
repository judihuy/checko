// GET /api/notifications/count — Anzahl ungelesener Benachrichtigungen

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const count = await getUnreadCount(session.user.id);
  return NextResponse.json({ count });
}
