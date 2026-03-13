// Preisradar Alert — Einzelaktionen
// PUT: Alert als gelesen markieren

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Alert finden und prüfen ob er dem User gehört
    const alert = await prisma.preisradarAlert.findUnique({
      where: { id },
      include: {
        search: {
          select: { userId: true },
        },
      },
    });

    if (!alert) {
      return NextResponse.json({ error: "Alert nicht gefunden" }, { status: 404 });
    }

    if (alert.search.userId !== session.user.id) {
      return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
    }

    // Als gelesen markieren
    await prisma.preisradarAlert.update({
      where: { id },
      data: { isSeen: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Preisradar alert update error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}
