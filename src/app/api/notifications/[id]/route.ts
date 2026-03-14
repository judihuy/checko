// DELETE /api/notifications/[id] — Einzelne Benachrichtigung löschen
// Auth + Owner Check

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  // findFirst statt findUnique (Prisma Engine-Bug)
  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notification) {
    return NextResponse.json(
      { error: "Benachrichtigung nicht gefunden" },
      { status: 404 }
    );
  }

  await prisma.notification.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
