// AutoScout24.ch Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // AutoScout24.ch Suche mit Freitext
      let searchUrl = `${this.baseUrl}/de/autos?q=${encodedQuery}`;

      // Preisfilter in URL
      if (options?.minPrice) {
        searchUrl += `&pricefrom=${Math.round(options.minPrice / 100)}`;
      }
      if (options?.maxPrice) {
        searchUrl += `&priceto=${Math.round(options.maxPrice / 100)}`;
      }

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[AutoScout] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`AutoScout24.ch: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      // AutoScout24 nutzt oft structured data oder JSON-LD
      const jsonLdMatches = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);

      for (const jsonMatch of jsonLdMatches) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);

          // ItemList oder Array von Angeboten
          const items = jsonData?.itemListElement || (Array.isArray(jsonData) ? jsonData : []);

          for (const item of items) {
            const offer = item?.item || item;
            if (offer?.["@type"] !== "Car" && offer?.["@type"] !== "Vehicle" && offer?.["@type"] !== "Product") continue;

            const title = offer.name || offer.description || "";
            const priceRaw = offer.offers?.price || offer.price || 0;
            const price = Math.round(parseFloat(String(priceRaw)) * 100);
            const url = offer.url || offer.offers?.url || searchUrl;
            const imageUrl = offer.image?.url || offer.image || null;

            if (options?.minPrice && price < options.minPrice) continue;
            if (options?.maxPrice && price > options.maxPrice) continue;

            results.push({
              title,
              price,
              url: url.startsWith("http") ? url : `${this.baseUrl}${url}`,
              imageUrl,
              platform: this.platform,
              scrapedAt: new Date(),
            });

            if (options?.limit && results.length >= options.limit) break;
          }
        } catch {
          // JSON-LD parse fehler ignorieren
        }
      }

      // Fallback: HTML-Pattern-Matching
      if (results.length === 0) {
        const listingRegex = /class="[^"]*listing-item[^"]*"([\s\S]*?)(?=class="[^"]*listing-item|$)/gi;
        let listingMatch;

        while ((listingMatch = listingRegex.exec(html)) !== null) {
          const block = listingMatch[1];

          const titleMatch = block.match(/class="[^"]*listing-title[^"]*"[^>]*>([^<]+)/i)
            || block.match(/<h[23][^>]*>([^<]+)/i);
          const priceMatch = block.match(/class="[^"]*listing-price[^"]*"[^>]*>\s*(?:CHF\s*)?([\d',\.]+)/i)
            || block.match(/(?:CHF|Fr\.)\s*([\d',\.]+)/i);
          const linkMatch = block.match(/href="(\/de\/d\/[^"]+)"/i);
          const imgMatch = block.match(/src="(https:\/\/[^"]*autoscout[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);

          if (titleMatch && priceMatch) {
            const title = titleMatch[1].trim();
            const priceStr = priceMatch[1].replace(/[',]/g, "");
            const price = Math.round(parseFloat(priceStr) * 100);

            if (options?.minPrice && price < options.minPrice) continue;
            if (options?.maxPrice && price > options.maxPrice) continue;

            results.push({
              title,
              price,
              url: linkMatch ? `${this.baseUrl}${linkMatch[1]}` : searchUrl,
              imageUrl: imgMatch ? imgMatch[1] : null,
              platform: this.platform,
              scrapedAt: new Date(),
            });

            if (options?.limit && results.length >= options.limit) break;
          }
        }
      }
    } catch (error) {
      console.error("AutoScout24.ch Scraper error:", error);
    }

    return results;
  }
}
