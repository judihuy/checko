// Tutti.ch Scraper — HTTP-Fetch mit FlareSolverr-Fallback
// Primär: HTTP-Fetch mit Proxy + Browser-Headers
// Fallback: FlareSolverr bei 403/Cloudflare
// Letzter Fallback: Puppeteer + Stealth + CH Proxy

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { fetchViaFlareSolverr, isCloudflareChallenge, isFlareSolverrConfigured } from "./flaresolverr";
import { parseSwissPrice, parseSwissPriceRappen } from "./price-utils";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";
  isWorking = true; // ✅ Reaktiviert mit FlareSolverr-Fallback

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    // Methode 1 (PRIMÄR): HTTP-Fetch mit CH-Proxy + Browser-Headers
    try {
      const htmlResults = await this.scrapeViaHttp(query, options);
      if (htmlResults.length > 0) {
        console.log(`[Tutti] ✅ HTTP-Fetch: ${htmlResults.length} Ergebnisse`);
        return htmlResults;
      }
    } catch (error) {
      console.warn(
        `[Tutti] HTTP-Fetch fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): FlareSolverr (Cloudflare-Bypass)
    if (isFlareSolverrConfigured()) {
      try {
        const flareResults = await this.scrapeViaFlareSolverr(query, options);
        if (flareResults.length > 0) {
          console.log(`[Tutti] ✅ FlareSolverr-Fallback: ${flareResults.length} Ergebnisse`);
          return flareResults;
        }
      } catch (error) {
        console.warn(
          `[Tutti] FlareSolverr-Fallback fehlgeschlagen:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Methode 3 (LETZTER FALLBACK): Puppeteer + Stealth + CH Proxy
    try {
      const browserResults = await this.scrapeViaBrowser(query, options);
      if (browserResults.length > 0) {
        console.log(`[Tutti] ✅ Browser-Fallback: ${browserResults.length} Ergebnisse`);
        return browserResults;
      }
    } catch (error) {
      console.warn(
        `[Tutti] Browser-Fallback fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    console.warn(`[Tutti] ⚠️ Keine Ergebnisse aus allen Methoden`);
    return [];
  }

  /**
   * Build Tutti search URL with filters
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `${this.baseUrl}/de/q/${encodedQuery}`;

    const urlParams = new URLSearchParams();
    if (options?.minPrice) urlParams.set("price_from", String(Math.round(options.minPrice / 100)));
    if (options?.maxPrice) urlParams.set("price_to", String(Math.round(options.maxPrice / 100)));
    urlParams.set("sorting", "newest");

    const paramStr = urlParams.toString();
    if (paramStr) searchUrl += "?" + paramStr;

    return searchUrl;
  }

  /**
   * PRIMÄR: HTTP-Fetch mit CH-Proxy + Browser-Headers
   */
  private async scrapeViaHttp(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Tutti] HTTP-Fetch URL: ${searchUrl}`);

    const response = await this.fetchWithCountryHeaders(searchUrl, "ch");

    if (!response.ok) {
      if (isCloudflareChallenge(response.status)) {
        throw new Error(`Cloudflare-Challenge erkannt (HTTP ${response.status})`);
      }
      console.error(`[Tutti] HTTP: ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`[Tutti] HTML length: ${html.length}`);

    if (html.length < 1000 || isCloudflareChallenge(200, html)) {
      throw new Error("Cloudflare-Challenge oder kurze Antwort erkannt");
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * FlareSolverr-Fallback bei Cloudflare
   */
  private async scrapeViaFlareSolverr(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Tutti] FlareSolverr URL: ${searchUrl}`);

    const html = await fetchViaFlareSolverr(searchUrl, this.platform);

    if (html.length < 1000) {
      console.warn("[Tutti] ⚠️ Sehr kurze FlareSolverr-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Tutti] ⚠️ Cloudflare-Challenge trotz FlareSolverr");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * Browser-Fallback: Puppeteer + Stealth + CH Proxy
   */
  private async scrapeViaBrowser(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Tutti] Browser URL: ${searchUrl}`);

    const html = await this.fetchWithBrowserCountry(searchUrl, "ch");

    if (html.length < 1000) {
      console.warn("[Tutti] ⚠️ Sehr kurze Browser-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Tutti] ⚠️ Cloudflare-Challenge trotz Stealth-Browser");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * Parse all formats: JSON-LD → __NEXT_DATA__ → HTML
   */
  private parseAllFormats(html: string, options?: ScraperOptions): ScraperResult[] {
    let results = this.parseJsonLd(html, options);
    if (results.length > 0) return results;

    results = this.parseNextData(html, options);
    if (results.length > 0) return results;

    results = this.parseHtmlListings(html, options);
    return results;
  }

  /**
   * Parse JSON-LD schema.org ItemList
   */
  private parseJsonLd(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const jsonLdMatches = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        const graphs = jsonData?.["@graph"] || [jsonData];

        for (const graph of graphs) {
          if (graph?.["@type"] !== "ItemList" || !Array.isArray(graph?.itemListElement)) continue;

          for (const entry of graph.itemListElement) {
            const item = entry?.item || entry;
            if (!item?.name) continue;

            const title = item.name as string;

            let priceRaw = 0;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers) {
                const val = offers.price || offers.lowPrice;
                priceRaw = parseSwissPrice(val as string | number);
              }
            }
            const price = parseSwissPriceRappen(priceRaw || 0);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];

            let listedAt: Date | null = null;
            const dateStr = item.datePosted || item.dateCreated || item.datePublished;
            if (dateStr) {
              const parsed = new Date(dateStr as string);
              if (!isNaN(parsed.getTime())) listedAt = parsed;
            }

            results.push({
              title,
              price,
              url: fullUrl,
              imageUrl,
              description: item.description ? String(item.description).substring(0, 500) : undefined,
              platform: this.platform,
              scrapedAt: new Date(),
              listedAt,
            });

            if (options?.limit && results.length >= options.limit) break;
          }
          if (results.length > 0) break;
        }
        if (results.length > 0) break;
      } catch {
        // JSON parse error
      }
    }

    if (results.length > 0) {
      console.log(`[Tutti] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON from Tutti's Next.js SSR
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) return results;

      // Try common patterns for Tutti search result data
      const listings = pageProps?.listings ||
        pageProps?.searchResults?.listings ||
        pageProps?.initialData?.listings ||
        pageProps?.data?.listings ||
        pageProps?.results;

      if (!Array.isArray(listings)) return results;

      console.log(`[Tutti] __NEXT_DATA__: ${listings.length} Inserate gefunden`);

      for (const listing of listings) {
        const title = listing.title || listing.subject || listing.name || "";
        if (!title) continue;

        const priceCHF = listing.price ?? listing.sellPrice ?? 0;
        const priceRappen = parseSwissPriceRappen(priceCHF as string | number);

        if (priceRappen > 0) {
          if (options?.minPrice && priceRappen < options.minPrice) continue;
          if (options?.maxPrice && priceRappen > options.maxPrice) continue;
        }

        const listingId = listing.id || listing.listingId || "";
        const slug = listing.slug || listing.seoUrl || "";
        const listingUrl = slug
          ? `${this.baseUrl}${slug.startsWith("/") ? slug : "/" + slug}`
          : listingId
            ? `${this.baseUrl}/de/vi/${listingId}`
            : this.baseUrl;

        let imageUrl: string | null = null;
        if (typeof listing.image === "string") imageUrl = listing.image;
        else if (listing.imageUrl) imageUrl = listing.imageUrl;
        else if (listing.images?.[0]) {
          imageUrl = typeof listing.images[0] === "string" ? listing.images[0] : listing.images[0].url;
        } else if (listing.thumbnailUrl) imageUrl = listing.thumbnailUrl;

        let listedAt: Date | null = null;
        const dateStr = listing.createdAt || listing.publishDate || listing.timestamp || listing.date;
        if (dateStr) {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) listedAt = parsed;
        }

        results.push({
          title: title.substring(0, 200),
          price: isNaN(priceRappen) ? 0 : priceRappen,
          url: listingUrl,
          imageUrl,
          description: listing.body ? String(listing.body).substring(0, 500) : undefined,
          platform: this.platform,
          scrapedAt: new Date(),
          listedAt,
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    } catch {
      // JSON parse error
    }

    if (results.length > 0) {
      console.log(`[Tutti] __NEXT_DATA__: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Parse listing links and prices from HTML
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Tutti listing links: /de/vi/{id} or similar patterns
    const linkRegex = /href="(\/de\/(?:vi|inserat|q)\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      // Skip search/category pages
      if (href.startsWith("/de/q/")) continue;
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      const start = Math.max(0, linkMatch.index - 500);
      const end = Math.min(html.length, linkMatch.index + 500);
      const context = html.substring(start, end);

      // Title
      const titleMatch = context.match(/(?:aria-label|title|data-testid="[^"]*")="([^"]+)"/);
      let title = titleMatch ? titleMatch[1] : "";
      if (!title) {
        const textMatch = context.match(/>([^<]{5,100})</);
        if (textMatch) title = textMatch[1].trim();
      }
      if (!title) continue;

      // Price
      const priceMatch = context.match(/(?:CHF|Fr\.?)\s*([\d''.,-]+)|(\d[\d'.,-]+)\s*(?:CHF|Fr\.?)/);
      let price = 0;
      if (priceMatch) {
        const priceStr = priceMatch[1] || priceMatch[2] || "0";
        price = parseSwissPriceRappen(priceStr);
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      const imgMatch = context.match(/src="(https:\/\/[^"]*tutti[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i);

      const fullUrl = `${this.baseUrl}${href}`;

      results.push({
        title: title.substring(0, 200),
        price,
        url: fullUrl,
        imageUrl: imgMatch ? imgMatch[1] : null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    if (results.length > 0) {
      console.log(`[Tutti] HTML-Listings: ${results.length} Ergebnisse`);
    }

    return results;
  }
}
