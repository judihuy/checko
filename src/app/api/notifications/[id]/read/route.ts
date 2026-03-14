// PUT /api/notifications/[id]/read — Benachrichtigung als gelesen markieren

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { markAsRead } from "@/lib/notifications";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const result = await markAsRead(id, session.user.id);

  if (!result) {
    return NextResponse.json(
      { error: "Benachrichtigung nicht gefunden" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
