// AutoScout24.ch Scraper — HTTP-Fetch mit Proxy + echten Browser-Headers (primär)
// Proxy: Residential CH über p.webshare.io (Ländercode -ch).
// Parsing-Kette: RSC flight data → HTML listing links → JSON-LD.
// Puppeteer nur als letzter Fallback.
//
// URL-Format:
// - Make/Model: /de/s/mo-{model}/mk-{make}
// - Year: ?fregfrom=X&fregto=Y
// - KM: ?kmfrom=X&kmto=Y
// - Preis: ?pricefrom=X&priceto=Y
// - Treibstoff: ?fuel=B|D|E|H|L
// - Getriebe: ?gear=M|A

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { fetchViaFlareSolverr, isCloudflareChallenge, isFlareSolverrConfigured } from "./flaresolverr";

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
  // Insertionsdatum-Felder (je nach API-Version)
  createdAt?: string;
  publishDate?: string;
  listingCreationDate?: string;
  onlineSince?: string;
}

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";
  isWorking = true;

  /**
   * Formatiert einen Error-Wert zu einem lesbaren String.
   * Verhindert [object Object] in Logs.
   */
  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === "string") {
      return error;
    }
    if (error && typeof error === "object") {
      // Response-like Objekte (status, statusText)
      const obj = error as Record<string, unknown>;
      if ("status" in obj && "statusText" in obj) {
        return `HTTP ${obj.status} ${obj.statusText}`;
      }
      // Allgemeines Objekt: JSON-Serialisierung mit Fallback
      try {
        return JSON.stringify(error).substring(0, 500);
      } catch {
        return `[Objekt: ${Object.keys(obj).join(", ")}]`;
      }
    }
    return String(error);
  }

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

      // Methode 1 (PRIMÄR): HTTP-Fetch mit CH-Proxy + Browser-Headers
      try {
        const httpResults = await this.scrapeViaHttp(searchUrl, options);
        if (httpResults.length > 0) {
          console.log(`[AutoScout] ✅ HTTP-Fetch: ${httpResults.length} Ergebnisse`);
          return httpResults;
        }
      } catch (error) {
        const detail = this.formatError(error);
        console.warn(`[AutoScout] HTTP-Fetch fehlgeschlagen: ${detail}`);
      }

      // Methode 2 (FALLBACK): FlareSolverr (Cloudflare-Bypass)
      if (isFlareSolverrConfigured()) {
        try {
          const flareResults = await this.scrapeViaFlareSolverr(searchUrl, options);
          if (flareResults.length > 0) {
            console.log(`[AutoScout] ✅ FlareSolverr-Fallback: ${flareResults.length} Ergebnisse`);
            return flareResults;
          }
        } catch (error) {
          const detail = this.formatError(error);
          console.warn(`[AutoScout] FlareSolverr-Fallback fehlgeschlagen: ${detail}`);
        }
      }

      // Methode 3 (LETZTER FALLBACK): Puppeteer + Stealth + CH Proxy
      try {
        const browserResults = await this.scrapeViaBrowser(searchUrl, options);
        if (browserResults.length > 0) {
          console.log(`[AutoScout] ✅ Browser-Fallback: ${browserResults.length} Ergebnisse`);
          return browserResults;
        }
      } catch (error) {
        const detail = this.formatError(error);
        console.warn(`[AutoScout] Browser-Fallback fehlgeschlagen: ${detail}`);
      }

      console.warn(`[AutoScout] ⚠️ Keine Ergebnisse`);
      return [];
    } catch (error) {
      const detail = this.formatError(error);
      console.error(`[AutoScout] Scraper-Fehler: ${detail}`);
      return [];
    }
  }

  /**
   * AutoScout24 per FlareSolverr scrapen (Cloudflare-Bypass).
   * Wird als Fallback genutzt wenn HTTP-Fetch 403/Cloudflare erhält.
   */
  private async scrapeViaFlareSolverr(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.log(`[AutoScout] FlareSolverr URL: ${searchUrl}`);

    const html = await fetchViaFlareSolverr(searchUrl, this.platform);

    if (html.length < 5000) {
      console.warn(`[AutoScout] ⚠️ Sehr kurze FlareSolverr-Antwort (${html.length} bytes)`);
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[AutoScout] ⚠️ Cloudflare-Challenge trotz FlareSolverr");
      return [];
    }

    return this.parseAllFormats(html, options);
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
   * PRIMÄR: Seite per HTTP-Fetch mit CH-Proxy + Browser-Headers laden.
   */
  private async scrapeViaHttp(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    console.log(`[AutoScout] HTTP-Fetch URL: ${searchUrl}`);

    // CH-Proxy mit echten Browser-Headers (wie eBay KA Ansatz)
    const response = await this.fetchWithCountryHeaders(searchUrl, "ch");

    if (!response.ok) {
      // Bei 403/503 Cloudflare → Exception werfen, damit FlareSolverr-Fallback greift
      if (isCloudflareChallenge(response.status)) {
        throw new Error(`Cloudflare-Challenge erkannt (HTTP ${response.status})`);
      }
      let bodySnippet = "";
      try {
        const text = await response.text();
        bodySnippet = text.substring(0, 200).replace(/\s+/g, " ").trim();
      } catch { /* body nicht lesbar */ }
      console.error(
        `[AutoScout] HTTP ${response.status} ${response.statusText || ""}` +
        (bodySnippet ? ` — Body: ${bodySnippet}` : "")
      );
      return [];
    }

    const html = await response.text();
    console.log(`[AutoScout] HTML length: ${html.length}`);

    if (html.length < 5000) {
      console.warn(`[AutoScout] ⚠️ Sehr kurze Antwort`);
      return [];
    }

    if (isCloudflareChallenge(200, html)) {
      throw new Error("Cloudflare-Challenge im HTML erkannt");
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

        // Insertionsdatum extrahieren
        let listedAt: Date | null = null;
        const dateStr = listing.onlineSince || listing.publishDate || listing.listingCreationDate || listing.createdAt;
        if (dateStr) {
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) listedAt = parsed;
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
          listedAt,
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
