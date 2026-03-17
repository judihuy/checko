// Preisradar Scheduler
// Führt Suchjobs aus: Scrape → Filter → KI-Bewertung → DB → E-Mail

import { prisma } from "@/lib/prisma";
import { getScrapersByPlatformList } from "@/lib/scraper";
import type { ScraperResult } from "@/lib/scraper";
import { analyzePrice } from "@/lib/ai/price-analyzer";
import { deductCheckos } from "@/lib/checkos";
import { sendPreisradarAlertEmail } from "@/lib/email-preisradar";
import { createNotification } from "@/lib/notifications";
import { getPlatformDisplayName } from "@/lib/platform-names";
import { getSetting } from "@/lib/settings";
import { filterWithAI } from "@/lib/scraper/ai-filter";

// Basiskosten pro Dauer (Standard-Stufe)
const DURATION_BASE_COSTS: Record<string, number> = {
  "1d": 1,   // 1 Tag = 1 Checko (Standard)
  "1w": 5,   // 1 Woche = 5 Checkos (Standard)
  "1m": 15,  // 1 Monat = 15 Checkos (Standard)
};

// Qualitäts-Multiplikatoren
const QUALITY_MULTIPLIERS: Record<string, number> = {
  standard: 1,  // 1x Basispreis
  premium: 2,   // 2x Basispreis
  pro: 4,       // 4x Basispreis
};

// Dauer → Millisekunden
const DURATION_MS: Record<string, number> = {
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
};

/**
 * Einzelnen Suchjob ausführen
 */
export async function runSearchJob(searchId: string): Promise<{
  success: boolean;
  newAlerts: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let newAlerts = 0;

  try {
    // Suche laden
    const search = await prisma.preisradarSearch.findFirst({
      where: { id: searchId },
      include: { user: { select: { id: true, email: true, name: true, checkosBalance: true } } },
    });

    if (!search || !search.isActive) {
      return { success: false, newAlerts: 0, errors: ["Suche nicht gefunden oder inaktiv"] };
    }

    // Ablauf prüfen
    if (search.expiresAt && new Date() > search.expiresAt) {
      await prisma.preisradarSearch.update({
        where: { id: searchId },
        data: { isActive: false },
      });
      return { success: false, newAlerts: 0, errors: ["Suche abgelaufen"] };
    }

    // Scraper für gewählte Plattformen holen
    const scrapers = getScrapersByPlatformList(search.platforms);

    if (scrapers.length === 0) {
      errors.push("Keine Scraper für die gewählten Plattformen verfügbar");
      return { success: false, newAlerts: 0, errors };
    }

    // Alle Plattformen PARALLEL scrapen (Promise.allSettled)
    const allResults: ScraperResult[] = [];

    console.log(`[Scheduler] Starte parallelen Scrape für ${scrapers.length} Plattformen: "${search.query}"...`);
    const scrapePromises = scrapers.map(async (scraper) => {
      const scraperStart = Date.now();
      const results = await scraper.scrape(search.query, {
        minPrice: search.minPrice || undefined,
        maxPrice: search.maxPrice || undefined,
        limit: 20,
        // Kategorie-spezifische Felder durchreichen
        category: search.category || undefined,
        subcategory: search.subcategory || undefined,
        vehicleMake: search.vehicleMake || undefined,
        vehicleModel: search.vehicleModel || undefined,
        yearFrom: search.yearFrom || undefined,
        yearTo: search.yearTo || undefined,
        kmFrom: search.kmFrom || undefined,
        kmTo: search.kmTo || undefined,
        fuelType: search.fuelType || undefined,
        transmission: search.transmission || undefined,
        engineSizeCcm: search.engineSizeCcm || undefined,
        motorcycleType: search.motorcycleType || undefined,
        propertyType: search.propertyType || undefined,
        propertyOffer: search.propertyOffer || undefined,
        rooms: search.rooms || undefined,
        areaM2: search.areaM2 || undefined,
        location: search.location || undefined,
        furnitureType: search.furnitureType || undefined,
      });
      const durationMs = Date.now() - scraperStart;
      return { scraper, results, durationMs };
    });

    const scrapeResults = await Promise.allSettled(scrapePromises);

    for (const result of scrapeResults) {
      if (result.status === "fulfilled") {
        const { scraper, results, durationMs } = result.value;
        if (results.length === 0) {
          const msg = `[Scheduler] ${scraper.displayName}: 0 Treffer nach ${durationMs}ms — möglicherweise blockiert oder Parse-Fehler`;
          console.warn(msg);
          errors.push(msg);
        } else {
          console.log(`[Scheduler] ${scraper.displayName}: ${results.length} Treffer in ${durationMs}ms`);
        }
        allResults.push(...results);
      } else {
        const errorDetail = result.reason instanceof Error
          ? `${result.reason.message}${result.reason.stack ? `\n${result.reason.stack.split("\n").slice(0, 3).join("\n")}` : ""}`
          : String(result.reason);
        const msg = `[Scheduler] Scraper FEHLER: ${errorDetail}`;
        errors.push(msg);
        console.error(msg);
      }
    }

    // === SERVER-SIDE STRICT PRICE + YEAR FILTER ===
    // Even if scrapers already filter, we double-check here to ensure
    // no premium/spotlight/overpriced results slip through
    const filteredResults = allResults.filter((r) => {
      // Strict price filter: reject anything over maxPrice
      if (search.maxPrice && r.price > 0 && r.price > search.maxPrice) {
        console.log(`[Scheduler] Price filter: "${r.title.substring(0, 50)}" price ${r.price} > max ${search.maxPrice} → REMOVED`);
        return false;
      }
      // Strict minPrice filter
      if (search.minPrice && r.price > 0 && r.price < search.minPrice) {
        return false;
      }

      // Strict year filter: extract year from title and reject out-of-range
      // Applies when yearFrom or yearTo are set (typically vehicle searches)
      if (search.yearFrom || search.yearTo) {
        const yearMatch = r.title.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
        if (yearMatch) {
          const titleYear = parseInt(yearMatch[1], 10);
          if (search.yearFrom && titleYear < search.yearFrom) {
            console.log(`[Scheduler] Year filter: "${r.title.substring(0, 50)}" year ${titleYear} < min ${search.yearFrom} → REMOVED`);
            return false;
          }
          if (search.yearTo && titleYear > search.yearTo) {
            console.log(`[Scheduler] Year filter: "${r.title.substring(0, 50)}" year ${titleYear} > max ${search.yearTo} → REMOVED`);
            return false;
          }
        }
        // If no year found in title, let it through — AI filter can catch it later
      }

      return true;
    });

    if (filteredResults.length < allResults.length) {
      console.log(`[Scheduler] Server-side hard filter removed ${allResults.length - filteredResults.length} results`);
    }

    // Duplikate filtern (gleicher Titel + Preis + Plattform)
    const existingAlerts = await prisma.preisradarAlert.findMany({
      where: { searchId },
      select: { url: true },
    });
    const existingUrls = new Set(existingAlerts.map((a) => a.url));

    const newResultsBeforeAI = filteredResults.filter((r) => !existingUrls.has(r.url));

    // KI-Nachfilterung: Claude Haiku prüft Relevanz jedes Ergebnisses
    let newResults = newResultsBeforeAI;
    try {
      const aiFilterOptions = {
        minPrice: search.minPrice || undefined,
        maxPrice: search.maxPrice || undefined,
        category: search.category || undefined,
        subcategory: search.subcategory || undefined,
        vehicleMake: search.vehicleMake || undefined,
        vehicleModel: search.vehicleModel || undefined,
        yearFrom: search.yearFrom || undefined,
        yearTo: search.yearTo || undefined,
        kmFrom: search.kmFrom || undefined,
        kmTo: search.kmTo || undefined,
        fuelType: search.fuelType || undefined,
        transmission: search.transmission || undefined,
        propertyType: search.propertyType || undefined,
        propertyOffer: search.propertyOffer || undefined,
        rooms: search.rooms || undefined,
        areaM2: search.areaM2 || undefined,
        location: search.location || undefined,
        furnitureType: search.furnitureType || undefined,
      };
      newResults = await filterWithAI(newResultsBeforeAI, aiFilterOptions, search.query);
      if (newResults.length < newResultsBeforeAI.length) {
        console.log(`[Scheduler] KI-Filter: ${newResultsBeforeAI.length - newResults.length} irrelevante Ergebnisse entfernt`);
      }
    } catch (aiFilterError) {
      console.warn("[Scheduler] KI-Filter fehlgeschlagen — alle Ergebnisse durchgelassen:", aiFilterError);
      newResults = newResultsBeforeAI;
    }

    // KI-Bewertung für neue Treffer — mit qualityTier!
    const alertsToCreate: Array<{
      title: string;
      price: number;
      platform: string;
      url: string;
      imageUrl: string | null;
      description: string | null;
      priceScore: string | null;
      aiAnalysis: string | null;
      isScam: boolean;
    }> = [];

    // Kategorie-String für KI-Prompt zusammenbauen
    const categoryLabel = [search.category, search.subcategory].filter(Boolean).join(" > ") || undefined;

    for (const result of newResults) {
      try {
        const analysis = await analyzePrice(
          result.title,
          result.price,
          result.platform,
          categoryLabel,
          result.description || undefined,
          search.qualityTier
        );

        alertsToCreate.push({
          title: result.title,
          price: result.price,
          platform: result.platform,
          url: result.url,
          imageUrl: result.imageUrl,
          description: result.description || null,
          priceScore: String(analysis.priceScore),
          aiAnalysis: JSON.stringify({
            bewertung: analysis.bewertung,
            warnung: analysis.warnung,
            score: analysis.priceScore,
            details: analysis.details,
          }),
          isScam: analysis.isScam,
        });
      } catch (error) {
        // KI-Fehler: Trotzdem speichern, ohne Bewertung
        alertsToCreate.push({
          title: result.title,
          price: result.price,
          platform: result.platform,
          url: result.url,
          imageUrl: result.imageUrl,
          description: result.description || null,
          priceScore: null,
          aiAnalysis: null,
          isScam: false,
        });
        errors.push(`KI-Analyse fehlgeschlagen für "${result.title}"`);
      }
    }

    // In DB speichern
    if (alertsToCreate.length > 0) {
      await prisma.preisradarAlert.createMany({
        data: alertsToCreate.map((alert) => ({
          ...alert,
          searchId,
        })),
      });
      newAlerts = alertsToCreate.length;
    }

    // lastScrapedAt aktualisieren
    await prisma.preisradarSearch.update({
      where: { id: searchId },
      data: { lastScrapedAt: new Date() },
    });

    // In-App Benachrichtigungen erstellen für neue Treffer (mit Bild)
    if (newAlerts > 0) {
      for (const alert of alertsToCreate) {
        try {
          const priceFormatted = (alert.price / 100).toLocaleString("de-CH", {
            style: "currency",
            currency: "CHF",
          });
          const scoreText = alert.priceScore ? ` — Preis-Score: ${alert.priceScore}` : "";

          await createNotification(
            search.user.id,
            "preisradar_alert",
            `Neuer Treffer: ${alert.title}`,
            `${priceFormatted} auf ${getPlatformDisplayName(alert.platform)}${scoreText}`,
            alert.url,
            undefined,
            alert.imageUrl || undefined
          );
        } catch (notifError) {
          errors.push(`Benachrichtigung erstellen fehlgeschlagen: ${notifError instanceof Error ? notifError.message : String(notifError)}`);
        }
      }
    }

    // E-Mail senden wenn neue Treffer
    if (newAlerts > 0 && search.user.email) {
      try {
        await sendPreisradarAlertEmail(
          search.user.email,
          search.user.name || "Benutzer",
          search.query,
          newAlerts
        );
      } catch (emailError) {
        errors.push(`E-Mail senden fehlgeschlagen: ${emailError instanceof Error ? emailError.message : String(emailError)}`);
      }
    }

    return { success: true, newAlerts, errors };
  } catch (error) {
    console.error("runSearchJob error:", error);
    return {
      success: false,
      newAlerts: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Alle aktiven Suchen verarbeiten
 * Berücksichtigt das Intervall jeder Suche:
 * - Nur scrapen wenn lastScrapedAt + interval Minuten vergangen ist
 * - Neue Suchen (lastScrapedAt = null) werden sofort gescrapt
 */
export async function runAllActiveSearches(): Promise<{
  totalSearches: number;
  totalNewAlerts: number;
  skippedSearches: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let totalNewAlerts = 0;
  let skippedSearches = 0;

  try {
    // Alle aktiven, nicht abgelaufenen Suchen finden
    const activeSearches = await prisma.preisradarSearch.findMany({
      where: {
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { id: true, interval: true, lastScrapedAt: true, query: true },
    });

    console.log(`[Scheduler] ${activeSearches.length} aktive Suchen gefunden, prüfe Intervalle...`);

    const now = Date.now();

    for (const search of activeSearches) {
      // Intervall-Prüfung: Nur scrapen wenn genug Zeit vergangen ist
      if (search.lastScrapedAt) {
        const intervalMs = (search.interval || 30) * 60 * 1000;
        const timeSinceLastScrape = now - search.lastScrapedAt.getTime();

        if (timeSinceLastScrape < intervalMs) {
          const remainingMin = Math.ceil((intervalMs - timeSinceLastScrape) / 60000);
          console.log(`[Scheduler] Suche "${search.query}" übersprungen — nächster Lauf in ${remainingMin} Min (Intervall: ${search.interval}min)`);
          skippedSearches++;
          continue;
        }
      }

      console.log(`[Scheduler] Starte Suche "${search.query}" (Intervall: ${search.interval}min)...`);
      const result = await runSearchJob(search.id);
      totalNewAlerts += result.newAlerts;
      errors.push(...result.errors);

      console.log(`[Scheduler] Suche ${search.id}: ${result.newAlerts} neue Alerts, ${result.errors.length} Fehler, Erfolg: ${result.success}`);

      // Kurze Pause zwischen Suchen
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const executedCount = activeSearches.length - skippedSearches;
    console.log(`[Scheduler] Fertig: ${executedCount}/${activeSearches.length} Suchen ausgeführt (${skippedSearches} übersprungen), ${totalNewAlerts} neue Alerts, ${errors.length} Fehler`);

    return {
      totalSearches: activeSearches.length,
      totalNewAlerts,
      skippedSearches,
      errors,
    };
  } catch (error) {
    return {
      totalSearches: 0,
      totalNewAlerts: 0,
      skippedSearches: 0,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Gesamtkosten für eine Suche berechnen (Dauer × Qualität)
 */
export function getSearchCost(duration: string, qualityTier: string = "standard"): number {
  const baseCost = DURATION_BASE_COSTS[duration] || 1;
  const multiplier = QUALITY_MULTIPLIERS[qualityTier] || 1;
  return baseCost * multiplier;
}

/**
 * Checkos für eine neue Suche abziehen
 * Berücksichtigt sowohl Dauer ALS AUCH Qualitätsstufe
 */
export async function chargeForSearch(
  userId: string,
  duration: string,
  qualityTier: string = "standard"
): Promise<{ success: boolean; cost: number; error?: string }> {
  const cost = getSearchCost(duration, qualityTier);

  const durationLabel = duration === "1d" ? "1 Tag" : duration === "1w" ? "1 Woche" : "1 Monat";
  const tierLabel = qualityTier === "premium" ? "Premium" : qualityTier === "pro" ? "Pro" : "Standard";

  const result = await deductCheckos(
    userId,
    cost,
    "preisradar",
    qualityTier,
    `Preisradar-Suche (${durationLabel}, ${tierLabel})`
  );

  if (!result.success) {
    return { success: false, cost, error: result.error };
  }

  return { success: true, cost };
}

/**
 * Ablaufdatum berechnen
 */
export function calculateExpiresAt(duration: string): Date {
  const ms = DURATION_MS[duration] || DURATION_MS["1d"];
  return new Date(Date.now() + ms);
}

/**
 * Basiskosten für eine Dauer abfragen (ohne Qualitäts-Multiplikator)
 */
export function getDurationCost(duration: string): number {
  return DURATION_BASE_COSTS[duration] || 1;
}

/**
 * Qualitäts-Multiplikator abfragen
 */
export function getQualityMultiplier(qualityTier: string): number {
  return QUALITY_MULTIPLIERS[qualityTier] || 1;
}
