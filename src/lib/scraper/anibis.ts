// Anibis.ch Scraper — DEAKTIVIERT
// Grund: Cloudflare-Schutz blockiert alle Scraping-Methoden.
// Kein API-Workaround verfügbar.
// Status: Temporär nicht verfügbar.

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AnibisScraper extends BaseScraper {
  readonly platform = "anibis";
  readonly displayName = "Anibis.ch";
  readonly baseUrl = "https://www.anibis.ch";
  isWorking = false; // ⛔ Deaktiviert — Cloudflare blockiert

  async scrape(_query: string, _options?: ScraperOptions): Promise<ScraperResult[]> {
    console.log("[Anibis] ⛔ Scraper deaktiviert — Cloudflare-Schutz blockiert alle Methoden");
    return [];
  }
}
