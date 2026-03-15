// Scraper Registry
// Zentrale Verwaltung aller Plattform-Scraper

import { BaseScraper } from "./base";
import { TuttiScraper } from "./tutti";
import { RicardoScraper } from "./ricardo";
import { EbayKleinanzeigenScraper } from "./ebay-ka";
import { AutoScoutScraper } from "./autoscout";
import { ComparisScraper } from "./comparis";

// Alle verfügbaren Scraper
const scraperRegistry: Map<string, BaseScraper> = new Map();

// Scraper registrieren
const tuttiScraper = new TuttiScraper();
const ricardoScraper = new RicardoScraper();
const ebayKaScraper = new EbayKleinanzeigenScraper();
const autoScoutScraper = new AutoScoutScraper();
const comparisScraper = new ComparisScraper();

scraperRegistry.set(tuttiScraper.platform, tuttiScraper);
scraperRegistry.set(ricardoScraper.platform, ricardoScraper);
scraperRegistry.set(ebayKaScraper.platform, ebayKaScraper);
scraperRegistry.set(autoScoutScraper.platform, autoScoutScraper);
scraperRegistry.set(comparisScraper.platform, comparisScraper);

/**
 * Alle registrierten Scraper zurückgeben
 */
export function getAllScrapers(): BaseScraper[] {
  return Array.from(scraperRegistry.values());
}

/**
 * Nur funktionsfähige Scraper zurückgeben (isWorking=true)
 */
export function getWorkingScrapers(): BaseScraper[] {
  return Array.from(scraperRegistry.values()).filter((s) => s.isWorking);
}

/**
 * Einen Scraper anhand der Plattform-ID finden
 */
export function getScraperByPlatform(platform: string): BaseScraper | undefined {
  return scraperRegistry.get(platform);
}

/**
 * Verfügbare Plattformen als Array zurückgeben
 * (für UI-Checkboxen etc.)
 */
export function getAvailablePlatforms(): { id: string; name: string; isWorking: boolean }[] {
  return getAllScrapers().map((s) => ({
    id: s.platform,
    name: s.displayName,
    isWorking: s.isWorking,
  }));
}

/**
 * Scraper anhand einer Komma-getrennten Plattform-Liste zurückgeben
 * z.B. "tutti,ricardo,ebay-ka" → [RicardoScraper, EbayKAScraper]
 * Überspringt Scraper mit isWorking=false automatisch!
 */
export function getScrapersByPlatformList(platformString: string): BaseScraper[] {
  const platforms = platformString.split(",").map((p) => p.trim()).filter(Boolean);
  const scrapers: BaseScraper[] = [];

  for (const platform of platforms) {
    const scraper = getScraperByPlatform(platform);
    if (scraper) {
      if (!scraper.isWorking) {
        console.warn(`[ScraperRegistry] ⚠️ ${scraper.displayName} übersprungen (isWorking=false)`);
        continue;
      }
      scrapers.push(scraper);
    }
  }

  return scrapers;
}

// Re-exports
export type { ScraperResult, ScraperOptions } from "./base";
export { BaseScraper } from "./base";
