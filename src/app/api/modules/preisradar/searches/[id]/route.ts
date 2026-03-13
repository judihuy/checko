// Preisradar Suche — Einzelaktionen
// PUT: Suche pausieren/aktivieren
// DELETE: Suche löschen

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Zod-Schema für Update
const updateSearchSchema = z.object({
  isActive: z.boolean().optional(),
});

// PUT: Suche pausieren/aktivieren
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Prüfen ob Suche dem User gehört
    const search = await prisma.preisradarSearch.findUnique({
      where: { id },
      select: { userId: true, expiresAt: true },
    });

    if (!search) {
      return NextResponse.json({ error: "Suche nicht gefunden" }, { status: 404 });
    }

    if (search.userId !== session.user.id) {
      return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
    }

    // Abgelaufene Suchen können nicht reaktiviert werden
    if (search.expiresAt && new Date() > search.expiresAt) {
      return NextResponse.json(
        { error: "Suche ist abgelaufen und kann nicht mehr aktiviert werden" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updated = await prisma.preisradarSearch.update({
      where: { id },
      data: {
        isActive: parsed.data.isActive,
      },
    });

    return NextResponse.json({
      success: true,
      search: {
        id: updated.id,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    console.error("Preisradar search update error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}

// DELETE: Suche löschen (inkl. aller Alerts)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Prüfen ob Suche dem User gehört
    const search = await prisma.preisradarSearch.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!search) {
      return NextResponse.json({ error: "Suche nicht gefunden" }, { status: 404 });
    }

    if (search.userId !== session.user.id) {
      return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
    }

    // Suche löschen (Alerts werden durch onDelete: Cascade automatisch gelöscht)
    await prisma.preisradarSearch.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Preisradar search delete error:", error);
    return NextResponse.json(
      { error: "Interner Fehler" },
      { status: 500 }
    );
  }
}
