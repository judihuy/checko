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

      console.log(`[Ricardo] Search URL: ${searchUrl}`);

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

      console.log(`[Ricardo] HTML length: ${html.length}`);

      // Prüfe ob blockiert
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Ricardo] Cloudflare challenge detected — scraping blocked");
        return results;
      }

      // Methode 1: __NEXT_DATA__ JSON parsen
      const nextDataResults = this.parseNextData(html, encodedQuery, options);
      if (nextDataResults.length > 0) {
        console.log(`[Ricardo] __NEXT_DATA__ parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 2: HTML-Pattern-Matching
      const htmlResults = this.parseHtmlListings(html, searchUrl, options);
      if (htmlResults.length > 0) {
        console.log(`[Ricardo] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      // Methode 3: Fallback-Regex
      const fallbackResults = this.parseFallback(html, searchUrl, options);
      console.log(`[Ricardo] Fallback: ${fallbackResults.length} results`);
      return fallbackResults;
    } catch (error) {
      console.error("Ricardo.ch Scraper error:", error);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON
   */
  private parseNextData(
    html: string,
    encodedQuery: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([^]*?)<\/script>/
    );
    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps || {};

      // Verschiedene mögliche Pfade
      const possiblePaths = [
        pageProps?.searchResult?.articles,
        pageProps?.articles,
        pageProps?.searchResult?.items,
        pageProps?.listings,
        pageProps?.results,
        pageProps?.data?.articles,
      ];

      let articles: unknown[] = [];
      for (const path of possiblePaths) {
        if (Array.isArray(path) && path.length > 0) {
          articles = path;
          break;
        }
      }

      // Rekursiv suchen
      if (articles.length === 0) {
        articles = this.findListingsInObject(pageProps);
      }

      for (const article of articles) {
        const item = article as Record<string, unknown>;
        const title =
          (item.title as string) ||
          (item.name as string) ||
          "";
        if (!title) continue;

        const priceRaw =
          item.buyNowPrice ||
          item.currentBidPrice ||
          item.startPrice ||
          item.price ||
          0;
        const price = Math.round(parseFloat(String(priceRaw)) * 100);
        if (isNaN(price) || price <= 0) continue;

        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        const articleId = item.id || item.articleId;
        const url = articleId
          ? `${this.baseUrl}/de/a/${articleId}`
          : `${this.baseUrl}/de/s/${encodedQuery}`;

        const imageUrl =
          (item.imageUrl as string) ||
          (item.thumbnailUrl as string) ||
          (Array.isArray(item.images) && item.images.length > 0
            ? ((item.images[0] as Record<string, unknown>).url as string)
            : null) ||
          null;

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
      console.error("Ricardo.ch: __NEXT_DATA__ parse error:", parseError);
    }

    return results;
  }

  /**
   * Rekursiv nach listing-artigen Arrays suchen
   */
  private findListingsInObject(obj: unknown, depth = 0): unknown[] {
    if (depth > 5 || !obj || typeof obj !== "object") return [];

    if (Array.isArray(obj)) {
      if (
        obj.length > 0 &&
        typeof obj[0] === "object" &&
        obj[0] !== null
      ) {
        const first = obj[0] as Record<string, unknown>;
        if (first.title || first.name) {
          return obj;
        }
      }
      return [];
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = this.findListingsInObject(value, depth + 1);
      if (found.length > 0) return found;
    }

    return [];
  }

  /**
   * HTML-Pattern-Matching für Listing-Elemente
   */
  private parseHtmlListings(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach Links zu Artikelseiten /de/a/
    const linkRegex =
      /<a[^>]*href="(\/de\/a\/\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    const seenUrls = new Set<string>();

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      const content = linkMatch[2];

      // Preis suchen
      const priceMatch =
        content.match(/(?:CHF|Fr\.?)\s*([\d',.]+)/i) ||
        content.match(/([\d',.]+)\s*(?:CHF|Fr\.?)/i);

      // Titel: Textinhalt bereinigen
      const textContent = content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!textContent || textContent.length < 3) continue;

      const title = priceMatch
        ? textContent.split(/(?:CHF|Fr\.?)/i)[0]?.trim() || textContent.substring(0, 100)
        : textContent.substring(0, 100);

      let price = 0;
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/[',]/g, "");
        price = Math.round(parseFloat(priceStr) * 100);
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      const imgMatch = content.match(
        /src="(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/i
      );

      results.push({
        title: title || "Artikel",
        price,
        url: `${this.baseUrl}${href}`,
        imageUrl: imgMatch ? imgMatch[1] : null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }

  /**
   * Fallback-Regex-Parsing
   */
  private parseFallback(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const titleRegex =
      /class="[^"]*(?:listing|article|item)[^"]*title[^"]*"[^>]*>([^<]+)/gi;
    const priceRegex =
      /class="[^"]*(?:listing|article|item)[^"]*price[^"]*"[^>]*>(?:CHF\s*)?([\d',\.]+)/gi;
    const linkRegex = /href="(\/de\/a\/\d+[^"]*)"/gi;

    const titles: string[] = [];
    const prices: number[] = [];
    const urls: string[] = [];

    let m;
    while ((m = titleRegex.exec(html)) !== null) {
      titles.push(m[1].trim());
    }
    while ((m = priceRegex.exec(html)) !== null) {
      const cleanPrice = m[1].replace(/[',]/g, "");
      prices.push(Math.round(parseFloat(cleanPrice) * 100));
    }
    while ((m = linkRegex.exec(html)) !== null) {
      if (!urls.includes(m[1])) urls.push(m[1]);
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

    return results;
  }
}
