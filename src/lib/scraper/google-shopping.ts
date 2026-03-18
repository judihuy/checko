// Google Shopping Scraper (google.ch)
// Nutzt Puppeteer (headless Browser) mit Proxy
// Parse-Methode: HTML-Pattern-Matching der Shopping-Ergebnisse

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { parseSwissPriceRappen } from "./price-utils";

export class GoogleShoppingScraper extends BaseScraper {
  readonly platform = "google-shopping";
  readonly displayName = "Google Shopping";
  readonly baseUrl = "https://www.google.ch";
  isWorking = false; // CAPTCHA blocks scraping

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      let searchUrl = `${this.baseUrl}/search?tbm=shop&q=${encodedQuery}&hl=de&gl=ch`;

      // Google Shopping Preisfilter: tbs=mr:1,price:1,ppr_min:[min],ppr_max:[max]
      if (options?.minPrice || options?.maxPrice) {
        const minCHF = options.minPrice ? Math.round(options.minPrice / 100) : "";
        const maxCHF = options.maxPrice ? Math.round(options.maxPrice / 100) : "";
        searchUrl += `&tbs=mr:1,price:1,ppr_min:${minCHF},ppr_max:${maxCHF}`;
      }

      console.log(`[Google Shopping] Search URL: ${searchUrl}`);

      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Google Shopping] Browser failed, trying without proxy:`, browserError);
        try {
          html = await this.fetchWithBrowserNoProxy(searchUrl);
        } catch (noProxyError) {
          console.warn(`[Google Shopping] Browser without proxy also failed, falling back to HTTP:`, noProxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Google Shopping: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Google Shopping] HTML length: ${html.length}`);

      if (html.length < 1000) {
        console.warn(`[Google Shopping] ⚠️ Sehr kurze Antwort (${html.length} Bytes)`);
        return results;
      }

      // Google Shopping Ergebnisse parsen
      const parsedResults = this.parseShoppingResults(html, options);
      if (parsedResults.length > 0) {
        console.log(`[Google Shopping] ✅ Parsed: ${parsedResults.length} results`);
        return parsedResults;
      }

      console.warn(`[Google Shopping] ⚠️ Keine Ergebnisse.`);
      return results;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Google Shopping] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Parse Google Shopping Ergebnisse aus dem HTML
   * Google Shopping hat verschiedene Layouts, wir versuchen mehrere Patterns
   */
  private parseShoppingResults(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenTitles = new Set<string>();

    // Pattern 1: Typische Shopping-Cards mit Preis
    // Google Shopping zeigt Produkt-Karten mit Titeln und CHF-Preisen
    const productBlockRegex = /class="[^"]*sh-dgr__content[^"]*"[^>]*>([\s\S]*?)(?=class="[^"]*sh-dgr__content|$)/gi;
    let blockMatch;

    while ((blockMatch = productBlockRegex.exec(html)) !== null) {
      const block = blockMatch[1];
      this.extractFromBlock(block, results, seenTitles, options);
      if (options?.limit && results.length >= options.limit) break;
    }

    // Fallback Pattern 2: Generisches Preis+Titel Matching
    if (results.length === 0) {
      // Suche nach CHF-Preisen mit Titeln in der Nähe
      const priceRegex = /(?:CHF|Fr\.?)\s*([\d'.,]+)/gi;
      let priceMatch;

      while ((priceMatch = priceRegex.exec(html)) !== null) {
        const start = Math.max(0, priceMatch.index - 500);
        const end = Math.min(html.length, priceMatch.index + 200);
        const context = html.substring(start, end);

        const price = parseSwissPriceRappen(priceMatch[1]);
        if (price <= 0) continue;
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        // Titel aus dem Kontext
        const titleMatch = context.match(/(?:aria-label|title)="([^"]{5,120})"/i) ||
          context.match(/>([^<]{10,100})<\/(?:a|h[1-6]|span)/);
        if (!titleMatch) continue;

        const title = titleMatch[1].trim();
        if (seenTitles.has(title)) continue;
        seenTitles.add(title);

        // Link
        const linkMatch = context.match(/href="(\/url\?[^"]*|https?:\/\/[^"]*shopping[^"]*)"/i) ||
          context.match(/href="([^"]+)"/i);

        // Bild
        const imgMatch = context.match(/src="(https:\/\/[^"]*(?:encrypted-tbn|gstatic|shopping)[^"]+)"/i);

        results.push({
          title,
          price,
          url: linkMatch ? (linkMatch[1].startsWith("/") ? `${this.baseUrl}${linkMatch[1]}` : linkMatch[1]) : this.baseUrl,
          imageUrl: imgMatch ? imgMatch[1] : null,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    }

    return results;
  }

  /**
   * Extrahiere Produkt-Daten aus einem Shopping-Block
   */
  private extractFromBlock(
    block: string,
    results: ScraperResult[],
    seenTitles: Set<string>,
    options?: ScraperOptions,
  ): void {
    // Titel
    const titleMatch =
      block.match(/class="[^"]*tAxDx[^"]*"[^>]*>([^<]+)/i) ||
      block.match(/aria-label="([^"]{5,120})"/i) ||
      block.match(/>([^<]{10,100})<\/(?:a|h[1-6]|span)/);
    if (!titleMatch) return;

    const title = titleMatch[1].trim();
    if (seenTitles.has(title)) return;

    // Preis
    const priceMatch =
      block.match(/(?:CHF|Fr\.?)\s*([\d'.,]+)/i) ||
      block.match(/([\d'.,]+)\s*(?:CHF|Fr\.?)/i);
    if (!priceMatch) return;

    const price = parseSwissPriceRappen(priceMatch[1]);
    if (price <= 0) return;
    if (options?.minPrice && price < options.minPrice) return;
    if (options?.maxPrice && price > options.maxPrice) return;

    seenTitles.add(title);

    // Link
    const linkMatch = block.match(/href="([^"]+)"/i);
    const url = linkMatch
      ? (linkMatch[1].startsWith("/") ? `${this.baseUrl}${linkMatch[1]}` : linkMatch[1])
      : this.baseUrl;

    // Bild
    const imgMatch = block.match(/src="(https:\/\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i) ||
      block.match(/src="(https:\/\/encrypted-tbn[^"]+)"/i);

    results.push({
      title,
      price,
      url,
      imageUrl: imgMatch ? imgMatch[1] : null,
      platform: this.platform,
      scrapedAt: new Date(),
    });
  }
}
