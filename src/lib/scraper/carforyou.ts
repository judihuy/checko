// CarForYou.ch Scraper — Puppeteer + Stealth + CH Residential Proxy
// carforyou.ch ist die Nachfolge-Plattform von auto.ricardo.ch für Fahrzeuge.
// Geo-Blocking: Leitet Nicht-CH-IPs auf globalipaction.ch um → CH Proxy ZWINGEND.
// Next.js-basiert: Listings in __NEXT_DATA__ + HTML-Elemente.
// URL-Schema: /de/auto-kaufen/{make}/{model}?price_from=X&price_to=Y&year_from=X&year_to=Y&km_to=X

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class CarForYouScraper extends BaseScraper {
  readonly platform = "carforyou";
  readonly displayName = "CarForYou.ch";
  readonly baseUrl = "https://www.carforyou.ch";
  isWorking = true;

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    // Methode 1 (PRIMÄR): Puppeteer + Stealth + CH Proxy
    try {
      const browserResults = await this.scrapeViaBrowser(query, options);
      if (browserResults.length > 0) {
        console.log(`[CarForYou] ✅ Browser: ${browserResults.length} Ergebnisse`);
        return browserResults;
      }
    } catch (error) {
      console.warn(
        `[CarForYou] Browser-Methode fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): HTTP fetch via CH Proxy
    try {
      const httpResults = await this.scrapeViaHttp(query, options);
      if (httpResults.length > 0) {
        console.log(`[CarForYou] ✅ HTTP-Fallback: ${httpResults.length} Ergebnisse`);
        return httpResults;
      }
    } catch (error) {
      console.warn(
        `[CarForYou] HTTP-Fallback fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    console.warn(`[CarForYou] ⚠️ Keine Ergebnisse aus allen Methoden`);
    return [];
  }

  /**
   * Build CarForYou search URL with filters.
   * URL pattern: /de/auto-kaufen/{make}/{model}?params
   * Without make: /de/auto-kaufen?q={query}&params
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    let searchUrl: string;

    if (options?.vehicleMake) {
      const make = options.vehicleMake.toLowerCase().replace(/\s+/g, "-");
      if (options.vehicleModel) {
        const model = options.vehicleModel.toLowerCase().replace(/\s+/g, "-");
        searchUrl = `${this.baseUrl}/de/auto-kaufen/${encodeURIComponent(make)}/${encodeURIComponent(model)}`;
      } else {
        searchUrl = `${this.baseUrl}/de/auto-kaufen/${encodeURIComponent(make)}`;
      }
    } else {
      // Free-text search
      searchUrl = `${this.baseUrl}/de/auto-kaufen`;
    }

    const urlParams = new URLSearchParams();

    // Free-text query if no structured make/model
    if (!options?.vehicleMake && query.trim()) {
      urlParams.set("q", query.trim());
    }

    // Price filters (CarForYou uses CHF, not Rappen)
    if (options?.minPrice) urlParams.set("price_from", String(Math.round(options.minPrice / 100)));
    if (options?.maxPrice) urlParams.set("price_to", String(Math.round(options.maxPrice / 100)));

    // Year filters
    if (options?.yearFrom) urlParams.set("year_from", String(options.yearFrom));
    if (options?.yearTo) urlParams.set("year_to", String(options.yearTo));

    // Mileage filters
    if (options?.kmTo) urlParams.set("km_to", String(options.kmTo));
    if (options?.kmFrom) urlParams.set("km_from", String(options.kmFrom));

    // Fuel type
    if (options?.fuelType) {
      const fuelMap: Record<string, string> = {
        benzin: "petrol", diesel: "diesel", elektro: "electric",
        hybrid: "hybrid", "plug-in-hybrid": "hybrid", gas: "gas",
      };
      const mappedFuel = fuelMap[options.fuelType.toLowerCase()];
      if (mappedFuel) urlParams.set("fuel_type", mappedFuel);
    }

    // Transmission
    if (options?.transmission) {
      const gearMap: Record<string, string> = {
        manuell: "manual", manual: "manual", schaltgetriebe: "manual",
        automat: "automatic", automatik: "automatic", automatisch: "automatic", automatic: "automatic",
      };
      const mappedGear = gearMap[options.transmission.toLowerCase()];
      if (mappedGear) urlParams.set("transmission", mappedGear);
    }

    const paramStr = urlParams.toString();
    if (paramStr) searchUrl += (searchUrl.includes("?") ? "&" : "?") + paramStr;

    return searchUrl;
  }

  /**
   * Scrape via Puppeteer + Stealth + CH Residential Proxy.
   * CH Proxy ist ZWINGEND weil carforyou.ch Nicht-CH-IPs auf globalipaction.ch redirected.
   */
  private async scrapeViaBrowser(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[CarForYou] Browser URL: ${searchUrl}`);

    // fetchWithBrowserCountry nutzt CH-Proxy (Residential, Schweizer IP)
    const html = await this.fetchWithBrowserCountry(searchUrl, "ch");

    if (html.length < 1000) {
      console.warn(`[CarForYou] ⚠️ Sehr kurze Browser-Antwort (${html.length} bytes)`);
      return [];
    }

    // Detect geo-block redirect
    if (html.includes("globalipaction.ch") || html.includes("Access denied")) {
      console.warn("[CarForYou] ⚠️ Geo-Block trotz CH-Proxy");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[CarForYou] ⚠️ Cloudflare-Challenge trotz Stealth-Browser");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * HTTP-Fallback via Proxy (may fail due to geo-blocking, but worth trying)
   */
  private async scrapeViaHttp(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[CarForYou] HTTP Fallback URL: ${searchUrl}`);

    // Use proxy-manager with CH preference to avoid geo-blocking
    const { fetchWithProxy } = await import("./proxy-manager");
    const headers: Record<string, string> = {
      "User-Agent": this.getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    };

    try {
      const { response } = await fetchWithProxy(searchUrl, this.platform, {
        headers,
        maxRetries: 2,
        preferredCountry: "ch",
      });

      if (!response.ok) {
        console.error(`[CarForYou] HTTP: ${response.status}`);
        return [];
      }

      const html = await response.text();

      if (html.length < 1000 || html.includes("globalipaction.ch")) {
        console.warn("[CarForYou] ⚠️ Geo-Block oder kurze Antwort im HTTP-Fallback");
        return [];
      }

      return this.parseAllFormats(html, options);
    } catch (error) {
      console.warn(`[CarForYou] HTTP fetch failed:`, error);
      return [];
    }
  }

  /**
   * Parse all formats: __NEXT_DATA__ → JSON-LD → HTML links
   */
  private parseAllFormats(html: string, options?: ScraperOptions): ScraperResult[] {
    // 1) __NEXT_DATA__ (richest data from Next.js SSR)
    const nextDataResults = this.parseNextData(html, options);
    if (nextDataResults.length > 0) return nextDataResults;

    // 2) JSON-LD
    const jsonLdResults = this.parseJsonLd(html, options);
    if (jsonLdResults.length > 0) return jsonLdResults;

    // 3) HTML listings fallback
    return this.parseHtmlListings(html, options);
  }

  /**
   * Parse __NEXT_DATA__ JSON embedded by Next.js SSR.
   * CarForYou embeds listing data in pageProps.
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) {
      console.log("[CarForYou] No __NEXT_DATA__ found");
      return results;
    }

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) return results;

      // Try various possible paths for listings in the Next.js data
      const listings =
        pageProps?.listings?.listings ||  // paginated listings wrapper
        pageProps?.listings ||            // direct array
        pageProps?.searchResults?.listings ||
        pageProps?.initialData?.listings ||
        pageProps?.data?.listings ||
        pageProps?.cars ||
        pageProps?.vehicles ||
        pageProps?.results;

      if (!Array.isArray(listings)) {
        // Try to find listing-like arrays deeper in the structure
        const found = this.findListingsDeep(pageProps);
        if (found.length === 0) {
          console.log("[CarForYou] __NEXT_DATA__: No listings array found in pageProps");
          return results;
        }
        return this.processListings(found, options);
      }

      console.log(`[CarForYou] __NEXT_DATA__: ${listings.length} Einträge gefunden`);
      return this.processListings(listings, options);
    } catch (error) {
      console.warn("[CarForYou] __NEXT_DATA__ parse error:", error);
      return results;
    }
  }

  /**
   * Recursively find arrays of listing-like objects in a nested structure
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private findListingsDeep(obj: any, depth = 0): any[] {
    if (depth > 5 || !obj || typeof obj !== "object") return [];

    if (Array.isArray(obj)) {
      // Check if this array contains listing-like objects (have price + title/make)
      if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
        const first = obj[0];
        const hasPrice = "price" in first || "priceCHF" in first || "priceFormatted" in first;
        const hasIdentity = "make" in first || "brand" in first || "title" in first || "name" in first;
        if (hasPrice && hasIdentity) {
          return obj;
        }
      }
    }

    for (const key of Object.keys(obj)) {
      const found = this.findListingsDeep(obj[key], depth + 1);
      if (found.length > 0) return found;
    }

    return [];
  }

  /**
   * Process a raw listings array into ScraperResults
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processListings(listings: any[], options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    for (const listing of listings) {
      try {
        // Extract title from various possible fields
        let title = "";
        if (listing.title) {
          title = listing.title;
        } else {
          const parts: string[] = [];
          const make = listing.make?.name || listing.make || listing.brand?.name || listing.brand || "";
          const model = listing.model?.name || listing.model || listing.modelGroup || "";
          const version = listing.version || listing.versionFullName || listing.typeName || "";
          if (make) parts.push(String(make));
          if (model) parts.push(String(model));
          if (version) parts.push(String(version));
          title = parts.join(" ");
        }

        if (!title) continue;

        // Extract price (in CHF → convert to Rappen)
        let priceRaw = 0;
        if (typeof listing.price === "number") {
          priceRaw = listing.price;
        } else if (typeof listing.priceCHF === "number") {
          priceRaw = listing.priceCHF;
        } else if (listing.price?.value) {
          priceRaw = typeof listing.price.value === "number"
            ? listing.price.value
            : parseFloat(String(listing.price.value));
        } else if (typeof listing.price === "string") {
          priceRaw = parseFloat(listing.price.replace(/[^0-9.]/g, ""));
        }
        if (isNaN(priceRaw)) priceRaw = 0;
        const price = Math.round(priceRaw * 100);

        // Price filter
        if (price > 0) {
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;
        }

        // Build URL
        const listingId = listing.id || listing.listingId || listing.adId || "";
        const make = listing.make?.name || listing.make || listing.brand?.name || listing.brand || "";
        const model = listing.model?.name || listing.model || listing.modelGroup || "";
        let url: string;
        if (listing.url) {
          url = listing.url.startsWith("http") ? listing.url : `${this.baseUrl}${listing.url}`;
        } else if (listingId) {
          const makeSlug = String(make).toLowerCase().replace(/\s+/g, "-");
          const modelSlug = String(model).toLowerCase().replace(/\s+/g, "-");
          url = `${this.baseUrl}/de/auto-kaufen/${makeSlug}/${modelSlug}/${listingId}`;
        } else {
          url = this.baseUrl;
        }

        // Image
        let imageUrl: string | null = null;
        if (typeof listing.image === "string") {
          imageUrl = listing.image;
        } else if (listing.image?.url) {
          imageUrl = listing.image.url;
        } else if (listing.images?.[0]) {
          imageUrl = typeof listing.images[0] === "string"
            ? listing.images[0]
            : listing.images[0].url || listing.images[0].src || null;
        } else if (listing.imageUrl) {
          imageUrl = listing.imageUrl;
        } else if (listing.mainImage) {
          imageUrl = typeof listing.mainImage === "string" ? listing.mainImage : listing.mainImage.url;
        }

        // Description
        const descParts: string[] = [];
        const year = listing.firstRegistrationYear || listing.year || listing.registrationYear;
        if (year) descParts.push(`EZ: ${year}`);
        const mileage = listing.mileage || listing.km || listing.kilometers;
        if (mileage) descParts.push(`${Number(mileage).toLocaleString("de-CH")} km`);
        const hp = listing.horsePower || listing.hp || listing.power;
        if (hp) descParts.push(`${hp} PS`);
        const fuel = listing.fuelType || listing.fuel || listing.fuelTypeName;
        if (fuel) descParts.push(String(fuel));
        const transmission = listing.transmission || listing.transmissionType || listing.gearbox;
        if (transmission) descParts.push(String(transmission));
        const city = listing.seller?.city || listing.city || listing.location;
        if (city) descParts.push(String(city));

        results.push({
          title: title.substring(0, 200),
          price,
          url,
          imageUrl,
          description: descParts.length > 0 ? descParts.join(" | ").substring(0, 500) : undefined,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      } catch {
        // Skip malformed listing
      }
    }

    if (results.length > 0) {
      console.log(`[CarForYou] Parsed ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Parse JSON-LD schema.org data
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

            let priceRaw = 0;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers?.price) {
                priceRaw = typeof offers.price === "number"
                  ? offers.price
                  : parseFloat(String(offers.price || "0").replace(/[^0-9.]/g, ""));
              }
            }
            if (isNaN(priceRaw)) priceRaw = 0;
            const price = Math.round(priceRaw * 100);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = item.url?.startsWith("http") ? item.url : `${this.baseUrl}${item.url || ""}`;
            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];

            results.push({
              title: item.name.substring(0, 200),
              price,
              url,
              imageUrl,
              description: item.description?.substring(0, 500) || undefined,
              platform: this.platform,
              scrapedAt: new Date(),
            });

            if (options?.limit && results.length >= options.limit) break;
          }
        }
      } catch {
        // Skip malformed JSON-LD
      }
    }

    if (results.length > 0) {
      console.log(`[CarForYou] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Fallback: Parse listing links and prices from HTML structure
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // CarForYou listing detail links: /de/auto-kaufen/{make}/{model}/{id} or similar patterns
    const linkRegex = /href="(\/de\/auto-kaufen\/[^"]+\/\d+[^"]*)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Context around the link for title/price extraction
      const start = Math.max(0, linkMatch.index - 600);
      const end = Math.min(html.length, linkMatch.index + 600);
      const context = html.substring(start, end);

      // Title from attributes or text
      const titleMatch = context.match(/(?:aria-label|title|alt)="([^"]{5,150})"/);
      let title = titleMatch ? titleMatch[1] : "";

      if (!title) {
        // Try to extract from URL slug
        const slugMatch = href.match(/\/de\/auto-kaufen\/([^/]+)\/([^/]+)/);
        if (slugMatch) {
          title = `${slugMatch[1]} ${slugMatch[2]}`.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        }
      }

      if (!title) continue;

      // Price: CHF XX'XXX or variants
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
      const imgMatch = context.match(/src="(https?:\/\/[^"]*(?:carforyou|cfy|cloudfront)[^"]+)"/i);

      if (price > 0 || title.length > 5) {
        results.push({
          title: title.substring(0, 200),
          price,
          url: `${this.baseUrl}${href}`,
          imageUrl: imgMatch ? imgMatch[1] : null,
          platform: this.platform,
          scrapedAt: new Date(),
        });
      }

      if (options?.limit && results.length >= options.limit) break;
    }

    if (results.length > 0) {
      console.log(`[CarForYou] HTML-Listings: ${results.length} Ergebnisse`);
    }

    return results;
  }
}
