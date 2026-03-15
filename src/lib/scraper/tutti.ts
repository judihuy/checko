// Tutti.ch Scraper
// STATUS: DEAKTIVIERT — Cloudflare-Schutz blockiert Headless-Browser zuverlässig
// Tutti.ch erkennt Puppeteer trotz Proxy und liefert nur die Challenge-Seite
// Kann reaktiviert werden wenn ein Residential-Proxy oder Cloudflare-Bypass verfügbar ist

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";
  isWorking = false; // Cloudflare blockiert — kein Scraping möglich

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.warn(
      `[Tutti] ⚠️ Scraper deaktiviert (isWorking=false). ` +
      `Cloudflare-Schutz blockiert Headless-Browser. ` +
      `Query "${query}" wird übersprungen.`
    );
    return [];
  }
}
