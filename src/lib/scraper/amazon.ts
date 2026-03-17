// Amazon.de Scraper (Deutschland)
// Nutzt Puppeteer (headless Browser) mit Proxy
// Parse-Methode: HTML-Pattern-Matching der Suchergebnisse

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AmazonScraper extends BaseScraper {
  readonly platform = "amazon";
  readonly displayName = "Amazon.de";
  readonly baseUrl = "https://www.amazon.de";
  isWorking = true;

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // Amazon Preis-Filter: rh=p_36:[minCent]-[maxCent]
      let searchUrl = `${this.baseUrl}/s?k=${encodedQuery}`;
      if (options?.minPrice || options?.maxPrice) {
        // Amazon Preis in EUR-Cent, unsere Preise in CHF-Rappen
        // EUR/CHF ≈ 0.96 → Rappen / 0.96 = EUR-Cent (Annäherung)
        const minEURCent = options.minPrice ? Math.round(options.minPrice / 0.96) : "";
        const maxEURCent = options.maxPrice ? Math.round(options.maxPrice / 0.96) : "";
        searchUrl += `&rh=p_36:${minEURCent}-${maxEURCent}`;
      }

      console.log(`[Amazon] Search URL: ${searchUrl}`);

      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Amazon] Browser failed, trying without proxy:`, browserError);
        try {
          html = await this.fetchWithBrowserNoProxy(searchUrl);
        } catch (noProxyError) {
          console.warn(`[Amazon] Browser without proxy also failed, falling back to HTTP:`, noProxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Amazon.de: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Amazon] HTML length: ${html.length}`);

      // Prüfe ob CAPTCHA
      if (html.includes("Type the characters you see in this image") || html.includes("captcha")) {
        console.warn("[Amazon] ⚠️ CAPTCHA erkannt — Scraping blockiert.");
        return results;
      }

      if (html.length < 1000) {
        console.warn(`[Amazon] ⚠️ Sehr kurze Antwort (${html.length} Bytes)`);
        return results;
      }

      // Methode 1: data-component-type="s-search-result" Blöcke
      const searchResults = this.parseSearchResults(html, options);
      if (searchResults.length > 0) {
        console.log(`[Amazon] ✅ Parsed: ${searchResults.length} results`);
        return searchResults;
      }

      // Methode 2: Fallback — generisches Pattern-Matching
      const fallbackResults = this.parseFallback(html, options);
      if (fallbackResults.length > 0) {
        console.log(`[Amazon] Fallback: ${fallbackResults.length} results`);
        return fallbackResults;
      }

      console.warn(`[Amazon] ⚠️ Keine Ergebnisse.`);
      return results;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Amazon] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Parse Amazon Suchergebnis-Blöcke
   */
  private parseSearchResults(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenAsins = new Set<string>();

    // Amazon Suchergebnisse: <div data-component-type="s-search-result" data-asin="ASIN">
    const resultRegex = /data-component-type="s-search-result"[^>]*data-asin="([A-Z0-9]+)"[^>]*>([\s\S]*?)(?=data-component-type="s-search-result"|<\/div>\s*<\/div>\s*<\/div>\s*<div\s+class="s-main-slot)/gi;
    let match;

    while ((match = resultRegex.exec(html)) !== null) {
      const asin = match[1];
      const block = match[2];

      if (!asin || asin.length < 5 || seenAsins.has(asin)) continue;
      seenAsins.add(asin);

      // Titel: <span class="a-text-normal">...</span> oder aria-label
      const titleMatch =
        block.match(/class="a-size-base-plus a-color-base a-text-normal"[^>]*>([^<]+)/i) ||
        block.match(/class="a-size-medium a-color-base a-text-normal"[^>]*>([^<]+)/i) ||
        block.match(/class="a-text-normal"[^>]*>([^<]+)/i) ||
        block.match(/aria-label="([^"]{10,200})"/i);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();

      // Preis: <span class="a-price-whole">123</span><span class="a-price-fraction">45</span>
      const wholeMatch = block.match(/class="a-price-whole"[^>]*>(\d[\d.]*)/i);
      const fractionMatch = block.match(/class="a-price-fraction"[^>]*>(\d{2})/i);

      if (!wholeMatch) continue;

      const whole = wholeMatch[1].replace(/\./g, ""); // "1.234" → "1234"
      const fraction = fractionMatch ? fractionMatch[1] : "00";
      const priceEUR = parseFloat(`${whole}.${fraction}`);
      if (isNaN(priceEUR) || priceEUR <= 0) continue;

      // EUR → CHF Rappen (1 EUR ≈ 0.96 CHF)
      const price = Math.round(priceEUR * 0.96 * 100);

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // URL
      const url = `${this.baseUrl}/dp/${asin}`;

      // Bild
      const imgMatch =
        block.match(/src="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/i) ||
        block.match(/src="(https:\/\/images-[a-z]+\.ssl-images-amazon\.com[^"]+)"/i);

      results.push({
        title,
        price,
        url,
        imageUrl: imgMatch ? imgMatch[1] : null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }

  /**
   * Fallback: Generisches Price-Pattern-Matching
   */
  private parseFallback(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenTitles = new Set<string>();

    // Suche nach EUR-Preisen mit Kontext
    const priceRegex = /class="a-price-whole"[^>]*>(\d[\d.]*)/gi;
    let priceMatch;

    while ((priceMatch = priceRegex.exec(html)) !== null) {
      const start = Math.max(0, priceMatch.index - 1000);
      const end = Math.min(html.length, priceMatch.index + 500);
      const context = html.substring(start, end);

      const whole = priceMatch[1].replace(/\./g, "");
      const fractionMatch = context.substring(priceMatch.index - start).match(/class="a-price-fraction"[^>]*>(\d{2})/i);
      const fraction = fractionMatch ? fractionMatch[1] : "00";
      const priceEUR = parseFloat(`${whole}.${fraction}`);
      if (isNaN(priceEUR) || priceEUR <= 0) continue;

      const price = Math.round(priceEUR * 0.96 * 100);
      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Titel
      const titleMatch = context.match(/class="a-text-normal"[^>]*>([^<]{10,200})/i) ||
        context.match(/aria-label="([^"]{10,200})"/i);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      if (seenTitles.has(title)) continue;
      seenTitles.add(title);

      // ASIN
      const asinMatch = context.match(/data-asin="([A-Z0-9]{5,})"/i);
      const url = asinMatch ? `${this.baseUrl}/dp/${asinMatch[1]}` : this.baseUrl;

      // Bild
      const imgMatch = context.match(/src="(https:\/\/m\.media-amazon\.com\/images\/[^"]+)"/i);

      results.push({
        title,
        price,
        url,
        imageUrl: imgMatch ? imgMatch[1] : null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
