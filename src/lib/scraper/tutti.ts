// Tutti.ch Scraper — DEAKTIVIERT
// Grund: Cloudflare-Schutz blockiert alle Scraping-Methoden.
// Kein API-Workaround verfügbar.
// Status: Temporär nicht verfügbar.

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";
  isWorking = false; // ⛔ Deaktiviert — Cloudflare blockiert

  async scrape(_query: string, _options?: ScraperOptions): Promise<ScraperResult[]> {
    console.log("[Tutti] ⛔ Scraper deaktiviert — Cloudflare-Schutz blockiert alle Methoden");
    return [];
  }
}
