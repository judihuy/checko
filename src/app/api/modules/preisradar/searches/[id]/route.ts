// Preisradar Suche — Einzelaktionen
// PUT: Suche bearbeiten (Status, Suchbegriff, Preise, Plattformen)
// DELETE: Suche löschen

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";
import { chargeForSearch, calculateExpiresAt, getSearchCost, runSearchJob } from "@/lib/scraper/scheduler";

const VALID_PLATFORMS = ["tutti", "ricardo", "ebay-ka", "autoscout", "comparis", "anibis", "google-shopping", "amazon", "willhaben"];

// Zod-Schema für Update — erlaubt Pause/Aktivierung UND Bearbeitung
const updateSearchSchema = z.object({
  isActive: z.boolean().optional(),
  activateDraft: z.boolean().optional(), // Draft → aktive Suche (Checkos abziehen)
  query: z.string().min(2).max(200).optional(),
  maxPrice: z.number().int().min(0).nullable().optional(),
  minPrice: z.number().int().min(0).nullable().optional(),
  platforms: z
    .array(z.enum(["tutti", "ricardo", "ebay-ka", "autoscout", "comparis", "anibis", "google-shopping", "amazon", "willhaben"]))
    .min(1, "Mindestens eine Plattform auswählen")
    .optional(),
  // Kategorie-Felder
  category: z.string().max(100).nullable().optional(),
  subcategory: z.string().max(100).nullable().optional(),
  vehicleMake: z.string().max(100).nullable().optional(),
  vehicleModel: z.string().max(100).nullable().optional(),
  yearFrom: z.number().int().min(1950).max(2030).nullable().optional(),
  yearTo: z.number().int().min(1950).max(2030).nullable().optional(),
  kmFrom: z.number().int().min(0).nullable().optional(),
  kmTo: z.number().int().min(0).nullable().optional(),
  fuelType: z.string().max(50).nullable().optional(),
  transmission: z.string().max(50).nullable().optional(),
  engineSizeCcm: z.number().int().min(0).nullable().optional(),
  motorcycleType: z.string().max(50).nullable().optional(),
  propertyType: z.string().max(50).nullable().optional(),
  propertyOffer: z.string().max(50).nullable().optional(),
  rooms: z.number().int().min(1).max(50).nullable().optional(),
  areaM2: z.number().int().min(1).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  furnitureType: z.string().max(100).nullable().optional(),
});

// PUT: Suche bearbeiten
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(request, "preisradar-search-edit", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Prüfen ob Suche dem User gehört (findFirst statt findUnique wegen Engine-Bug)
    const search = await prisma.preisradarSearch.findFirst({
      where: { id },
      select: { userId: true, expiresAt: true, isActive: true, isDraft: true, duration: true, qualityTier: true },
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

    // Draft aktivieren: Checkos abziehen und Suche starten
    if (parsed.data.activateDraft && search.isDraft) {
      const totalCost = getSearchCost(search.duration, search.qualityTier);
      const chargeResult = await chargeForSearch(session.user.id, search.duration, search.qualityTier);
      if (!chargeResult.success) {
        return NextResponse.json(
          {
            error: chargeResult.error || "Nicht genügend Checkos",
            cost: totalCost,
          },
          { status: 402 }
        );
      }

      const updated = await prisma.preisradarSearch.update({
        where: { id },
        data: {
          isActive: true,
          isDraft: false,
          expiresAt: calculateExpiresAt(search.duration),
          checkosCharged: chargeResult.cost,
        },
      });

      // Sofort-Suche im Hintergrund starten
      runSearchJob(updated.id).catch((err) => {
        console.error(`[Preisradar] Sofort-Suche fehlgeschlagen für ${updated.id}:`, err);
      });

      return NextResponse.json({
        success: true,
        message: "Entwurf aktiviert! Der erste Scan läuft bereits.",
        search: {
          id: updated.id,
          isActive: true,
          isDraft: false,
          checkosCharged: chargeResult.cost,
          expiresAt: updated.expiresAt,
        },
      });
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
    // Kategorie-Felder aktualisieren
    const categoryFields = [
      "category", "subcategory", "vehicleMake", "vehicleModel",
      "yearFrom", "yearTo", "kmFrom", "kmTo", "fuelType", "transmission",
      "engineSizeCcm", "motorcycleType", "propertyType", "propertyOffer",
      "rooms", "areaM2", "location", "furnitureType",
    ] as const;
    for (const field of categoryFields) {
      if (parsed.data[field] !== undefined) {
        updateData[field] = parsed.data[field];
      }
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
  const rl = checkRateLimit(_request, "preisradar-search-delete", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

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
