// Ricardo.ch Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class RicardoScraper extends BaseScraper {
  readonly platform = "ricardo";
  readonly displayName = "Ricardo.ch";
  readonly baseUrl = "https://www.ricardo.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `${this.baseUrl}/de/s/${encodedQuery}`;

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Ricardo] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`Ricardo.ch: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      // Ricardo nutzt auch __NEXT_DATA__ oder ein ähnliches JSON-Objekt
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^]*?)<\/script>/);

      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const articles = nextData?.props?.pageProps?.searchResult?.articles
            || nextData?.props?.pageProps?.articles
            || [];

          for (const article of articles) {
            const title = article.title || article.name || "";
            const priceRaw = article.buyNowPrice || article.currentBidPrice || article.startPrice || 0;
            const price = Math.round(priceRaw * 100);
            const articleId = article.id || article.articleId;
            const url = articleId
              ? `${this.baseUrl}/de/a/${articleId}`
              : `${this.baseUrl}/de/s/${encodedQuery}`;
            const imageUrl = article.imageUrl || article.thumbnailUrl || article.images?.[0]?.url || null;

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
          console.error("Ricardo.ch: JSON parse error:", parseError);
        }
      }

      // Fallback: HTML-Regex-Parsing
      if (results.length === 0) {
        const titleRegex = /class="[^"]*listing[^"]*title[^"]*"[^>]*>([^<]+)/gi;
        const priceRegex = /class="[^"]*listing[^"]*price[^"]*"[^>]*>(?:CHF\s*)?([\d',\.]+)/gi;
        const linkRegex = /href="(\/de\/a\/\d+[^"]*)"/gi;

        const titles: string[] = [];
        const prices: number[] = [];
        const urls: string[] = [];

        let match;
        while ((match = titleRegex.exec(html)) !== null) {
          titles.push(match[1].trim());
        }
        while ((match = priceRegex.exec(html)) !== null) {
          const cleanPrice = match[1].replace(/[',]/g, "");
          prices.push(Math.round(parseFloat(cleanPrice) * 100));
        }
        while ((match = linkRegex.exec(html)) !== null) {
          if (!urls.includes(match[1])) urls.push(match[1]);
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
      console.error("Ricardo.ch Scraper error:", error);
    }

    return results;
  }
}
