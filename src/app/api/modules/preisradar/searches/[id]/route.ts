// Preisradar Suche — Einzelaktionen
// PUT: Suche bearbeiten (Status, Suchbegriff, Preise, Plattformen)
// DELETE: Suche löschen

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const VALID_PLATFORMS = ["tutti", "ricardo", "ebay-ka", "autoscout", "comparis"];

// Zod-Schema für Update — erlaubt Pause/Aktivierung UND Bearbeitung
const updateSearchSchema = z.object({
  isActive: z.boolean().optional(),
  query: z.string().min(2).max(200).optional(),
  maxPrice: z.number().int().min(0).nullable().optional(),
  minPrice: z.number().int().min(0).nullable().optional(),
  platforms: z
    .array(z.enum(["tutti", "ricardo", "ebay-ka", "autoscout", "comparis"]))
    .min(1, "Mindestens eine Plattform auswählen")
    .optional(),
});

// PUT: Suche bearbeiten
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
    // Prüfen ob Suche dem User gehört (findFirst statt findUnique wegen Engine-Bug)
    const search = await prisma.preisradarSearch.findFirst({
      where: { id },
      select: { userId: true, expiresAt: true, isActive: true },
    });

    if (!search) {
      return NextResponse.json({ error: "Suche nicht gefunden" }, { status: 404 });
    }

    if (search.userId !== session.user.id) {
      return NextResponse.json({ error: "Zugriff verweigert" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Abgelaufene Suchen können nicht reaktiviert werden
    if (parsed.data.isActive === true && search.expiresAt && new Date() > search.expiresAt) {
      return NextResponse.json(
        { error: "Suche ist abgelaufen und kann nicht mehr aktiviert werden" },
        { status: 400 }
      );
    }

    // Update-Objekt zusammenbauen
    const updateData: Record<string, unknown> = {};

    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive;
    }
    if (parsed.data.query !== undefined) {
      updateData.query = parsed.data.query;
    }
    if (parsed.data.maxPrice !== undefined) {
      updateData.maxPrice = parsed.data.maxPrice;
    }
    if (parsed.data.minPrice !== undefined) {
      updateData.minPrice = parsed.data.minPrice;
    }
    if (parsed.data.platforms !== undefined) {
      // DB speichert Plattformen komma-getrennt
      updateData.platforms = parsed.data.platforms.join(",");
    }

    const updated = await prisma.preisradarSearch.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      search: {
        id: updated.id,
        query: updated.query,
        maxPrice: updated.maxPrice,
        minPrice: updated.minPrice,
        platforms: updated.platforms.split(","),
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
    // Prüfen ob Suche dem User gehört (findFirst statt findUnique wegen Engine-Bug)
    const search = await prisma.preisradarSearch.findFirst({
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
