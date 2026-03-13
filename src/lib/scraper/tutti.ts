// Tutti.ch Scraper
// Nutzt HTML-Parsing mit fetch (kein Puppeteer für MVP)

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `${this.baseUrl}/de/ganze-schweiz?q=${encodedQuery}`;

      const response = await this.fetchWithHeaders(searchUrl);

      if (!response.ok) {
        console.error(`Tutti.ch: HTTP ${response.status} für "${query}"`);
        return results;
      }

      const html = await response.text();

      // Tutti.ch nutzt __NEXT_DATA__ JSON im HTML (Next.js-basiert)
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^]*?)<\/script>/);

      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const listings = nextData?.props?.pageProps?.listings
            || nextData?.props?.pageProps?.searchResult?.listings
            || [];

          for (const listing of listings) {
            const title = listing.title || listing.subject || "";
            const priceRaw = listing.price || listing.body?.price || 0;
            const price = Math.round(priceRaw * 100); // CHF → Rappen
            const url = listing.link
              ? `${this.baseUrl}${listing.link}`
              : `${this.baseUrl}/de/angebot/${listing.id}`;
            const imageUrl = listing.imageUrl || listing.image?.url || listing.thumbnailUrl || null;

            // Preisfilter anwenden
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
        } catch (parseError) {
          console.error("Tutti.ch: JSON parse error:", parseError);
        }
      }

      // Fallback: HTML-Regex-Parsing wenn __NEXT_DATA__ nicht gefunden
      if (results.length === 0) {
        const listingRegex = /<a[^>]*href="(\/de\/[^"]*angebot[^"]*)"[^>]*>[\s\S]*?<\/a>/gi;
        const titleRegex = /data-testid="listing-title"[^>]*>([^<]+)/gi;
        const priceRegex = /data-testid="listing-price"[^>]*>(?:CHF\s*)?([\d',\.]+)/gi;

        let titleMatch;
        let priceMatch;
        const titles: string[] = [];
        const prices: number[] = [];
        const urls: string[] = [];

        let urlMatch;
        while ((urlMatch = listingRegex.exec(html)) !== null) {
          if (urlMatch[1] && !urls.includes(urlMatch[1])) {
            urls.push(urlMatch[1]);
          }
        }

        while ((titleMatch = titleRegex.exec(html)) !== null) {
          titles.push(titleMatch[1].trim());
        }

        while ((priceMatch = priceRegex.exec(html)) !== null) {
          const cleanPrice = priceMatch[1].replace(/[',]/g, "");
          prices.push(Math.round(parseFloat(cleanPrice) * 100));
        }

        const count = Math.min(titles.length, prices.length, urls.length);
        for (let i = 0; i < count; i++) {
          const price = prices[i];
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          results.push({
            title: titles[i],
            price,
            url: `${this.baseUrl}${urls[i]}`,
            imageUrl: null,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) break;
        }
      }
    } catch (error) {
      console.error("Tutti.ch Scraper error:", error);
    }

    return results;
  }
}
