// Comparis.ch Auto-Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass
// Comparis hat DataDome/Captcha-Schutz — braucht echten Browser mit Proxy

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class ComparisScraper extends BaseScraper {
  readonly platform = "comparis";
  readonly displayName = "Comparis Auto";
  readonly baseUrl = "https://www.comparis.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // Comparis Autosuche URL
      let searchUrl = `${this.baseUrl}/carfinder/marktplatz?query=${encodedQuery}`;
      if (options?.minPrice) {
        searchUrl += `&pricefrom=${Math.round(options.minPrice / 100)}`;
      }
      if (options?.maxPrice) {
        searchUrl += `&priceto=${Math.round(options.maxPrice / 100)}`;
      }

      console.log(`[Comparis] Search URL: ${searchUrl}`);

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

      console.log(`[Comparis] HTML length: ${html.length}`);

      // Prüfe ob Captcha/Bot-Schutz blockiert hat
      if (
        html.includes("captcha-delivery.com") ||
        html.includes("Please enable JS and disable any ad blocker") ||
        (html.length < 2000 && html.includes("dd={"))
      ) {
        console.warn("[Comparis] Bot protection (DataDome) detected — scraping blocked");
        return results;
      }

      // Methode 1: __NEXT_DATA__ JSON parsen
      const nextDataResults = this.parseNextData(html, options);
      if (nextDataResults.length > 0) {
        console.log(`[Comparis] __NEXT_DATA__ parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 2: JSON-LD structured data
      const jsonLdResults = this.parseJsonLd(html, searchUrl, options);
      if (jsonLdResults.length > 0) {
        console.log(`[Comparis] JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 3: HTML-Karten parsen
      const htmlResults = this.parseHtmlCards(html, searchUrl, options);
      if (htmlResults.length > 0) {
        console.log(`[Comparis] HTML card parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      // Methode 4: Generischer Fallback
      const fallbackResults = this.parseFallback(html, searchUrl, options);
      console.log(`[Comparis] Fallback: ${fallbackResults.length} results`);
      return fallbackResults;
    } catch (error) {
      console.error("Comparis.ch Scraper error:", error);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON (Comparis nutzt React/Next.js)
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([^]*?)<\/script>/
    );
    if (!match) return results;

    try {
      const data = JSON.parse(match[1]);
      const pageProps = data?.props?.pageProps || {};

      // Verschiedene mögliche Pfade
      const possiblePaths = [
        pageProps?.listings,
        pageProps?.searchResult?.items,
        pageProps?.searchResult?.listings,
        pageProps?.carfinder?.results,
        pageProps?.vehicles,
        pageProps?.results,
        pageProps?.data?.listings,
        pageProps?.data?.results,
        pageProps?.initialData?.results,
      ];

      let listings: unknown[] = [];
      for (const path of possiblePaths) {
        if (Array.isArray(path) && path.length > 0) {
          listings = path;
          break;
        }
      }

      // Rekursiv suchen wenn nichts gefunden
      if (listings.length === 0) {
        listings = this.findListingsInObject(pageProps);
      }

      for (const listing of listings) {
        const item = listing as Record<string, unknown>;
        const title =
          (item.title as string) ||
          (item.makeModel as string) ||
          (item.name as string) ||
          (item.headline as string) ||
          "";
        if (!title) continue;

        const priceRaw =
          item.price || item.listPrice || item.salesPrice || item.askingPrice || 0;
        const price = Math.round(parseFloat(String(priceRaw)) * 100);
        if (isNaN(price) || price <= 0) continue;

        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        const detailUrl =
          (item.url as string) ||
          (item.detailUrl as string) ||
          (item.link as string) ||
          "";
        const url = detailUrl
          ? detailUrl.startsWith("http")
            ? detailUrl
            : `${this.baseUrl}${detailUrl}`
          : `${this.baseUrl}/carfinder/marktplatz`;

        const imageUrl =
          (item.imageUrl as string) ||
          (item.mainImage as string) ||
          (item.thumbnailUrl as string) ||
          null;

        results.push({
          title,
          price,
          url,
          imageUrl,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) return results;
      }
    } catch (parseError) {
      console.error("Comparis.ch: __NEXT_DATA__ parse error:", parseError);
    }

    return results;
  }

  /**
   * Rekursiv nach Listing-Arrays in einem Objekt suchen
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
        if (first.title || first.makeModel || first.name || first.headline) {
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
   * Parse JSON-LD structured data
   */
  private parseJsonLd(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const jsonLdMatches = html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);

        // ItemList
        if (jsonData?.itemListElement) {
          for (const entry of jsonData.itemListElement) {
            const item = entry?.item || entry;
            const result = this.extractVehicle(item, searchUrl, options);
            if (result) {
              results.push(result);
              if (options?.limit && results.length >= options.limit) return results;
            }
          }
        }

        // Einzelnes Fahrzeug
        if (
          jsonData?.["@type"] === "Car" ||
          jsonData?.["@type"] === "Vehicle" ||
          jsonData?.["@type"] === "Product"
        ) {
          const result = this.extractVehicle(jsonData, searchUrl, options);
          if (result) {
            results.push(result);
            if (options?.limit && results.length >= options.limit) return results;
          }
        }
      } catch {
        // Skip invalid JSON-LD
      }
    }

    return results;
  }

  private extractVehicle(
    item: Record<string, unknown>,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult | null {
    if (!item || typeof item !== "object") return null;

    const title =
      (item.name as string) ||
      (item.description as string) ||
      "";
    if (!title) return null;

    const priceRaw =
      (item.offers as Record<string, unknown>)?.price ||
      item.price ||
      0;
    const price = Math.round(parseFloat(String(priceRaw)) * 100);
    if (isNaN(price) || price <= 0) return null;

    if (options?.minPrice && price < options.minPrice) return null;
    if (options?.maxPrice && price > options.maxPrice) return null;

    const url =
      (item.url as string) ||
      ((item.offers as Record<string, unknown>)?.url as string) ||
      searchUrl;

    return {
      title,
      price,
      url: url.startsWith("http") ? url : `${this.baseUrl}${url}`,
      imageUrl:
        typeof item.image === "string"
          ? item.image
          : typeof item.image === "object" && item.image !== null
            ? ((item.image as Record<string, unknown>).url as string)
            : null,
      platform: this.platform,
      scrapedAt: new Date(),
    };
  }

  /**
   * HTML-Karten parsen (verschiedene Card-Patterns)
   */
  private parseHtmlCards(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Verschiedene Card-Pattern-Versuche
    const cardPatterns = [
      // Pattern 1: class enthält "car" oder "vehicle" + card
      /class="[^"]*(?:car|vehicle|listing)[^"]*card[^"]*"([\s\S]*?)(?=class="[^"]*(?:car|vehicle|listing)[^"]*card|$)/gi,
      // Pattern 2: Links zu /carfinder/detail/ oder /auto/
      /<a[^>]*href="(\/(?:carfinder|auto)\/[^"]*detail[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      // Pattern 3: article-Elemente
      /<article[^>]*>([\s\S]*?)<\/article>/gi,
      // Pattern 4: div mit data-testid
      /<div[^>]*data-testid="[^"]*listing[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of cardPatterns) {
      let cardMatch;
      while ((cardMatch = pattern.exec(html)) !== null) {
        const block = cardMatch[1] || cardMatch[2] || "";

        // Preis suchen
        const priceMatch =
          block.match(/(?:CHF|Fr\.?)\s*([\d',.]+)/i) ||
          block.match(/([\d',.]+)\s*(?:CHF|Fr\.?)/i);
        if (!priceMatch) continue;

        const priceStr = priceMatch[1].replace(/[',]/g, "");
        const price = Math.round(parseFloat(priceStr) * 100);
        if (isNaN(price) || price <= 0) continue;

        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        // Titel
        const titleMatch =
          block.match(/<h[23][^>]*>([^<]+)/i) ||
          block.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/i) ||
          block.match(/>([^<]{5,80})</);
        const title = titleMatch ? titleMatch[1].trim() : "Fahrzeug";

        // Link
        const linkMatch =
          block.match(/href="(\/carfinder\/[^"]+)"/i) ||
          block.match(/href="(\/auto\/[^"]+)"/i) ||
          block.match(/href="(https?:\/\/[^"]*comparis[^"]+)"/i);

        // Bild
        const imgMatch = block.match(
          /src="(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/i
        );

        results.push({
          title,
          price,
          url: linkMatch
            ? linkMatch[1].startsWith("http")
              ? linkMatch[1]
              : `${this.baseUrl}${linkMatch[1]}`
            : searchUrl,
          imageUrl: imgMatch ? imgMatch[1] : null,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) return results;
      }

      if (results.length > 0) return results;
    }

    return results;
  }

  /**
   * Generischer Fallback: CHF-Preise mit Kontext
   */
  private parseFallback(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const priceRegex = /(?:CHF|Fr\.?)\s*([\d',.]+)/gi;
    let priceMatch;

    while ((priceMatch = priceRegex.exec(html)) !== null) {
      const priceStr = priceMatch[1].replace(/[',]/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price <= 0 || price < 10000) continue; // Min 100 CHF für Autos

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Kontext suchen
      const context = html.substring(
        Math.max(0, priceMatch.index - 500),
        priceMatch.index + 200
      );

      const linkMatch =
        context.match(/href="(\/carfinder\/[^"]+)"/) ||
        context.match(/href="(\/auto\/[^"]+)"/);
      if (!linkMatch) continue;

      const titleMatch = context.match(/>([^<]{5,80})</);

      results.push({
        title: titleMatch ? titleMatch[1].trim() : "Fahrzeug",
        price,
        url: `${this.baseUrl}${linkMatch[1]}`,
        imageUrl: null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
