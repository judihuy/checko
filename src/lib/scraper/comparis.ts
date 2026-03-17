// Comparis.ch Auto-Scraper
// STATUS: DEAKTIVIERT — DataDome Bot-Schutz blockiert alle Requests
// Comparis antwortet nur mit einer 1.5KB DataDome-Challenge-Seite
// Weder Puppeteer noch HTTP-Fetch kommen durch
// Benötigt Residential-Proxy mit Anti-Detect-Browser

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class ComparisScraper extends BaseScraper {
  readonly platform = "comparis";
  readonly displayName = "Comparis Auto";
  readonly baseUrl = "https://www.comparis.ch";
  isWorking = false; // DataDome Captcha blockiert — kein Scraping möglich

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.warn(
      `[Comparis] ⚠️ Scraper deaktiviert (isWorking=false). ` +
      `DataDome Bot-Schutz blockiert alle Requests. ` +
      `Query "${query}" wird übersprungen.`
    );
    return [];
  }
}
