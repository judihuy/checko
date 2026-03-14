// Comparis.ch Auto-Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class ComparisScraper extends BaseScraper {
  readonly platform = "comparis";
  readonly displayName = "Comparis Auto";
  readonly baseUrl = "https://www.comparis.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // Comparis Autosuche
      let searchUrl = `${this.baseUrl}/carfinder/marktplatz?query=${encodedQuery}`;

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
        console.warn(`[Comparis] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`Comparis.ch: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      // Comparis nutzt React mit Server-Side-Rendering
      const dataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([^]*?)<\/script>/)
        || html.match(/window\.__INITIAL_STATE__\s*=\s*({[^]*?});/);

      if (dataMatch) {
        try {
          const data = JSON.parse(dataMatch[1]);
          const listings = data?.props?.pageProps?.listings
            || data?.props?.pageProps?.searchResult?.items
            || data?.carfinder?.results
            || [];

          for (const listing of listings) {
            const title = listing.title || listing.makeModel || listing.name || "";
            const priceRaw = listing.price || listing.listPrice || listing.salesPrice || 0;
            const price = Math.round(parseFloat(String(priceRaw)) * 100);
            const detailUrl = listing.url || listing.detailUrl || listing.link;
            const url = detailUrl
              ? (detailUrl.startsWith("http") ? detailUrl : `${this.baseUrl}${detailUrl}`)
              : searchUrl;
            const imageUrl = listing.imageUrl || listing.mainImage || listing.thumbnailUrl || null;

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
          console.error("Comparis.ch: JSON parse error:", parseError);
        }
      }

      // Fallback: HTML-Pattern-Matching
      if (results.length === 0) {
        const cardRegex = /class="[^"]*car-?card[^"]*"([\s\S]*?)(?=class="[^"]*car-?card|$)/gi;
        let cardMatch;

        while ((cardMatch = cardRegex.exec(html)) !== null) {
          const block = cardMatch[1];

          const titleMatch = block.match(/<h[23][^>]*>([^<]+)/i)
            || block.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/i);
          const priceMatch = block.match(/(?:CHF|Fr\.)\s*([\d',\.]+)/i);
          const linkMatch = block.match(/href="(\/carfinder\/[^"]+)"/i);
          const imgMatch = block.match(/src="(https:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i);

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
      console.error("Comparis.ch Scraper error:", error);
    }

    return results;
  }
}
