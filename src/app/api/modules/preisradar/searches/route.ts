// Preisradar Suchen API
// POST: Neue Suche erstellen
// GET: Eigene Suchen auflisten

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { chargeForSearch, calculateExpiresAt, getSearchCost } from "@/lib/scraper/scheduler";

// Zod-Schema für neue Suche
const createSearchSchema = z.object({
  query: z.string().min(2, "Suchbegriff muss mindestens 2 Zeichen haben").max(200),
  maxPrice: z.number().int().positive().optional(),
  minPrice: z.number().int().nonnegative().optional(),
  platforms: z.array(z.enum(["tutti", "ricardo", "ebay-ka", "autoscout", "comparis"])).min(1, "Mindestens 1 Plattform wählen"),
  duration: z.enum(["1d", "1w", "1m"]).default("1d"),
  qualityTier: z.enum(["standard", "premium", "pro"]).default("standard"),
});

// POST: Neue Suche erstellen
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = createSearchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { query, maxPrice, minPrice, platforms, duration, qualityTier } = parsed.data;

    // Preisvalidierung
    if (minPrice && maxPrice && minPrice > maxPrice) {
      return NextResponse.json(
        { error: "Mindestpreis darf nicht höher als Höchstpreis sein" },
        { status: 400 }
      );
    }

    // Kosten berechnen (Dauer × Qualität)
    const totalCost = getSearchCost(duration, qualityTier);

    // Checkos abziehen — mit qualityTier!
    const chargeResult = await chargeForSearch(session.user.id, duration, qualityTier);
    if (!chargeResult.success) {
      return NextResponse.json(
        {
          error: chargeResult.error || "Nicht genügend Checkos",
          cost: totalCost,
        },
        { status: 402 }
      );
    }

    // Suche erstellen
    const search = await prisma.preisradarSearch.create({
      data: {
        userId: session.user.id,
        query,
        maxPrice: maxPrice || null,
        minPrice: minPrice || null,
        platforms: platforms.join(","),
        duration,
        qualityTier,
        expiresAt: calculateExpiresAt(duration),
        checkosCharged: chargeResult.cost,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      search: {
        id: search.id,
        query: search.query,
        platforms: search.platforms,
        duration: search.duration,
        qualityTier: search.qualityTier,
        expiresAt: search.expiresAt,
        checkosCharged: search.checkosCharged,
      },
    });
  } catch (error) {
    console.error("Preisradar search create error:", error);
    return NextResponse.json(
      { error: "Interner Fehler beim Erstellen der Suche" },
      { status: 500 }
    );
  }
}

// GET: Eigene Suchen auflisten
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const searches = await prisma.preisradarSearch.findMany({
      where: { userId: session.user.id },
      include: {
        _count: {
          select: { alerts: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Status berechnen
    const searchesWithStatus = searches.map((s) => {
      let status: "aktiv" | "pausiert" | "abgelaufen" = "aktiv";
      if (!s.isActive) status = "pausiert";
      if (s.expiresAt && new Date() > s.expiresAt) status = "abgelaufen";

      return {
        id: s.id,
        query: s.query,
        maxPrice: s.maxPrice,
        minPrice: s.minPrice,
        platforms: s.platforms.split(","),
        duration: s.duration,
        qualityTier: s.qualityTier,
        status,
        alertCount: s._count.alerts,
        expiresAt: s.expiresAt,
        lastScrapedAt: s.lastScrapedAt,
        checkosCharged: s.checkosCharged,
        createdAt: s.createdAt,
      };
    });

    return NextResponse.json({ searches: searchesWithStatus });
  } catch (error) {
    console.error("Preisradar searches list error:", error);
    return NextResponse.json(
      { error: "Interner Fehler beim Laden der Suchen" },
      { status: 500 }
    );
  }
}
