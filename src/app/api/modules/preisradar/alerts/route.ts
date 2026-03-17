// Preisradar Alerts API
// GET: Eigene Alerts auflisten (mit Pagination & Filter)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";
import { repairSearchQuery } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "preisradar-alerts", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    // Filter
    const searchId = searchParams.get("searchId") || undefined;
    const unseenOnly = searchParams.get("unseen") === "true";

    // Erst die IDs aller Suchen des Users laden, dann Alerts über searchId filtern.
    // Robuster als der relationale Filter `search: { userId }`, der bei manchen
    // Prisma/MySQL-Konstellationen inkonsistente Counts liefern kann.
    const userSearchIds = await prisma.preisradarSearch.findMany({
      where: { userId: session.user.id },
      select: { id: true },
    });

    const searchIdList = userSearchIds.map((s) => s.id);

    // Where-Clause aufbauen — explizit über searchId IN [...]
    const where: {
      searchId: { in: string[] } | string;
      isSeen?: boolean;
    } = {
      searchId: searchId
        ? searchId  // einzelne Suche → exakter Match
        : { in: searchIdList }, // alle Suchen des Users
    };

    if (unseenOnly) {
      where.isSeen = false;
    }

    // Alerts laden + Gesamtanzahl
    const [alerts, total] = await Promise.all([
      prisma.preisradarAlert.findMany({
        where,
        include: {
          search: {
            select: { query: true, vehicleMake: true, vehicleModel: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.preisradarAlert.count({ where }),
    ]);

    // Alerts formatieren
    const formattedAlerts = alerts.map((alert) => {
      // AI-Analyse parsen
      let aiData: { bewertung?: string; warnung?: string; score?: number; details?: string } | null = null;
      if (alert.aiAnalysis) {
        try {
          aiData = JSON.parse(alert.aiAnalysis);
        } catch {
          aiData = null;
        }
      }

      // Detail-Analyse parsen (falls vorhanden)
      let detailAnalysis = null;
      if (alert.detailAnalysis) {
        try {
          detailAnalysis = JSON.parse(alert.detailAnalysis);
        } catch {
          detailAnalysis = null;
        }
      }

      // Query-Reparatur: Falls Leerzeichen fehlen, aus vehicleMake/Model rekonstruieren
      const searchQuery = repairSearchQuery(
        alert.search.query,
        alert.search.vehicleMake,
        alert.search.vehicleModel,
      );

      return {
        id: alert.id,
        title: alert.title,
        price: alert.price,
        platform: alert.platform,
        url: alert.url,
        imageUrl: alert.imageUrl,
        priceScore: alert.priceScore ? parseInt(alert.priceScore, 10) : null,
        bewertung: aiData?.bewertung || null,
        warnung: aiData?.warnung || null,
        details: aiData?.details || null,
        isScam: alert.isScam,
        isSeen: alert.isSeen,
        searchQuery,
        searchId: alert.searchId,
        createdAt: alert.createdAt,
        detailAnalysis,
      };
    });

    return NextResponse.json({
      alerts: formattedAlerts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Preisradar alerts list error:", error);
    return NextResponse.json(
      { error: "Interner Fehler beim Laden der Alerts" },
      { status: 500 }
    );
  }
}
