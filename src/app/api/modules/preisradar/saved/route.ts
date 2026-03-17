// POST /api/modules/preisradar/saved — Alert speichern
// GET /api/modules/preisradar/saved — Alle gespeicherten Alerts laden
// Query: ?favorites=true für nur Favoriten

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";
import { repairSearchQuery } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "preisradar-saved", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const favoritesOnly = searchParams.get("favorites") === "true";

  const where: { userId: string; isFavorite?: boolean } = {
    userId: session.user.id,
  };
  if (favoritesOnly) {
    where.isFavorite = true;
  }

  const saved = await prisma.savedAlert.findMany({
    where,
    include: {
      alert: {
        include: {
          search: {
            select: { query: true, vehicleMake: true, vehicleModel: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Query-Reparatur für Altdaten: fehlende Leerzeichen aus vehicleMake/Model rekonstruieren
  const repairedSaved = saved.map((s) => {
    const search = s.alert.search;
    const repairedQuery = repairSearchQuery(search.query, search.vehicleMake, search.vehicleModel);
    if (repairedQuery !== search.query) {
      return {
        ...s,
        alert: {
          ...s.alert,
          search: { ...search, query: repairedQuery },
        },
      };
    }
    return s;
  });

  return NextResponse.json({ saved: repairedSaved });
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "preisradar-saved", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  let body: { alertId?: string; isFavorite?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  if (!body.alertId) {
    return NextResponse.json({ error: "alertId ist erforderlich" }, { status: 400 });
  }

  // Prüfe ob Alert existiert und dem User gehört (via Search)
  const alert = await prisma.preisradarAlert.findFirst({
    where: { id: body.alertId },
    include: { search: { select: { userId: true } } },
  });

  if (!alert || alert.search.userId !== session.user.id) {
    return NextResponse.json({ error: "Alert nicht gefunden" }, { status: 404 });
  }

  // Prüfe ob bereits gespeichert
  const existing = await prisma.savedAlert.findFirst({
    where: {
      userId: session.user.id,
      alertId: body.alertId,
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Alert bereits gespeichert", saved: existing },
      { status: 409 }
    );
  }

  const saved = await prisma.savedAlert.create({
    data: {
      userId: session.user.id,
      alertId: body.alertId,
      isFavorite: body.isFavorite ?? false,
    },
  });

  return NextResponse.json({ success: true, saved }, { status: 201 });
}
