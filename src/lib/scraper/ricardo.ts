// Ricardo.ch Scraper — HTTP-Fetch mit Proxy + echten Browser-Headers (primär)
// HTML/JSON-LD/NEXT_DATA Parsing.
// Proxy: Residential CH über p.webshare.io (Ländercode -ch).
// Puppeteer nur als letzter Fallback.
// Ricardo deckt ALLE Kategorien ab: Fahrzeuge, Elektronik, Möbel, etc.

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { fetchViaFlareSolverr, isCloudflareChallenge, isFlareSolverrConfigured } from "./flaresolverr";

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

    // Detect vehicle searches for post-filtering (filter out toy cars, model cars etc.)
    const isVehicleSearch = !!(
      options?.vehicleMake ||
      options?.vehicleModel ||
      options?.category === "Fahrzeuge" ||
      options?.category === "Motorräder" ||
      options?.subcategory === "Autos" ||
      options?.subcategory === "Motorräder" ||
      options?.subcategory === "Wohnmobile"
    );

    // Methode 1 (PRIMÄR): HTTP-Fetch mit CH-Proxy + Browser-Headers
    try {
      const htmlResults = await this.scrapeViaHtml(enrichedQuery, options, isVehicleSearch);
      if (htmlResults.length > 0) {
        console.log(`[Ricardo] ✅ HTTP-Fetch: ${htmlResults.length} Ergebnisse`);
        return htmlResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] HTTP-Fetch fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): FlareSolverr (Cloudflare-Bypass)
    if (isFlareSolverrConfigured()) {
      try {
        const flareResults = await this.scrapeViaFlareSolverr(enrichedQuery, options, isVehicleSearch);
        if (flareResults.length > 0) {
          console.log(`[Ricardo] ✅ FlareSolverr-Fallback: ${flareResults.length} Ergebnisse`);
          return flareResults;
        }
      } catch (error) {
        console.warn(
          `[Ricardo] FlareSolverr-Fallback fehlgeschlagen:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Methode 3 (LETZTER FALLBACK): Puppeteer + Stealth + CH Proxy
    try {
      const browserResults = await this.scrapeViaBrowser(enrichedQuery, options, isVehicleSearch);
      if (browserResults.length > 0) {
        console.log(`[Ricardo] ✅ Browser-Fallback: ${browserResults.length} Ergebnisse`);
        return browserResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] Browser-Fallback fehlgeschlagen:`,
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
   * Ricardo per FlareSolverr scrapen (Cloudflare-Bypass).
   * Wird als Fallback genutzt wenn HTTP-Fetch 403/Cloudflare erhält.
   */
  private async scrapeViaFlareSolverr(
    query: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Ricardo] FlareSolverr URL: ${searchUrl}`);

    const html = await fetchViaFlareSolverr(searchUrl, this.platform);

    if (html.length < 1000) {
      console.warn("[Ricardo] ⚠️ Sehr kurze FlareSolverr-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Ricardo] ⚠️ Cloudflare-Challenge trotz FlareSolverr");
      return [];
    }

    return this.parseAllFormats(html, options, isVehicleSearch);
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

    return this.parseAllFormats(html, options, isVehicleSearch);
  }

  /**
   * PRIMÄR: Seite per HTTP-Fetch mit CH-Proxy + Browser-Headers laden und parsen
   */
  private async scrapeViaHtml(
    query: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Ricardo] HTTP-Fetch URL: ${searchUrl}`);

    // CH-Proxy mit echten Browser-Headers (wie eBay KA Ansatz)
    const response = await this.fetchWithCountryHeaders(searchUrl, "ch");

    if (!response.ok) {
      // Bei 403/503 Cloudflare → Exception werfen, damit FlareSolverr-Fallback greift
      if (isCloudflareChallenge(response.status)) {
        throw new Error(`Cloudflare-Challenge erkannt (HTTP ${response.status})`);
      }
      console.error(`[Ricardo] HTTP: ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`[Ricardo] HTML length: ${html.length}`);

    if (html.length < 1000 || isCloudflareChallenge(200, html)) {
      throw new Error("Cloudflare-Challenge oder kurze Antwort erkannt");
    }

    return this.parseAllFormats(html, options, isVehicleSearch);
  }

  /**
   * Try all parsing strategies in order: JSON-LD → HTML → RSC → __NEXT_DATA__
   */
  private parseAllFormats(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    let results = this.parseJsonLd(html, options, isVehicleSearch);
    if (results.length > 0) return results;

    results = this.parseHtmlListings(html, options, isVehicleSearch);
    if (results.length > 0) return results;

    results = this.parseRscData(html, options, isVehicleSearch);
    if (results.length > 0) return results;

    results = this.parseNextData(html, options, isVehicleSearch);
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

            // Insertionsdatum aus JSON-LD (datePosted, dateCreated, etc.)
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
              description: description ? description.substring(0, 500) : undefined,
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
        // JSON parse error — try next block
      }
    }

    if (results.length > 0) {
      console.log(`[Ricardo] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Extract CHF price from a text string. Returns price in Rappen or 0.
   * Handles: CHF 1'234.56, CHF&nbsp;1234.–, 1'234 CHF, Fr. 1234, etc.
   */
  private extractChfPrice(text: string): number {
    // Try multiple price patterns
    const patterns = [
      // CHF 1'234.56 or CHF&nbsp;1'234.– or CHF\xa01234
      /CHF(?:&nbsp;|\s|\u00a0)\s*([\d'''.,\u2009]+)/i,
      // Fr. 1'234.56
      /Fr\.?\s*([\d'''.,\u2009]+)/i,
      // 1'234.56 CHF (price before currency)
      /([\d'''.,\u2009]+)\s*(?:CHF|Fr\.?)/i,
      // Standalone number patterns in price-like context (e.g., data attributes)
      /price[^>]*>\s*([\d'''.,\u2009]+)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const cleaned = match[1]
          .replace(/[\u2009\s]/g, "")      // thin space / whitespace
          .replace(/['''`\u2019]/g, "")     // all apostrophe variants as thousands sep
          .replace(/\.–$/, "")              // trailing .–
          .replace(/,–$/, "")              // trailing ,–
          .replace(/[–\-]$/, "")           // trailing dash
          .replace(/\.$/, "")              // trailing dot
          .trim();
        const parsed = parseFloat(cleaned.replace(",", "."));
        if (!isNaN(parsed) && parsed > 0) {
          return Math.round(parsed * 100);
        }
      }
    }
    return 0;
  }

  /**
   * Parse listing links and prices from HTML structure.
   * Uses wider context and more aggressive price extraction to handle
   * JS-rendered content from FlareSolverr/Puppeteer.
   */
  private parseHtmlListings(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Ricardo article links: /de/a/{id} or /de/a/{slug}-{id}
    // Also handle /fr/a/ and /en/a/ variants
    const linkRegex = /href="(\/(?:de|fr|en|it)\/a\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      // Normalize to /de/a/ for dedup
      const normalized = href.replace(/^\/(?:fr|en|it)\/a\//, "/de/a/");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Use wider context for better matching (prices may be further away in React DOM)
      const start = Math.max(0, linkMatch.index - 2000);
      const end = Math.min(html.length, linkMatch.index + 2000);
      const context = html.substring(start, end);

      // Title: text inside the link or nearby heading/aria-label
      const titleMatch = context.match(/(?:aria-label|title|alt)="([^"]{5,200})"/);
      let title = titleMatch ? titleMatch[1] : "";

      // If no title from attributes, try to extract from tag content near the link
      if (!title) {
        const textMatch = context.match(/>([^<]{5,150})</);
        if (textMatch) title = textMatch[1].trim();
      }

      if (!title) continue;

      // Vehicle filter
      if (isVehicleSearch && this.isNonVehicleItem(title)) continue;

      // Price extraction with enhanced method
      const price = this.extractChfPrice(context);

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Image: Ricardo uses img.ricardostatic.ch
      let imageUrl: string | null = null;
      const imgMatch = context.match(/src="(https:\/\/img\.ricardostatic\.ch[^"]+)"/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }
      // Also try srcset
      if (!imageUrl) {
        const srcsetMatch = context.match(/srcset="([^"]*img\.ricardostatic\.ch[^"]*)"/i);
        if (srcsetMatch) {
          const firstEntry = srcsetMatch[1].split(",")[0].trim();
          const srcsetUrl = firstEntry.split(/\s+/)[0];
          if (srcsetUrl && srcsetUrl.startsWith("http")) {
            imageUrl = srcsetUrl;
          }
        }
      }

      const fullUrl = `${this.baseUrl}${href}`;

      results.push({
        title: title.substring(0, 200),
        price,
        url: fullUrl,
        imageUrl,
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
   * Parse Ricardo RSC flight data (Next.js App Router).
   * Ricardo may embed article data in self.__next_f.push() chunks.
   */
  private parseRscData(
    html: string,
    options?: ScraperOptions,
    isVehicleSearch?: boolean
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Extract RSC chunks
    const chunkPattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let fullData = "";
    let chunkMatch;
    while ((chunkMatch = chunkPattern.exec(html)) !== null) {
      try {
        const unescaped = JSON.parse(`"${chunkMatch[1]}"`);
        fullData += unescaped;
      } catch {
        // Skip malformed chunks
      }
    }

    if (fullData.length < 100) return results;

    console.log(`[Ricardo] RSC data extracted: ${fullData.length} chars`);

    // Look for article-like objects with price fields
    // Ricardo articles typically have: title/name, buyNowPrice/bidPrice/price, and an id
    const articlePattern = /"(?:title|name)":"([^"]{3,200})"[^}]*?"(?:buyNowPrice|bidPrice|price|currentPrice)":\s*(\d+(?:\.\d+)?)/g;
    let am;
    const seenTitles = new Set<string>();

    while ((am = articlePattern.exec(fullData)) !== null) {
      const title = am[1];
      const priceCHF = parseFloat(am[2]);

      if (seenTitles.has(title)) continue;
      seenTitles.add(title);

      if (isVehicleSearch && this.isNonVehicleItem(title)) continue;

      const priceRappen = Math.round(priceCHF * 100);
      if (priceRappen > 0) {
        if (options?.minPrice && priceRappen < options.minPrice) continue;
        if (options?.maxPrice && priceRappen > options.maxPrice) continue;
      }

      // Try to find article ID nearby
      const nearbyContext = fullData.substring(
        Math.max(0, am.index - 200),
        Math.min(fullData.length, am.index + 500)
      );

      let articleUrl = this.baseUrl;
      const idMatch = nearbyContext.match(/"(?:id|articleId)":\s*(\d+)/);
      if (idMatch) {
        articleUrl = `${this.baseUrl}/de/a/${idMatch[1]}`;
      }
      // Also try URL field
      const urlMatch = nearbyContext.match(/"url":"(\/(?:de|fr|en)\/a\/[^"]+)"/);
      if (urlMatch) {
        articleUrl = `${this.baseUrl}${urlMatch[1]}`;
      }

      // Image
      let imageUrl: string | null = null;
      const imgMatch = nearbyContext.match(/"(?:image(?:Url)?|thumbnail)":"(https?:\/\/[^"]+)"/);
      if (imgMatch) imageUrl = imgMatch[1];

      results.push({
        title: title.substring(0, 200),
        price: priceRappen,
        url: articleUrl,
        imageUrl,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    if (results.length > 0) {
      console.log(`[Ricardo] RSC data: ${results.length} Ergebnisse`);
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

        // Insertionsdatum extrahieren
        let listedAt: Date | null = null;
        const startDate = article.startDate || article.createdDate || article.publishDate || article.insertionDate;
        if (startDate) {
          const parsed = new Date(startDate);
          if (!isNaN(parsed.getTime())) {
            listedAt = parsed;
          }
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
          listedAt,
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
