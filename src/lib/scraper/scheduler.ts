// Preisradar Scheduler
// Führt Suchjobs aus: Scrape → Filter → KI-Bewertung → DB → E-Mail

import { prisma } from "@/lib/prisma";
import { getScrapersByPlatformList } from "@/lib/scraper";
import { isPlatformForCountry, type CountryCode } from "@/lib/platform-names";
import type { ScraperResult } from "@/lib/scraper";
import { analyzePrice } from "@/lib/ai/price-analyzer";
import { deductCheckos } from "@/lib/checkos";
import { sendPreisradarAlertEmail } from "@/lib/email-preisradar";
import { createNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/web-push";
import { reportScrapeRun } from "@/lib/scraper/health-monitor";
import { getPlatformDisplayName } from "@/lib/platform-names";
import { repairSearchQuery } from "@/lib/utils";
import { getSetting } from "@/lib/settings";
import { filterWithAI } from "@/lib/scraper/ai-filter";
import {
  DURATION_BASE_COSTS,
  QUALITY_MULTIPLIERS,
  DURATION_MS,
  getSearchCost,
  getDurationCost,
} from "@/lib/pricing";

// Re-export pricing functions so existing imports from scheduler still work
export { getSearchCost, getDurationCost };

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

    // Scraper holen: NUR die pro Suche gespeicherten Plattformen nutzen.
    // getScrapersByPlatformList filtert automatisch isWorking=false heraus.
    // Zusätzlich: Nur Plattformen die zum gewählten Land passen.
    const searchCountry = (search.country || "ch") as CountryCode;
    const allScrapersForPlatforms = getScrapersByPlatformList(search.platforms);
    const scrapers = allScrapersForPlatforms.filter((s) =>
      isPlatformForCountry(s.platform, searchCountry)
    );

    if (scrapers.length === 0) {
      errors.push("Keine Scraper für die gewählten Plattformen verfügbar");
      return { success: false, newAlerts: 0, errors };
    }

    // Plattformen SEQUENTIELL scrapen mit 10-15s Pause dazwischen
    // Verhindert Rate-Limiting und Blockierung durch zu viele gleichzeitige Requests
    const INTER_PLATFORM_DELAY_MS = 12_000; // 12 Sekunden zwischen Plattformen
    const allResults: ScraperResult[] = [];

    console.log(`[Scheduler] Starte sequentiellen Scrape für ${scrapers.length} Plattformen (${scrapers.map(s => s.platform).join(", ")}): "${search.query}"...`);

    interface ScrapeResultEntry {
      status: "fulfilled" | "rejected";
      value?: { scraper: typeof scrapers[0]; results: ScraperResult[]; durationMs: number };
      reason?: unknown;
    }
    const scrapeResults: ScrapeResultEntry[] = [];

    for (let i = 0; i < scrapers.length; i++) {
      const scraper = scrapers[i];

      // Pause zwischen Plattformen (nicht vor der ersten)
      if (i > 0) {
        const delayMs = INTER_PLATFORM_DELAY_MS + Math.floor(Math.random() * 3000); // 12-15s
        console.log(`[Scheduler] ⏳ Warte ${Math.round(delayMs / 1000)}s vor ${scraper.displayName}...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
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

        if (results.length === 0) {
          const msg = `[Scheduler] ${scraper.displayName}: 0 Treffer nach ${durationMs}ms — möglicherweise blockiert oder Parse-Fehler`;
          console.warn(msg);
          errors.push(msg);
        } else {
          console.log(`[Scheduler] ${scraper.displayName}: ${results.length} Treffer in ${durationMs}ms`);
        }
        allResults.push(...results);
        scrapeResults.push({ status: "fulfilled", value: { scraper, results, durationMs } });
      } catch (error) {
        let errorDetail: string;
        if (error instanceof Error) {
          errorDetail = `${error.message}${error.stack ? `\n${error.stack.split("\n").slice(0, 3).join("\n")}` : ""}`;
        } else if (typeof error === "string") {
          errorDetail = error;
        } else if (error && typeof error === "object") {
          try {
            errorDetail = JSON.stringify(error).substring(0, 500);
          } catch {
            errorDetail = `[Objekt: ${Object.keys(error as Record<string, unknown>).join(", ")}]`;
          }
        } else {
          errorDetail = String(error);
        }
        const msg = `[Scheduler] ${scraper.displayName} FEHLER: ${errorDetail}`;
        errors.push(msg);
        console.error(msg);
        scrapeResults.push({ status: "rejected", reason: error });
      }
    }

    // === Health Monitor: Scrape-Ergebnisse melden ===
    const healthReportData: { platform: string; resultsCount: number; error?: string }[] = [];
    for (const result of scrapeResults) {
      if (result.status === "fulfilled" && result.value) {
        const { scraper, results: scraperResults } = result.value;
        healthReportData.push({
          platform: scraper.platform,
          resultsCount: scraperResults.length,
        });
      } else {
        let errMsg: string;
        const reason = result.reason;
        if (reason instanceof Error) {
          errMsg = reason.message;
        } else if (typeof reason === "string") {
          errMsg = reason;
        } else {
          try { errMsg = JSON.stringify(reason).substring(0, 300); } catch { errMsg = "[unbekannter Fehler]"; }
        }
        healthReportData.push({
          platform: "unknown",
          resultsCount: 0,
          error: errMsg,
        });
      }
    }
    // Report async — non-blocking (fire and forget)
    reportScrapeRun(healthReportData).catch((err) => {
      console.warn("[Scheduler] Health report failed:", err);
    });

    // === SERVER-SIDE STRICT PRICE + YEAR FILTER ===
    // Even if scrapers already filter, we double-check here to ensure
    // no premium/spotlight/overpriced results slip through
    const filteredResults = allResults.filter((r) => {
      // Strict price filter: reject anything over maxPrice
      if (search.maxPrice && r.price > 0 && r.price > search.maxPrice) {
        console.log(`[Scheduler] Price filter: "${r.title.substring(0, 50)}" price ${r.price} > max ${search.maxPrice} → REMOVED`);
        return false;
      }
      // When maxPrice is set and price is 0/unknown → exclude the result
      // (likely "Preis auf Anfrage" or scraper failed to extract price)
      if (search.maxPrice && r.price <= 0) {
        console.log(`[Scheduler] Price filter: "${r.title.substring(0, 50)}" price=0 with maxPrice=${search.maxPrice} → REMOVED (unknown price)`);
        return false;
      }
      // When minPrice is set and price is 0/unknown → also exclude
      if (search.minPrice && r.price <= 0) {
        console.log(`[Scheduler] Price filter: "${r.title.substring(0, 50)}" price=0 with minPrice=${search.minPrice} → REMOVED (unknown price)`);
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
      listedAt: Date | null;
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
          listedAt: result.listedAt || null,
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
          listedAt: result.listedAt || null,
        });
        errors.push(`KI-Analyse fehlgeschlagen für "${result.title}"`);
      }
    }

    // In DB speichern — explizites Mapping, keine Spread-Operatoren
    if (alertsToCreate.length > 0) {
      await prisma.preisradarAlert.createMany({
        data: alertsToCreate.map((alert) => ({
          searchId,
          title: alert.title,
          price: alert.price,
          platform: alert.platform,
          url: alert.url,
          imageUrl: alert.imageUrl,
          description: alert.description,
          priceScore: alert.priceScore,
          aiAnalysis: alert.aiAnalysis,
          isScam: alert.isScam,
          listedAt: alert.listedAt,
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
          const listedAtText = alert.listedAt
            ? ` — Inseriert am: ${alert.listedAt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })} ${alert.listedAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`
            : "";

          await createNotification(
            search.user.id,
            "preisradar_alert",
            `Neuer Treffer: ${alert.title}`,
            `${priceFormatted} auf ${getPlatformDisplayName(alert.platform)}${scoreText}${listedAtText}`,
            alert.url,
            undefined,
            alert.imageUrl || undefined
          );
        } catch (notifError) {
          errors.push(`Benachrichtigung erstellen fehlgeschlagen: ${notifError instanceof Error ? notifError.message : String(notifError)}`);
        }
      }
    }

    // Push-Benachrichtigung senden wenn neue Treffer
    if (newAlerts > 0) {
      try {
        const firstAlert = alertsToCreate[0];
        const pushPriceFormatted = (firstAlert.price / 100).toLocaleString("de-CH", {
          style: "currency",
          currency: "CHF",
        });
        const pushListedText = firstAlert.listedAt
          ? ` | Inseriert: ${firstAlert.listedAt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })} ${firstAlert.listedAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`
          : "";
        const pushBody = newAlerts === 1
          ? `${pushPriceFormatted} auf ${getPlatformDisplayName(firstAlert.platform)}${pushListedText}`
          : `${newAlerts} neue Treffer gefunden — ab ${pushPriceFormatted}`;

        await sendPushToUser(search.user.id, {
          title: newAlerts === 1
            ? `Neuer Treffer: ${firstAlert.title.substring(0, 80)}`
            : `${newAlerts} neue Preisradar-Treffer`,
          body: pushBody,
          url: "/dashboard/preisradar/alerts",
          tag: `preisradar-${search.id}`,
        });
      } catch (pushError) {
        // Push-Fehler sind nicht kritisch
        console.warn(`[Scheduler] Push-Benachrichtigung fehlgeschlagen: ${pushError instanceof Error ? pushError.message : String(pushError)}`);
      }
    }

    // E-Mail senden wenn neue Treffer
    if (newAlerts > 0 && search.user.email) {
      try {
        await sendPreisradarAlertEmail(
          search.user.email,
          search.user.name || "Benutzer",
          repairSearchQuery(search.query, search.vehicleMake, search.vehicleModel),
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
 * Migration: Bestehende Suchen um neue Plattformen ergänzen UND fehlende Länder setzen.
 * 1. Setzt country="ch" für alle Suchen ohne Land (Altdaten)
 * 2. Ergänzt Plattformen die zum Land passen
 * Idempotent — kann beliebig oft aufgerufen werden.
 */
async function migrateSearchPlatforms(): Promise<number> {
  const CH_PLATFORMS = ["tutti", "ricardo", "autoscout", "anibis", "autolina"];
  const DE_PLATFORMS = ["ebay-ka"];
  
  const allSearches = await prisma.preisradarSearch.findMany({
    select: { id: true, platforms: true, country: true },
  });

  let migratedCount = 0;

  for (const search of allSearches) {
    const country = search.country || "ch";
    const currentPlatforms = search.platforms.split(",").map((p) => p.trim()).filter(Boolean);
    const updates: Record<string, unknown> = {};

    // 1. Fehlende Länder setzen (Altdaten → default CH)
    if (!search.country) {
      updates.country = "ch";
    }

    // 2. Plattformen ergänzen — nur die die zum Land passen
    let enrichPlatforms: string[] = [];
    if (country === "ch") {
      enrichPlatforms = CH_PLATFORMS;
    } else if (country === "de") {
      enrichPlatforms = DE_PLATFORMS;
    } else if (country === "all") {
      enrichPlatforms = [...CH_PLATFORMS, ...DE_PLATFORMS];
    }
    // AT: keine Enrichment, da willhaben deaktiviert

    const missing = enrichPlatforms.filter((p) => !currentPlatforms.includes(p));
    if (missing.length > 0) {
      updates.platforms = [...currentPlatforms, ...missing].join(",");
    }

    if (Object.keys(updates).length > 0) {
      await prisma.preisradarSearch.update({
        where: { id: search.id },
        data: updates,
      });
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`[Scheduler] Migration: ${migratedCount} Suchen aktualisiert (Länder + Plattformen)`);
  }

  return migratedCount;
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
    // Migration: Bestehende Suchen um autolina, ebay-ka, tutti, anibis ergänzen (idempotent)
    await migrateSearchPlatforms().catch((err) => {
      console.warn("[Scheduler] Platform migration failed:", err);
      errors.push(`Platform migration error: ${err instanceof Error ? err.message : String(err)}`);
    });

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

    // === Fix: Alte Intervalle < 15min auf 15min korrigieren ===
    // Historisch gab es Pro-Suchen mit 5min-Intervall. Minimum ist jetzt 15min.
    const tooFastSearches = activeSearches.filter((s) => s.interval && s.interval < 15);
    if (tooFastSearches.length > 0) {
      console.log(`[Scheduler] ⚠️ ${tooFastSearches.length} Suchen mit Intervall < 15min gefunden — korrigiere auf 15min`);
      await prisma.preisradarSearch.updateMany({
        where: {
          id: { in: tooFastSearches.map((s) => s.id) },
        },
        data: { interval: 15 },
      });
      // Lokales Array auch updaten
      for (const s of tooFastSearches) {
        s.interval = 15;
      }
    }

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
 * Qualitäts-Multiplikator abfragen
 */
export function getQualityMultiplier(qualityTier: string): number {
  return QUALITY_MULTIPLIERS[qualityTier] || 1;
}
