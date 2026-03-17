// Preisradar Suchen API
// POST: Neue Suche erstellen (+ Sofort-Suche im Hintergrund)
// GET: Eigene Suchen auflisten

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { chargeForSearch, calculateExpiresAt, getSearchCost, runSearchJob } from "@/lib/scraper/scheduler";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";
import { repairSearchQuery } from "@/lib/utils";

// Intervall-Optionen nach Qualitätsstufe
const TIER_INTERVALS: Record<string, number> = {
  standard: 1440, // Alle 24 Stunden
  premium: 720,   // Alle 12 Stunden
  pro: 5,         // Alle 5 Minuten
};

// Zod-Schema für neue Suche
const createSearchSchema = z.object({
  query: z.string().max(200).default(""),
  maxPrice: z.number().int().nonnegative().optional(),
  minPrice: z.number().int().nonnegative().optional(),
  platforms: z.array(z.enum(["tutti", "ricardo", "carforyou", "ebay-ka", "autoscout", "comparis", "anibis", "google-shopping", "amazon", "willhaben"])).min(1, "Mindestens 1 Plattform wählen"),
  duration: z.enum(["1d", "1w", "1m"]).default("1d"),
  qualityTier: z.enum(["standard", "premium", "pro"]).default("standard"),
  interval: z.number().int().min(5).max(1440).optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  condition: z.string().max(50).optional(),
  isDraft: z.boolean().default(false),
  // Fahrzeug-Felder
  vehicleMake: z.string().max(100).optional(),
  vehicleModel: z.string().max(100).optional(),
  yearFrom: z.number().int().min(1950).max(2030).optional(),
  yearTo: z.number().int().min(1950).max(2030).optional(),
  kmFrom: z.number().int().min(0).optional(),
  kmTo: z.number().int().min(0).optional(),
  fuelType: z.string().max(50).optional(),
  transmission: z.string().max(50).optional(),
  engineSizeCcm: z.number().int().min(0).optional(),
  motorcycleType: z.string().max(50).optional(),
  // Immobilien-Felder
  propertyType: z.string().max(50).optional(),
  propertyOffer: z.string().max(50).optional(),
  rooms: z.number().int().min(1).max(50).optional(),
  areaM2: z.number().int().min(1).optional(),
  location: z.string().max(200).optional(),
  // Möbel-Felder
  furnitureType: z.string().max(100).optional(),
});

// POST: Neue Suche erstellen
export async function POST(request: NextRequest) {
  const rl = checkRateLimit(request, "preisradar-searches", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

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

    const { 
      query, maxPrice, minPrice, platforms, duration, qualityTier, isDraft,
      category: searchCategory, subcategory: searchSubcategory, condition: searchCondition,
      vehicleMake, vehicleModel, yearFrom, yearTo, kmFrom, kmTo, fuelType, transmission,
      engineSizeCcm, motorcycleType,
      propertyType, propertyOffer, rooms, areaM2, location: searchLocation,
      furnitureType,
    } = parsed.data;

    // Auto-fill query from structured fields if empty
    let finalQuery = query.trim();
    if (!finalQuery && vehicleMake) {
      finalQuery = vehicleMake;
      if (vehicleModel) finalQuery += ' ' + vehicleModel;
    }
    if (!finalQuery && propertyType) {
      const propLabels: Record<string, string> = { wohnung: "Wohnung", haus: "Haus", grundstueck: "Grundstück", gewerbe: "Gewerbe" };
      const offerLabels: Record<string, string> = { miete: "Miete", kauf: "Kauf" };
      finalQuery = [propLabels[propertyType] || propertyType, propertyOffer ? offerLabels[propertyOffer] || "" : "", searchLocation || ""].filter(Boolean).join(" ") || "Immobilie";
    }
    if (!finalQuery || finalQuery.length < 2) {
      return NextResponse.json(
        { error: "Suchbegriff, Fahrzeug-Marke oder Immobilientyp muss angegeben werden" },
        { status: 400 }
      );
    }

    // Intervall: Entweder explizit gesetzt oder vom Tier abgeleitet
    const interval = parsed.data.interval || TIER_INTERVALS[qualityTier] || 30;

    // Preisvalidierung
    if (minPrice && maxPrice && minPrice > maxPrice) {
      return NextResponse.json(
        { error: "Mindestpreis darf nicht höher als Höchstpreis sein" },
        { status: 400 }
      );
    }

    // Kosten berechnen (Dauer × Qualität)
    const totalCost = getSearchCost(duration, qualityTier);

    // Draft-Modus: Speichern OHNE Checkos abzuziehen
    if (isDraft) {
      const search = await prisma.preisradarSearch.create({
        data: {
          userId: session.user.id,
          query: finalQuery,
          maxPrice: maxPrice || null,
          minPrice: minPrice || null,
          platforms: platforms.join(","),
          category: searchCategory || null,
          subcategory: searchSubcategory || null,
          condition: searchCondition || null,
          vehicleMake: vehicleMake || null,
          vehicleModel: vehicleModel || null,
          yearFrom: yearFrom || null,
          yearTo: yearTo || null,
          kmFrom: kmFrom || null,
          kmTo: kmTo || null,
          fuelType: fuelType || null,
          transmission: transmission || null,
          engineSizeCcm: engineSizeCcm || null,
          motorcycleType: motorcycleType || null,
          propertyType: propertyType || null,
          propertyOffer: propertyOffer || null,
          rooms: rooms || null,
          areaM2: areaM2 || null,
          location: searchLocation || null,
          furnitureType: furnitureType || null,
          duration,
          qualityTier,
          interval,
          expiresAt: null, // Kein Ablaufdatum für Drafts
          checkosCharged: 0,
          isActive: false,
          isDraft: true,
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
          interval: search.interval,
          expiresAt: search.expiresAt,
          checkosCharged: 0,
          isDraft: true,
        },
        message: "Suche als Entwurf gespeichert.",
      });
    }

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
        query: finalQuery,
        maxPrice: maxPrice || null,
        minPrice: minPrice || null,
        platforms: platforms.join(","),
        category: searchCategory || null,
        subcategory: searchSubcategory || null,
        condition: searchCondition || null,
        vehicleMake: vehicleMake || null,
        vehicleModel: vehicleModel || null,
        yearFrom: yearFrom || null,
        yearTo: yearTo || null,
        kmFrom: kmFrom || null,
        kmTo: kmTo || null,
        fuelType: fuelType || null,
        transmission: transmission || null,
        engineSizeCcm: engineSizeCcm || null,
        motorcycleType: motorcycleType || null,
        propertyType: propertyType || null,
        propertyOffer: propertyOffer || null,
        rooms: rooms || null,
        areaM2: areaM2 || null,
        location: searchLocation || null,
        furnitureType: furnitureType || null,
        duration,
        qualityTier,
        interval,
        expiresAt: calculateExpiresAt(duration),
        checkosCharged: chargeResult.cost,
        isActive: true,
        isDraft: false,
      },
    });

    // Feature A: Sofort-Suche im Hintergrund (fire-and-forget)
    runSearchJob(search.id).catch((err) => {
      console.error(`[Preisradar] Sofort-Suche fehlgeschlagen für ${search.id}:`, err);
    });

    return NextResponse.json({
      success: true,
      search: {
        id: search.id,
        query: search.query,
        platforms: search.platforms,
        duration: search.duration,
        qualityTier: search.qualityTier,
        interval: search.interval,
        expiresAt: search.expiresAt,
        checkosCharged: search.checkosCharged,
      },
      message: "Suche erstellt! Der erste Scan läuft bereits im Hintergrund.",
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
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(request, "preisradar-searches", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

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
      let status: "aktiv" | "pausiert" | "abgelaufen" | "entwurf" = "aktiv";
      if (s.isDraft) status = "entwurf";
      else if (!s.isActive) status = "pausiert";
      if (!s.isDraft && s.expiresAt && new Date() > s.expiresAt) status = "abgelaufen";

      // Query-Reparatur: Altdaten wo z.B. "seattoledo" statt "Seat Toledo" gespeichert wurde
      const displayQuery = repairSearchQuery(s.query, s.vehicleMake, s.vehicleModel);

      return {
        id: s.id,
        query: displayQuery,
        maxPrice: s.maxPrice,
        minPrice: s.minPrice,
        platforms: s.platforms.split(","),
        duration: s.duration,
        qualityTier: s.qualityTier,
        interval: s.interval,
        status,
        isDraft: s.isDraft,
        alertCount: s._count.alerts,
        expiresAt: s.expiresAt,
        lastScrapedAt: s.lastScrapedAt,
        checkosCharged: s.checkosCharged,
        createdAt: s.createdAt,
        // Kategorie-Felder
        category: s.category,
        subcategory: s.subcategory,
        condition: s.condition,
        // Fahrzeug
        vehicleMake: s.vehicleMake,
        vehicleModel: s.vehicleModel,
        yearFrom: s.yearFrom,
        yearTo: s.yearTo,
        kmFrom: s.kmFrom,
        kmTo: s.kmTo,
        fuelType: s.fuelType,
        transmission: s.transmission,
        engineSizeCcm: s.engineSizeCcm,
        motorcycleType: s.motorcycleType,
        // Immobilien
        propertyType: s.propertyType,
        propertyOffer: s.propertyOffer,
        rooms: s.rooms,
        areaM2: s.areaM2,
        location: s.location,
        // Möbel
        furnitureType: s.furnitureType,
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
