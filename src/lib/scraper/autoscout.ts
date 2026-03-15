// AutoScout24.ch Scraper
// STATUS: DEAKTIVIERT — React Server Components (RSC) rendern keine Listings im HTML
// AutoScout24 nutzt Next.js RSC mit vollständigem Client-Side Rendering.
// Puppeteer bekommt zwar 120K+ HTML, aber der DOM bleibt leer (keine Fahrzeug-Daten).
// Mögliche Lösung: API-Reverse-Engineering oder Residential-Proxy mit Anti-Detect-Browser

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";
  isWorking = false; // RSC-Rendering blockiert — DOM bleibt leer

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.warn(
      `[AutoScout] ⚠️ Scraper deaktiviert (isWorking=false). ` +
      `RSC-Rendering liefert keinen sichtbaren Content im DOM. ` +
      `Query "${query}" wird übersprungen.`
    );
    return [];
  }
}
