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
import { parseSwissPrice, parseSwissPriceRappen } from "./price-utils";

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
   * Parse all formats and merge: RSC (base) + JSON-LD (prices) + HTML (images).
   *
   * RSC flight data provides good structural data (titles, URLs, descriptions)
   * but often has price=0. JSON-LD reliably provides correct prices. HTML/srcset
   * provides images when RSC has none.
   *
   * Strategy:
   * 1. Parse RSC (allow price=0 listings through)
   * 2. Always parse JSON-LD for price enrichment
   * 3. Merge JSON-LD prices into RSC results where price=0
   * 4. Enrich missing images from HTML/srcset
   * 5. Apply price filters after enrichment
   * 6. If RSC found nothing, fall back to JSON-LD → HTML
   */
  private parseAllFormats(html: string, options?: ScraperOptions): ScraperResult[] {
    // Step 1: Parse RSC (with relaxed price filtering — allow price=0 through)
    const optionsNoPrice = { ...options, minPrice: undefined, maxPrice: undefined };
    const rscResults = this.parseRscFlightData(html, optionsNoPrice);

    // Step 2: Always parse JSON-LD for price data
    const jsonLdResults = this.parseJsonLd(html, optionsNoPrice);

    if (rscResults.length > 0) {
      // Build lookup maps from JSON-LD by URL and by listing ID
      const jsonLdByUrl = new Map<string, ScraperResult>();
      const jsonLdById = new Map<string, ScraperResult>();
      for (const jr of jsonLdResults) {
        jsonLdByUrl.set(jr.url, jr);
        // Extract listing ID from URL (last numeric segment)
        const idMatch = jr.url.match(/(\d+)\/?$/);
        if (idMatch) jsonLdById.set(idMatch[1], jr);
      }

      // Step 3: Enrich RSC results with JSON-LD prices
      let enrichedPrices = 0;
      let enrichedImages = 0;
      for (const rsc of rscResults) {
        // Match by URL or listing ID
        const idMatch = rsc.url.match(/-(\d+)$/);
        const jsonLd = jsonLdByUrl.get(rsc.url)
          || (idMatch ? jsonLdById.get(idMatch[1]) : undefined);

        // Enrich price if RSC has 0 but JSON-LD has a real price
        if (rsc.price === 0 && jsonLd && jsonLd.price > 0) {
          rsc.price = jsonLd.price;
          enrichedPrices++;
        }

        // Enrich image if RSC has none but JSON-LD has one
        if (!rsc.imageUrl && jsonLd?.imageUrl) {
          rsc.imageUrl = jsonLd.imageUrl;
          enrichedImages++;
        }
      }

      // Step 4: Enrich missing images from HTML/srcset
      const rscMissingImages = rscResults.filter(r => !r.imageUrl);
      if (rscMissingImages.length > 0) {
        const htmlResults = this.parseHtmlListings(html, optionsNoPrice);
        const htmlByUrl = new Map<string, ScraperResult>();
        const htmlById = new Map<string, ScraperResult>();
        for (const hr of htmlResults) {
          htmlByUrl.set(hr.url, hr);
          const idM = hr.url.match(/(\d+)\/?$/);
          if (idM) htmlById.set(idM[1], hr);
        }

        for (const rsc of rscMissingImages) {
          const idMatch = rsc.url.match(/-(\d+)$/);
          const htmlMatch = htmlByUrl.get(rsc.url)
            || (idMatch ? htmlById.get(idMatch[1]) : undefined);
          if (htmlMatch?.imageUrl) {
            rsc.imageUrl = htmlMatch.imageUrl;
            enrichedImages++;
          }
        }
      }

      if (enrichedPrices > 0 || enrichedImages > 0) {
        console.log(`[AutoScout] Enrichment: ${enrichedPrices} prices from JSON-LD, ${enrichedImages} images from JSON-LD/HTML`);
      }

      // Step 5: Apply price filters after enrichment
      let results = rscResults;
      if (options?.minPrice || options?.maxPrice) {
        results = results.filter(r => {
          if (options.minPrice && r.price < options.minPrice) return false;
          if (options.maxPrice && r.price > options.maxPrice) return false;
          return true;
        });
      }

      if (results.length > 0) return results;
    }

    // Fallback: if RSC found nothing, use JSON-LD results (with price filters)
    if (jsonLdResults.length > 0) {
      let results = jsonLdResults;
      if (options?.minPrice || options?.maxPrice) {
        results = results.filter(r => {
          if (options.minPrice && r.price < options.minPrice) return false;
          if (options.maxPrice && r.price > options.maxPrice) return false;
          return true;
        });
      }
      if (results.length > 0) return results;
    }

    // Last fallback: HTML parsing
    return this.parseHtmlListings(html, options);
  }

  /**
   * Parse React Server Components flight data.
   * AutoScout24 embeds listing data in self.__next_f.push() script blocks.
   * The listings are in a "topVehicles.content" array within the decoded RSC chunks.
   * We also look for individual listing objects with conditionType+firstRegistrationYear.
   */
  /**
   * Extract and decode all RSC flight data chunks from HTML.
   * Handles both single-escaped (\"...\") and double-escaped (\\"...\\") chunks.
   */
  private extractRscData(html: string): string {
    let fullData = "";

    // Pattern 1: Standard RSC chunks with single-escaped strings
    const chunkPattern = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let chunkMatch;
    while ((chunkMatch = chunkPattern.exec(html)) !== null) {
      try {
        const unescaped = JSON.parse(`"${chunkMatch[1]}"`);
        fullData += unescaped;
      } catch {
        // Skip malformed chunks
      }
    }

    // Pattern 2: Chunks with double-escaped content (\\" instead of \")
    // These are NOT captured by Pattern 1 because \\" causes the regex to break
    // at the first \\", treating \\ as an escape and " as the string end.
    // We find these by looking for push calls near data we care about.
    const doubleEscPattern = /self\.__next_f\.push\(\[1,"/g;
    let deMatch;
    while ((deMatch = doubleEscPattern.exec(html)) !== null) {
      const contentStart = deMatch.index + deMatch[0].length;
      // Check if this chunk uses double-escaping (first few chars contain \\")
      const peek = html.substring(contentStart, contentStart + 100);
      if (!peek.includes('\\\\"')) continue; // not double-escaped

      // Extract the full string content by finding the closing "]\)
      // The string ends with "]) but we need to handle the escaping
      let pos = contentStart;
      while (pos < html.length) {
        if (html[pos] === '"' && html.substring(pos).startsWith('"]')) {
          // Check this isn't an escaped quote: look back for odd number of backslashes
          let backslashes = 0;
          let bp = pos - 1;
          while (bp >= contentStart && html[bp] === '\\') {
            backslashes++;
            bp--;
          }
          if (backslashes % 2 === 0) {
            // Even number of backslashes (including 0) = real end of string
            break;
          }
        }
        pos++;
      }

      const rawContent = html.substring(contentStart, pos);
      if (rawContent.length < 50) continue; // too short

      try {
        // First unescape: HTML-level escaping → JS string
        const firstPass = JSON.parse(`"${rawContent}"`);
        fullData += firstPass;
      } catch {
        // Try without JSON.parse: manual unescape of \\" → " and \\\\ → \\
        try {
          const manual = rawContent
            .replace(/\\\\/g, '\\')
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t');
          fullData += manual;
        } catch {
          // Skip
        }
      }
    }

    return fullData;
  }

  private parseRscFlightData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const fullData = this.extractRscData(html);

    if (fullData.length === 0) {
      console.log("[AutoScout] No RSC flight data found");
      return results;
    }

    console.log(`[AutoScout] RSC data extracted: ${fullData.length} chars`);

    // Strategy 1: Extract topVehicles.content array (promoted/carousel listings)
    // Use bracket balancing instead of regex for the array — it contains nested objects
    const tvContentIdx = fullData.indexOf('"topVehicles":{"content":[{');
    if (tvContentIdx >= 0) {
      const arrStart = fullData.indexOf("[", tvContentIdx + '"topVehicles":{"content":'.length);
      if (arrStart >= 0) {
        let depth = 0;
        let pos = arrStart;
        while (pos < fullData.length) {
          if (fullData[pos] === "[") depth++;
          else if (fullData[pos] === "]") {
            depth--;
            if (depth === 0) break;
          }
          pos++;
        }
        const arrStr = fullData.substring(arrStart, pos + 1);
        try {
          const listings = JSON.parse(arrStr) as AutoScoutListing[];
          console.log(`[AutoScout] Found ${listings.length} listings in topVehicles.content`);
          for (const listing of listings) {
            const result = this.rscListingToResult(listing, options);
            if (result) results.push(result);
            if (options?.limit && results.length >= options.limit) return results;
          }
        } catch {
          console.log("[AutoScout] Failed to parse topVehicles.content array");
        }
      }
    }

    // Strategy 2: Find individual listing objects by pattern
    // AutoScout listings have "conditionType":"used|new" followed by "firstRegistrationYear"
    const listingPattern = /"conditionType":"(?:used|new)","firstRegistrationYear"/g;
    const listingStarts: number[] = [];

    let lm;
    while ((lm = listingPattern.exec(fullData)) !== null) {
      const searchStart = Math.max(0, lm.index - 500);
      const substr = fullData.substring(searchStart, lm.index);
      const braceIdx = substr.lastIndexOf("{");
      if (braceIdx >= 0) {
        listingStarts.push(searchStart + braceIdx);
      }
    }

    // Also look for carousel listings where carouselSlot comes before conditionType
    const carouselPattern = /"carouselSlot":(?:"slot-\d+"|null),"conditionType"/g;
    let cm;
    while ((cm = carouselPattern.exec(fullData)) !== null) {
      const searchStart = Math.max(0, cm.index - 50);
      const substr = fullData.substring(searchStart, cm.index);
      const braceIdx = substr.lastIndexOf("{");
      if (braceIdx >= 0) {
        listingStarts.push(searchStart + braceIdx);
      }
    }

    if (listingStarts.length > 0) {
      console.log(`[AutoScout] Found ${listingStarts.length} additional listing candidates in RSC data`);
    }

    const seenIds = new Set<number>(results.map(r => {
      const idMatch = r.url.match(/-(\d+)$/);
      return idMatch ? parseInt(idMatch[1]) : 0;
    }));

    for (const start of listingStarts) {
      let depth = 0;
      let pos = start;
      while (pos < Math.min(fullData.length, start + 10000)) {
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
        if (!listing.id || seenIds.has(listing.id)) continue;
        seenIds.add(listing.id);

        const result = this.rscListingToResult(listing, options);
        if (result) results.push(result);
        if (options?.limit && results.length >= options.limit) break;
      } catch {
        // JSON parse error — skip
      }
    }

    return results;
  }

  /**
   * Convert a single RSC listing object to a ScraperResult.
   * Returns null if the listing should be filtered out.
   */
  private rscListingToResult(listing: AutoScoutListing, options?: ScraperOptions): ScraperResult | null {
    if (!listing.id) return null;

    const priceRappen = listing.price ? Math.round(listing.price * 100) : 0;

    // Price filters are applied after enrichment in parseAllFormats(),
    // but if caller passes them, respect them (for non-enrichment paths)
    if (options?.minPrice && priceRappen > 0 && priceRappen < options.minPrice) return null;
    if (options?.maxPrice && priceRappen > 0 && priceRappen > options.maxPrice) return null;

    // Year filter: respect yearFrom/yearTo from options
    if (listing.firstRegistrationYear) {
      if (options?.yearFrom && listing.firstRegistrationYear < options.yearFrom) return null;
      if (options?.yearTo && listing.firstRegistrationYear > options.yearTo) return null;
    }

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
    const slug = listing.versionFullName
      ? listing.versionFullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
      : listing.model?.key || "unknown";
    const url = `${this.baseUrl}/de/d/${makeKey}-${slug}-${listing.id}`;

    // Image URL — use first image with proper size parameter
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

    return {
      title: title.substring(0, 200),
      price: priceRappen,
      url,
      imageUrl,
      description: descParts.join(" | ").substring(0, 500) || undefined,
      platform: this.platform,
      scrapedAt: new Date(),
      listedAt,
    };
  }

  /**
   * Fallback: Parse listing links and prices from HTML.
   * AutoScout24 renders prices as "CHF&nbsp;33'900.–" with HTML entities.
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

      // Use wider context for better matching (prices may not be immediately adjacent)
      const start = Math.max(0, linkMatch.index - 2000);
      const end = Math.min(html.length, linkMatch.index + 2000);
      const context = html.substring(start, end);

      // Price parsing: handles CHF&nbsp;33'900.– and CHF 33'900.– and CHF\xa033'900.–
      // Also handles right single quote U+2019 (') as thousands separator
      const priceMatch = context.match(/CHF(?:&nbsp;|\s|\u00a0)\s*([\d'''.,-]+)/);
      let price = 0;
      if (priceMatch) {
        price = parseSwissPriceRappen(priceMatch[1]);
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Extract title from slug
      const slugMatch = href.match(/\/de\/d\/(.+?)-(\d+)$/);
      const title = slugMatch
        ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Fahrzeug";

      // Extract listing ID from URL for matching image
      const listingId = slugMatch ? slugMatch[2] : null;

      // Image: prefer image matching this listing's ID
      let imageUrl: string | null = null;

      // Strategy 1: src attribute with listing ID
      if (listingId) {
        const specificImgMatch = context.match(
          new RegExp(`src="(https://listing-images\\.autoscout24\\.ch/[^"]*/${listingId}/[^"]+)"`, "i")
        );
        if (specificImgMatch) {
          imageUrl = specificImgMatch[1].replace(/&amp;/g, "&");
        }
      }

      // Strategy 2: srcset attribute (AutoScout often uses srcset instead of src)
      if (!imageUrl) {
        // Match srcset with listing-images domain; pick the first URL from the srcset
        const srcsetMatch = context.match(/srcset="([^"]*listing-images\.autoscout24\.ch[^"]*)"/i);
        if (srcsetMatch) {
          // srcset format: "url1 width1, url2 width2, ..." — take first URL
          const srcsetValue = srcsetMatch[1].replace(/&amp;/g, "&");
          const firstEntry = srcsetValue.split(",")[0].trim();
          const srcsetUrl = firstEntry.split(/\s+/)[0];
          if (srcsetUrl && srcsetUrl.startsWith("http")) {
            // Normalize to a reasonable size (400px width)
            const url = new URL(srcsetUrl);
            url.searchParams.set("w", "400");
            imageUrl = url.toString();
          }
        }
      }

      // Strategy 3: any listing image src nearby
      if (!imageUrl) {
        const imgMatch = context.match(/src="(https:\/\/listing-images\.autoscout24\.ch[^"]+)"/i);
        if (imgMatch) {
          imageUrl = imgMatch[1].replace(/&amp;/g, "&");
        }
      }

      if (price > 0 || title !== "Fahrzeug") {
        results.push({
          title: title.substring(0, 200),
          price,
          url: `${this.baseUrl}${href}`,
          imageUrl,
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
   * Handles both ItemList (search results) and individual Product/Car entries.
   * AutoScout24 embeds JSON-LD with "price": 94900 (CHF, not Rappen).
   */
  private parseJsonLd(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    const jsonLdMatches = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);
        // Handle @graph arrays, plain arrays, and single objects
        const items: Record<string, unknown>[] = Array.isArray(jsonData)
          ? jsonData
          : jsonData?.["@graph"]
            ? (Array.isArray(jsonData["@graph"]) ? jsonData["@graph"] : [jsonData["@graph"]])
            : [jsonData];

        for (const item of items) {
          // Process ItemList entries
          if (item?.["@type"] === "ItemList" && Array.isArray(item?.itemListElement)) {
            for (const entry of (item.itemListElement as Record<string, unknown>[])) {
              const listItem = (entry?.item || entry) as Record<string, unknown>;
              const result = this.jsonLdItemToResult(listItem, options, seenUrls);
              if (result) {
                results.push(result);
                if (options?.limit && results.length >= options.limit) return results;
              }
            }
            continue;
          }

          // Process individual Product/Car/Vehicle items or anything with name+offers/price
          const itemType = item?.["@type"];
          if (
            itemType === "Product" ||
            itemType === "Car" ||
            itemType === "Vehicle" ||
            itemType === "IndividualProduct" ||
            (item?.name && (item?.offers || item?.price))
          ) {
            const result = this.jsonLdItemToResult(item, options, seenUrls);
            if (result) {
              results.push(result);
              if (options?.limit && results.length >= options.limit) return results;
            }
          }
        }
      } catch {
        // Skip malformed JSON-LD
      }
    }

    if (results.length > 0) {
      console.log(`[AutoScout] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Convert a single JSON-LD item to ScraperResult.
   * Handles price extraction from offers.price (number or string).
   */
  private jsonLdItemToResult(
    item: Record<string, unknown>,
    options?: ScraperOptions,
    seenUrls?: Set<string>
  ): ScraperResult | null {
    if (!item?.name) return null;

    // Extract price from offers or direct price field
    let priceRaw = 0;
    if (item.offers) {
      const offersData = item.offers as Record<string, unknown> | Record<string, unknown>[];
      const offers: Record<string, unknown> = Array.isArray(offersData) ? offersData[0] : offersData;
      if (offers) {
        const val = offers.price ?? offers.lowPrice;
        priceRaw = parseSwissPrice(val as string | number);
      }
    } else {
      priceRaw = parseSwissPrice(item.price as string | number);
    }

    const price = parseSwissPriceRappen(priceRaw || 0);

    if (price > 0) {
      if (options?.minPrice && price < options.minPrice) return null;
      if (options?.maxPrice && price > options.maxPrice) return null;
    }

    const rawUrl = (item.url as string) || "";
    const url = rawUrl.startsWith("http") ? rawUrl : `${this.baseUrl}${rawUrl}`;

    if (seenUrls) {
      if (seenUrls.has(url)) return null;
      seenUrls.add(url);
    }

    // Image extraction
    let imageUrl: string | null = null;
    if (typeof item.image === "string") {
      imageUrl = item.image as string;
    } else if (Array.isArray(item.image) && typeof (item.image as string[])[0] === "string") {
      imageUrl = (item.image as string[])[0];
    } else if (item.image && typeof item.image === "object" && !Array.isArray(item.image)) {
      const imgObj = item.image as Record<string, unknown>;
      if (typeof imgObj.url === "string") imageUrl = imgObj.url as string;
    }

    const description = typeof item.description === "string"
      ? (item.description as string).substring(0, 500)
      : undefined;

    return {
      title: (item.name as string).substring(0, 200),
      price,
      url,
      imageUrl,
      description,
      platform: this.platform,
      scrapedAt: new Date(),
    };
  }
}
