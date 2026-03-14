// eBay Kleinanzeigen Scraper (kleinanzeigen.de)
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class EbayKleinanzeigenScraper extends BaseScraper {
  readonly platform = "ebay-ka";
  readonly displayName = "eBay Kleinanzeigen";
  readonly baseUrl = "https://www.kleinanzeigen.de";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // Preisfilter in URL einbauen falls gesetzt
      let priceParam = "";
      if (options?.minPrice || options?.maxPrice) {
        const minCHF = options.minPrice ? Math.round(options.minPrice / 100) : "";
        const maxCHF = options.maxPrice ? Math.round(options.maxPrice / 100) : "";
        priceParam = `&preis:${minCHF}:${maxCHF}`;
      }

      const searchUrl = `${this.baseUrl}/s-suchanfrage/${encodedQuery}${priceParam}`;

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[eBay KA] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`eBay KA: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      // Kleinanzeigen.de HTML-Parsing
      const adRegex = /<article[^>]*class="[^"]*aditem[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
      let adMatch;

      while ((adMatch = adRegex.exec(html)) !== null) {
        const adHtml = adMatch[1];

        // Titel extrahieren
        const titleMatch = adHtml.match(/class="[^"]*ellipsis[^"]*"[^>]*>([^<]+)/i)
          || adHtml.match(/class="[^"]*aditem-main--middle--title[^"]*"[^>]*>([^<]+)/i)
          || adHtml.match(/<h2[^>]*>([^<]+)/i);

        // Preis extrahieren
        const priceMatch = adHtml.match(/class="[^"]*aditem-main--middle--price[^"]*"[^>]*>\s*([\d.,]+)\s*€/i)
          || adHtml.match(/([\d.,]+)\s*€/i);

        // URL extrahieren
        const urlMatch = adHtml.match(/href="(\/s-anzeige\/[^"]+)"/i)
          || adHtml.match(/data-href="([^"]+)"/i);

        // Bild extrahieren
        const imageMatch = adHtml.match(/data-imgsrc="([^"]+)"/i)
          || adHtml.match(/src="(https:\/\/[^"]*img\.kleinanzeigen[^"]+)"/i);

        if (titleMatch && priceMatch) {
          const title = titleMatch[1].trim();
          const priceStr = priceMatch[1].replace(/\./g, "").replace(",", ".");
          const priceEUR = parseFloat(priceStr);
          // EUR → CHF Rappen (Näherung: 1 EUR ≈ 0.96 CHF)
          const price = Math.round(priceEUR * 0.96 * 100);
          const url = urlMatch
            ? `${this.baseUrl}${urlMatch[1]}`
            : searchUrl;
          const imageUrl = imageMatch ? imageMatch[1] : null;

          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          results.push({
            title,
            price,
            url,
            imageUrl,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) break;
        }
      }

      // Fallback: Einfacheres Pattern
      if (results.length === 0) {
        const simpleTitleRegex = /aditem-main--middle--title[^>]*>\s*([^<]+)/gi;
        const simplePriceRegex = /aditem-main--middle--price[^>]*>\s*([\d.,]+)\s*€/gi;

        const titles: string[] = [];
        const prices: number[] = [];

        let match;
        while ((match = simpleTitleRegex.exec(html)) !== null) {
          titles.push(match[1].trim());
        }
        while ((match = simplePriceRegex.exec(html)) !== null) {
          const priceStr = match[1].replace(/\./g, "").replace(",", ".");
          prices.push(Math.round(parseFloat(priceStr) * 0.96 * 100));
        }

        const count = Math.min(titles.length, prices.length);
        for (let i = 0; i < count; i++) {
          const price = prices[i];
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          results.push({
            title: titles[i],
            price,
            url: searchUrl,
            imageUrl: null,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) break;
        }
      }
    } catch (error) {
      console.error("eBay Kleinanzeigen Scraper error:", error);
    }

    return results;
  }
}
