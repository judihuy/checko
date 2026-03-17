// AutoScout24.ch Scraper — Puppeteer + Stealth + CH Residential Proxy
// Browser-Scraping mit puppeteer-extra-plugin-stealth.
// Proxy: Residential CH über p.webshare.io (Ländercode -ch).
// Parsing-Kette: RSC flight data → HTML listing links → JSON-LD.
// Fallback auf HTTP wenn Browser fehlschlägt.
//
// URL-Format:
// - Make/Model: /de/s/mo-{model}/mk-{make}
// - Year: ?fregfrom=X&fregto=Y
// - KM: ?kmfrom=X&kmto=Y
// - Preis: ?pricefrom=X&priceto=Y
// - Treibstoff: ?fuel=B|D|E|H|L
// - Getriebe: ?gear=M|A

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

// Fuel type mapping
const FUEL_TYPE_MAP: Record<string, string> = {
  benzin: "B",
  diesel: "D",
  elektro: "E",
  hybrid: "H",
  "plug-in-hybrid": "H",
  gas: "L",
};

// Transmission mapping
const TRANSMISSION_MAP: Record<string, string> = {
  manuell: "M",
  manual: "M",
  schaltgetriebe: "M",
  automat: "A",
  automatik: "A",
  automatisch: "A",
  automatic: "A",
};

// Image base URL for AutoScout24
const IMAGE_BASE_URL = "https://listing-images.autoscout24.ch";

interface AutoScoutListing {
  id: number;
  conditionType?: string;
  firstRegistrationYear?: number;
  firstRegistrationDate?: string;
  fuelType?: string;
  horsePower?: number;
  kiloWatts?: number;
  images?: Array<{ key: string }>;
  make?: { id: number; name: string; key: string };
  model?: { id: number; name: string; key: string };
  mileage?: number;
  price: number;
  previousPrice?: number | null;
  seller?: { city?: string; name?: string; type?: string };
  teaser?: string;
  transmissionTypeGroup?: string;
  versionFullName?: string;
  warranty?: unknown;
}

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";
  isWorking = true;

  /**
   * Build search URL from query and options
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    let searchUrl: string;
    if (options?.vehicleMake) {
      const make = options.vehicleMake.toLowerCase().replace(/\s+/g, "-");
      if (options.vehicleModel) {
        const model = options.vehicleModel.toLowerCase().replace(/\s+/g, "-");
        searchUrl = `${this.baseUrl}/de/s/mo-${encodeURIComponent(model)}/mk-${encodeURIComponent(make)}`;
      } else {
        searchUrl = `${this.baseUrl}/de/s/mk-${encodeURIComponent(make)}`;
      }
    } else {
      searchUrl = `${this.baseUrl}/de/s?q=${encodeURIComponent(query)}`;
    }

    // URL parameters
    const urlParams = new URLSearchParams();
    if (options?.yearFrom) urlParams.set("fregfrom", String(options.yearFrom));
    if (options?.yearTo) urlParams.set("fregto", String(options.yearTo));
    if (options?.kmFrom) urlParams.set("kmfrom", String(options.kmFrom));
    if (options?.kmTo) urlParams.set("kmto", String(options.kmTo));
    if (options?.minPrice) urlParams.set("pricefrom", String(Math.round(options.minPrice / 100)));
    if (options?.maxPrice) urlParams.set("priceto", String(Math.round(options.maxPrice / 100)));
    if (options?.fuelType) {
      const fuelCode = FUEL_TYPE_MAP[options.fuelType.toLowerCase()];
      if (fuelCode) urlParams.set("fuel", fuelCode);
    }
    if (options?.transmission) {
      const gearCode = TRANSMISSION_MAP[options.transmission.toLowerCase()];
      if (gearCode) urlParams.set("gear", gearCode);
    }
    urlParams.set("cy", "CH");

    const paramStr = urlParams.toString();
    if (paramStr) {
      searchUrl += (searchUrl.includes("?") ? "&" : "?") + paramStr;
    }

    return searchUrl;
  }

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    try {
      const searchUrl = this.buildSearchUrl(query, options);
      console.log(`[AutoScout] Search URL: ${searchUrl}`);

      // Methode 1 (PRIMÄR): Puppeteer + Stealth + CH Proxy
      try {
        const browserResults = await this.scrapeViaBrowser(searchUrl, options);
        if (browserResults.length > 0) {
          console.log(`[AutoScout] ✅ Browser: ${browserResults.length} Ergebnisse`);
          return browserResults;
        }
      } catch (error) {
        console.warn(
          `[AutoScout] Browser-Methode fehlgeschlagen:`,
          error instanceof Error ? error.message : String(error)
        );
      }

      // Methode 2 (FALLBACK): HTTP fetch
      try {
        const httpResults = await this.scrapeViaHttp(searchUrl, options);
        if (httpResults.length > 0) {
          console.log(`[AutoScout] ✅ HTTP-Fallback: ${httpResults.length} Ergebnisse`);
          return httpResults;
        }
      } catch (error) {
        console.warn(
          `[AutoScout] HTTP-Fallback fehlgeschlagen:`,
          error instanceof Error ? error.message : String(error)
        );
      }

      console.warn(`[AutoScout] ⚠️ Keine Ergebnisse`);
      return [];
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error(`[AutoScout] Scraper-Fehler: ${reason}`);
      return [];
    }
  }

  /**
   * AutoScout24 per Puppeteer + Stealth + CH Residential Proxy scrapen.
   * Der Browser geht über den Residential Proxy mit Schweizer IP.
   */
  private async scrapeViaBrowser(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.log(`[AutoScout] Browser URL: ${searchUrl}`);

    // fetchWithBrowserCountry nutzt CH-Proxy (Residential, Schweizer IP)
    const html = await this.fetchWithBrowserCountry(searchUrl, "ch");

    if (html.length < 5000) {
      console.warn(`[AutoScout] ⚠️ Sehr kurze Browser-Antwort (${html.length} bytes)`);
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[AutoScout] ⚠️ Cloudflare-Challenge trotz Stealth-Browser");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * HTTP-Fallback: Seite per HTTP laden.
   */
  private async scrapeViaHttp(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    await this.enforceRateLimit();

    const userAgent = this.getRandomUserAgent();
    const headers: Record<string, string> = {
      "User-Agent": userAgent,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
    };

    let response: Response;
    try {
      response = await fetch(searchUrl, { headers, redirect: "follow" });
    } catch (fetchError) {
      console.warn(`[AutoScout] Direct fetch failed:`, fetchError);
      const { response: proxyResp } = await (await import("./proxy-manager")).fetchWithProxy(
        searchUrl, this.platform, { headers, maxRetries: 2, preferredCountry: "ch" }
      );
      response = proxyResp;
    }

    if (!response.ok) {
      console.error(`[AutoScout] HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`[AutoScout] HTML length: ${html.length}`);

    if (html.length < 5000) {
      console.warn(`[AutoScout] ⚠️ Sehr kurze Antwort`);
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[AutoScout] ⚠️ Cloudflare-Challenge");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * Parse all formats: RSC → HTML → JSON-LD
   */
  private parseAllFormats(html: string, options?: ScraperOptions): ScraperResult[] {
    // Parse listings from RSC flight data
    const rscResults = this.parseRscFlightData(html, options);
    if (rscResults.length > 0) return rscResults;

    // Fallback: Parse listing links from HTML
    const htmlResults = this.parseHtmlListings(html, options);
    if (htmlResults.length > 0) return htmlResults;

    // Fallback: JSON-LD
    return this.parseJsonLd(html, options);
  }

  /**
   * Parse React Server Components flight data.
   * AutoScout24 embeds listing data in self.__next_f.push() script blocks.
   * We extract JSON objects containing make/model/price from the decoded chunks.
   */
  private parseRscFlightData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Extract all RSC push chunks
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

    if (fullData.length === 0) {
      console.log("[AutoScout] No RSC flight data found");
      return results;
    }

    // Find listing objects by pattern: objects with "make", "price", "mileage"
    const listingPattern = /"conditionType":"(?:used|new)","consumption"/g;
    const listingStarts: number[] = [];

    let lm;
    while ((lm = listingPattern.exec(fullData)) !== null) {
      let searchStart = Math.max(0, lm.index - 500);
      const substr = fullData.substring(searchStart, lm.index);
      const braceIdx = substr.lastIndexOf("{");
      if (braceIdx >= 0) {
        listingStarts.push(searchStart + braceIdx);
      }
    }

    // Also look for the carousel/promo listings format
    const carouselPattern = /"carouselSlot":"slot-\d+","conditionType"/g;
    let cm;
    while ((cm = carouselPattern.exec(fullData)) !== null) {
      let searchStart = Math.max(0, cm.index - 50);
      const substr = fullData.substring(searchStart, cm.index);
      const braceIdx = substr.lastIndexOf("{");
      if (braceIdx >= 0) {
        listingStarts.push(searchStart + braceIdx);
      }
    }

    console.log(`[AutoScout] Found ${listingStarts.length} potential listings in RSC data`);

    const seenIds = new Set<number>();

    for (const start of listingStarts) {
      let depth = 0;
      let pos = start;
      while (pos < Math.min(fullData.length, start + 5000)) {
        if (fullData[pos] === "{") depth++;
        else if (fullData[pos] === "}") {
          depth--;
          if (depth === 0) break;
        }
        pos++;
      }

      const objStr = fullData.substring(start, pos + 1);
      try {
        const listing = JSON.parse(objStr) as AutoScoutListing;

        if (!listing.price || !listing.id) continue;
        if (seenIds.has(listing.id)) continue;
        seenIds.add(listing.id);

        const priceRappen = Math.round(listing.price * 100);

        if (options?.minPrice && priceRappen < options.minPrice) continue;
        if (options?.maxPrice && priceRappen > options.maxPrice) continue;

        // Build title
        const titleParts: string[] = [];
        if (listing.make?.name) titleParts.push(listing.make.name);
        if (listing.versionFullName) {
          titleParts.push(listing.versionFullName);
        } else if (listing.model?.name) {
          titleParts.push(listing.model.name);
        }
        const title = titleParts.join(" ") || `Listing ${listing.id}`;

        // Build URL
        const makeKey = listing.make?.key || "unknown";
        const modelKey = listing.model?.key || "unknown";
        const slug = listing.versionFullName
          ? listing.versionFullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
          : modelKey;
        const url = `${this.baseUrl}/de/d/${makeKey}-${slug}-${listing.id}`;

        // Image URL
        let imageUrl: string | null = null;
        if (listing.images && listing.images.length > 0) {
          const imgKey = listing.images[0].key;
          imageUrl = `${IMAGE_BASE_URL}/${imgKey}`;
        }

        // Description
        const descParts: string[] = [];
        if (listing.teaser) descParts.push(listing.teaser);
        if (listing.firstRegistrationYear) descParts.push(`EZ: ${listing.firstRegistrationYear}`);
        if (listing.mileage !== undefined) descParts.push(`${listing.mileage.toLocaleString("de-CH")} km`);
        if (listing.horsePower) descParts.push(`${listing.horsePower} PS`);
        if (listing.transmissionTypeGroup) descParts.push(listing.transmissionTypeGroup);
        if (listing.seller?.city) descParts.push(listing.seller.city);

        results.push({
          title: title.substring(0, 200),
          price: priceRappen,
          url,
          imageUrl,
          description: descParts.join(" | ").substring(0, 500) || undefined,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      } catch {
        // JSON parse error — skip
      }
    }

    return results;
  }

  /**
   * Fallback: Parse listing links and prices from HTML
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    const linkRegex = /href="(\/de\/d\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      const start = Math.max(0, linkMatch.index - 500);
      const end = Math.min(html.length, linkMatch.index + 500);
      const context = html.substring(start, end);

      const priceMatch = context.match(/CHF\s*([\d''.,-]+)/);
      let price = 0;
      if (priceMatch) {
        price = Math.round(
          parseFloat(priceMatch[1].replace(/['']/g, "").replace(".–", "").replace(",", ".")) * 100
        );
        if (isNaN(price)) price = 0;
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      const slugMatch = href.match(/\/de\/d\/(.+?)-(\d+)$/);
      const title = slugMatch
        ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Fahrzeug";

      const imgMatch = context.match(/src="(https:\/\/listing-images\.autoscout24\.ch[^"]+)"/i);

      if (price > 0 || title !== "Fahrzeug") {
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

    return results;
  }

  /**
   * Fallback: JSON-LD parsing
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
                priceRaw = typeof offers.price === "number" ? offers.price : parseFloat(String(offers.price));
              }
            }
            const price = Math.round((isNaN(priceRaw) ? 0 : priceRaw) * 100);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = item.url?.startsWith("http") ? item.url : `${this.baseUrl}${item.url || ""}`;
            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;

            results.push({
              title: item.name,
              price,
              url,
              imageUrl,
              platform: this.platform,
              scrapedAt: new Date(),
            });

            if (options?.limit && results.length >= options.limit) break;
          }
        }
      } catch {
        // Skip
      }
    }

    return results;
  }
}
