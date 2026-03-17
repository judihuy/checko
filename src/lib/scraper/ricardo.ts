// Ricardo.ch Scraper — Puppeteer + Stealth + CH Residential Proxy
// Die /api/mfa/search API liefert generischen Müll und ignoriert Suchparameter.
// Daher: Browser-Scraping der Suchseite mit Puppeteer-Extra-Stealth.
// Proxy: Residential CH über p.webshare.io (Ländercode -ch).
// Fallback-Kette: Puppeteer → HTML/JSON-LD fetch

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class RicardoScraper extends BaseScraper {
  readonly platform = "ricardo";
  readonly displayName = "Ricardo.ch";
  readonly baseUrl = "https://www.ricardo.ch";
  isWorking = true;

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    // Enrich query with vehicle make/model if available
    let enrichedQuery = query;
    if (options?.vehicleMake) {
      enrichedQuery = options.vehicleMake;
      if (options.vehicleModel) enrichedQuery += " " + options.vehicleModel;
      if (query && query !== enrichedQuery && !enrichedQuery.toLowerCase().includes(query.toLowerCase())) {
        enrichedQuery += " " + query;
      }
    }

    // Detect vehicle searches for post-filtering
    const isVehicleSearch = options?.category === "Fahrzeuge" ||
      options?.category === "Motorräder" ||
      !!(options?.vehicleMake || options?.vehicleModel);

    // Methode 1 (PRIMÄR): Puppeteer + Stealth + CH Proxy
    try {
      const browserResults = await this.scrapeViaBrowser(enrichedQuery, options, isVehicleSearch);
      if (browserResults.length > 0) {
        console.log(`[Ricardo] ✅ Browser: ${browserResults.length} Ergebnisse`);
        return browserResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] Browser-Methode fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): HTTP fetch + HTML/JSON-LD Parsing
    try {
      const htmlResults = await this.scrapeViaHtml(enrichedQuery, options, isVehicleSearch);
      if (htmlResults.length > 0) {
        console.log(`[Ricardo] HTML-Fallback: ${htmlResults.length} Ergebnisse`);
        return htmlResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] HTML-Fallback fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    console.warn(`[Ricardo] ⚠️ Keine Ergebnisse aus allen Methoden`);
    return [];
  }

  /**
   * Build Ricardo search URL with filters
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `${this.baseUrl}/de/s/${encodedQuery}`;

    const urlParams = new URLSearchParams();
    if (options?.minPrice) urlParams.set("price_min", String(Math.round(options.minPrice / 100)));
    if (options?.maxPrice) urlParams.set("price_max", String(Math.round(options.maxPrice / 100)));
    urlParams.set("sort_by", "newest");

    const paramStr = urlParams.toString();
    if (paramStr) searchUrl += "?" + paramStr;

    return searchUrl;
  }

  /**
   * Ricardo per Puppeteer + Stealth + CH Residential Proxy scrapen.
   * Der Browser geht über den Residential Proxy mit Schweizer IP.
   */
  private async scrapeViaBrowser(
    query: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Ricardo] Browser URL: ${searchUrl}`);

    // fetchWithBrowserCountry nutzt CH-Proxy (Residential, Schweizer IP)
    const html = await this.fetchWithBrowserCountry(searchUrl, "ch");

    if (html.length < 1000) {
      console.warn("[Ricardo] ⚠️ Sehr kurze Browser-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Ricardo] ⚠️ Cloudflare-Challenge trotz Stealth-Browser");
      return [];
    }

    // Parse: zuerst JSON-LD versuchen, dann HTML-Elemente
    let results = this.parseJsonLd(html, options, isVehicleSearch);
    if (results.length === 0) {
      results = this.parseHtmlListings(html, options, isVehicleSearch);
    }

    // Fallback: __NEXT_DATA__ (Next.js SSR data)
    if (results.length === 0) {
      results = this.parseNextData(html, options, isVehicleSearch);
    }

    return results;
  }

  /**
   * HTML-Fallback: Seite per HTTP laden und parsen
   */
  private async scrapeViaHtml(
    query: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Ricardo] HTML Fallback URL: ${searchUrl}`);

    const response = await this.fetchWithHeaders(searchUrl);
    if (!response.ok) {
      console.error(`[Ricardo] HTML: HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    if (html.length < 1000 || html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Ricardo] ⚠️ Cloudflare-Challenge oder kurze Antwort");
      return [];
    }

    let results = this.parseJsonLd(html, options, isVehicleSearch);
    if (results.length === 0) {
      results = this.parseHtmlListings(html, options, isVehicleSearch);
    }
    if (results.length === 0) {
      results = this.parseNextData(html, options, isVehicleSearch);
    }

    return results;
  }

  /**
   * Non-vehicle keyword filter for vehicle searches
   */
  private isNonVehicleItem(title: string): boolean {
    const NON_VEHICLE_KEYWORDS = [
      /modellauto/i, /spielzeug/i, /poster/i, /prospekt/i, /katalog/i,
      /schlüsselanhänger/i, /aufkleber/i, /t-shirt/i, /tasse\b/i,
      /hülle/i, /cover\b/i, /case\b/i, /sticker/i, /buch\b/i,
      /lego/i, /playmobil/i, /hot\s*wheels/i, /matchbox/i, /diecast/i,
      /1[:/]\s*\d{2}\b/i, /miniatur/i, /pokemon/i, /karte\b/i, /card\b/i,
      /lamini/i, /laminier/i,
    ];
    return NON_VEHICLE_KEYWORDS.some(pattern => pattern.test(title));
  }

  /**
   * Parse JSON-LD schema.org ItemList aus HTML
   */
  private parseJsonLd(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const jsonLdMatches = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        const graphs = jsonData?.["@graph"] || [jsonData];

        for (const graph of graphs) {
          if (graph?.["@type"] !== "ItemList" || !Array.isArray(graph?.itemListElement)) {
            continue;
          }

          for (const entry of graph.itemListElement) {
            const item = entry?.item || entry;
            if (!item) continue;

            const title = (item.name as string) || "";
            if (!title) continue;

            // Vehicle filter
            if (isVehicleSearch && this.isNonVehicleItem(title)) {
              console.log(`[Ricardo] Skipping non-vehicle: "${title.substring(0, 60)}"`);
              continue;
            }

            // Preis aus offers
            let priceRaw = 0;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers) {
                const val = offers.price || offers.lowPrice;
                priceRaw = typeof val === "number"
                  ? val
                  : parseFloat(String(val || "0").replace(/'/g, "").replace(/[^0-9.\-]/g, ""));
              }
            }
            if (isNaN(priceRaw)) priceRaw = 0;
            const price = Math.round(priceRaw * 100);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];

            const description = (item.description || "") as string;

            results.push({
              title,
              price,
              url: fullUrl,
              imageUrl,
              description: description ? description.substring(0, 500) : undefined,
              platform: this.platform,
              scrapedAt: new Date(),
            });

            if (options?.limit && results.length >= options.limit) break;
          }
          if (results.length > 0) break;
        }
        if (results.length > 0) break;
      } catch {
        // JSON parse error — try next block
      }
    }

    if (results.length > 0) {
      console.log(`[Ricardo] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Parse listing links and prices from HTML structure
   */
  private parseHtmlListings(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Ricardo article links: /de/a/{id} or /de/a/{slug}-{id}
    const linkRegex = /href="(\/de\/a\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      // Context around the link for title/price extraction
      const start = Math.max(0, linkMatch.index - 500);
      const end = Math.min(html.length, linkMatch.index + 500);
      const context = html.substring(start, end);

      // Title: text inside the link or nearby heading
      const titleMatch = context.match(/(?:aria-label|title)="([^"]+)"/);
      let title = titleMatch ? titleMatch[1] : "";

      // If no title from attributes, try to extract from tag content
      if (!title) {
        const textMatch = context.match(/>([^<]{5,100})</);
        if (textMatch) title = textMatch[1].trim();
      }

      if (!title) continue;

      // Vehicle filter
      if (isVehicleSearch && this.isNonVehicleItem(title)) continue;

      // Price: CHF XX or XX.XX CHF
      const priceMatch = context.match(/(?:CHF|Fr\.?)\s*([\d''.,-]+)|(\d[\d'.,-]+)\s*(?:CHF|Fr\.?)/);
      let price = 0;
      if (priceMatch) {
        const priceStr = (priceMatch[1] || priceMatch[2] || "0");
        price = Math.round(
          parseFloat(priceStr.replace(/['']/g, "").replace(".–", "").replace(",", ".")) * 100
        );
        if (isNaN(price)) price = 0;
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Image
      const imgMatch = context.match(/src="(https:\/\/img\.ricardostatic\.ch[^"]+)"/i);

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
      console.log(`[Ricardo] HTML-Listings: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON from Ricardo's Next.js SSR
   */
  private parseNextData(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);

      // Navigate through various possible paths for search results
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) return results;

      // Try common patterns for search result data
      const articles = pageProps?.articles ||
        pageProps?.searchResults?.articles ||
        pageProps?.initialData?.articles ||
        pageProps?.data?.articles;

      if (!Array.isArray(articles)) return results;

      console.log(`[Ricardo] __NEXT_DATA__: ${articles.length} Artikel gefunden`);

      for (const article of articles) {
        const title = article.title || article.name || "";
        if (!title) continue;

        if (isVehicleSearch && this.isNonVehicleItem(title)) continue;

        const priceCHF = article.buyNowPrice ?? article.bidPrice ?? article.price ?? 0;
        const priceRappen = Math.round(priceCHF * 100);

        if (priceRappen > 0) {
          if (options?.minPrice && priceRappen < options.minPrice) continue;
          if (options?.maxPrice && priceRappen > options.maxPrice) continue;
        }

        const articleId = article.id || article.articleId || "";
        const articleUrl = articleId ? `${this.baseUrl}/de/a/${articleId}` : this.baseUrl;

        let imageUrl: string | null = null;
        if (typeof article.image === "string") {
          imageUrl = article.image;
        } else if (article.imageUrl) {
          imageUrl = article.imageUrl;
        } else if (article.images?.[0]) {
          imageUrl = typeof article.images[0] === "string" ? article.images[0] : article.images[0].url;
        }

        const descParts: string[] = [];
        if (article.hasAuction && article.bidPrice) {
          descParts.push(`Auktion: CHF ${article.bidPrice}`);
        }
        if (article.hasBuyNow && article.buyNowPrice) {
          descParts.push(`Sofortkauf: CHF ${article.buyNowPrice}`);
        }
        if (article.endDate) {
          descParts.push(`Endet: ${new Date(article.endDate).toLocaleDateString("de-CH")}`);
        }

        results.push({
          title: title.substring(0, 200),
          price: priceRappen,
          url: articleUrl,
          imageUrl,
          description: descParts.length > 0 ? descParts.join(" | ") : undefined,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    } catch {
      // JSON parse error
    }

    if (results.length > 0) {
      console.log(`[Ricardo] __NEXT_DATA__: ${results.length} Ergebnisse`);
    }

    return results;
  }
}
