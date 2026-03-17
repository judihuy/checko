// Autolina.ch Scraper — HTTP-Fetch + SS_Requests JSON Parsing
// Schweizer Auto-Plattform mit 100k+ Fahrzeugen.
// Daten sind als JSON in window.SS_Requests[...] im HTML embedded.
// Kein DOM-Parsing nötig — direkt das JSON parsen.
//
// URL-Format:
// - Make only: https://www.autolina.ch/{make}
// - Make + Model: https://www.autolina.ch/{make}/{model}
// - Pagination: https://www.autolina.ch/{make}/{model}/page/{n}
// - Allgemein: https://www.autolina.ch/auto-kaufen  (alle Autos)
//
// Hinweis: Query-Params (price_from, price_to, year_from, year_to) werden
// nur client-seitig verarbeitet. SSR filtert nur über URL-Pfad (make/model).
// Preis-/Jahresfilterung erfolgt in-code nach dem Parsing.

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

/** Shape of a single car entry in the SS_Requests JSON */
interface AutolinaCar {
  carId: number;
  makeId: number;
  modelId: number;
  modelType: string;             // e.g. "3er Reihe G21 Touring 330e SAG"
  makeName: string;              // e.g. "BMW"
  modelName: string;             // e.g. "3ER REIHE G21"
  makeSlug: string;              // e.g. "bmw"
  modelSlug: string;             // e.g. "3er-reihe-g21"
  slug: string;                  // e.g. "bmw-3er-reihe-g21"
  firstRegDate: { date: string } | null;  // { date: "2022-05-01 00:00:00.000000", ... }
  mileage: number;               // km
  price: number;                 // CHF (whole units, not Rappen)
  powerOutput: number;           // PS
  pics: string[];                // array of image URLs
  fuelType: number | null;       // numeric ID (1501=Benzin, 1502=Diesel, 1507=Hybrid, etc.)
  gearboxType: number | null;    // numeric ID (1201=Automatik, 1202=Manuell)
  region: string;
  city: string;
  postalCode: string;
  isPremium: boolean;
}

/** Map Autolina fuel type IDs to human-readable strings */
const FUEL_TYPE_MAP: Record<number, string> = {
  1501: "Benzin",
  1502: "Diesel",
  1503: "Elektro",
  1504: "Erdgas (CNG)",
  1505: "Ethanol",
  1506: "Wasserstoff",
  1507: "Hybrid",
  1508: "LPG",
  1509: "Plug-in-Hybrid",
};

/** Map Autolina gearbox type IDs to human-readable strings */
const GEARBOX_TYPE_MAP: Record<number, string> = {
  1201: "Automatik",
  1202: "Manuell",
  1203: "Halbautomatik",
};

export class AutolinaScraper extends BaseScraper {
  readonly platform = "autolina";
  readonly displayName = "Autolina.ch";
  readonly baseUrl = "https://www.autolina.ch";
  isWorking = true;

  /**
   * Build search URL from query and options.
   * Autolina SSR filtert nur per URL-Pfad: /{make} oder /{make}/{model}
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    if (options?.vehicleMake) {
      const make = options.vehicleMake.toLowerCase().replace(/\s+/g, "-");
      if (options.vehicleModel) {
        const model = options.vehicleModel.toLowerCase().replace(/\s+/g, "-");
        return `${this.baseUrl}/${encodeURIComponent(make)}/${encodeURIComponent(model)}`;
      }
      return `${this.baseUrl}/${encodeURIComponent(make)}`;
    }

    // Fallback: Freitext-Query als Make/Model nutzen
    if (query && query.trim()) {
      const parts = query.trim().split(/\s+/);
      if (parts.length >= 2) {
        const make = parts[0].toLowerCase().replace(/\s+/g, "-");
        const model = parts.slice(1).join("-").toLowerCase().replace(/\s+/g, "-");
        return `${this.baseUrl}/${encodeURIComponent(make)}/${encodeURIComponent(model)}`;
      }
      if (parts.length === 1) {
        return `${this.baseUrl}/${encodeURIComponent(parts[0].toLowerCase())}`;
      }
    }

    return `${this.baseUrl}/auto-kaufen`;
  }

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    try {
      const searchUrl = this.buildSearchUrl(query, options);
      console.log(`[Autolina] Search URL: ${searchUrl}`);

      // PRIMÄR: Direkter HTTP-Fetch (kein Cloudflare, kein Proxy nötig)
      try {
        const results = await this.scrapeViaHttp(searchUrl, options);
        if (results.length > 0) {
          console.log(`[Autolina] ✅ HTTP-Fetch: ${results.length} Ergebnisse`);
          return results;
        }
        console.warn(`[Autolina] ⚠️ HTTP-Fetch: 0 Ergebnisse`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[Autolina] HTTP-Fetch fehlgeschlagen: ${msg}`);
      }

      // FALLBACK: Mit Proxy versuchen (falls direkter Zugang blockiert wird)
      try {
        const proxyResults = await this.scrapeViaProxy(searchUrl, options);
        if (proxyResults.length > 0) {
          console.log(`[Autolina] ✅ Proxy-Fetch: ${proxyResults.length} Ergebnisse`);
          return proxyResults;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[Autolina] Proxy-Fetch fehlgeschlagen: ${msg}`);
      }

      console.warn(`[Autolina] ⚠️ Keine Ergebnisse`);
      return [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Autolina] Scraper-Fehler: ${msg}`);
      return [];
    }
  }

  /**
   * Direkter HTTP-Fetch ohne Proxy (Autolina hat kein Cloudflare).
   */
  private async scrapeViaHttp(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const response = await this.fetchWithHeaders(searchUrl);

    if (!response.ok) {
      console.error(`[Autolina] HTTP ${response.status} ${response.statusText || ""}`);
      return [];
    }

    const html = await response.text();
    console.log(`[Autolina] HTML length: ${html.length}`);

    if (html.length < 3000) {
      console.warn(`[Autolina] ⚠️ Sehr kurze Antwort`);
      return [];
    }

    return this.parseSSRequestsJson(html, options);
  }

  /**
   * Fallback: HTTP-Fetch mit CH-Proxy.
   */
  private async scrapeViaProxy(searchUrl: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const response = await this.fetchWithCountryHeaders(searchUrl, "ch");

    if (!response.ok) {
      console.error(`[Autolina] Proxy HTTP ${response.status} ${response.statusText || ""}`);
      return [];
    }

    const html = await response.text();
    console.log(`[Autolina] Proxy HTML length: ${html.length}`);

    if (html.length < 3000) {
      return [];
    }

    return this.parseSSRequestsJson(html, options);
  }

  /**
   * Extract all window.SS_Requests[...] JSON blocks from HTML,
   * find the one containing the "searchcars" URL with data.cars array,
   * and parse car listings from it.
   */
  private parseSSRequestsJson(html: string, options?: ScraperOptions): ScraperResult[] {
    // Extract all SS_Requests blocks: window.SS_Requests[`...`] = {...};
    // The key is a backtick-quoted JSON string, the value is a JSON object.
    const blocks = this.extractSSRequestBlocks(html);

    if (blocks.length === 0) {
      console.warn(`[Autolina] ⚠️ Keine SS_Requests Blöcke gefunden`);
      return [];
    }

    console.log(`[Autolina] ${blocks.length} SS_Requests Blöcke gefunden`);

    // Find the block with "searchcars" URL that contains data.cars
    for (const { key, value } of blocks) {
      try {
        const keyObj = JSON.parse(key);
        if (keyObj.url !== "searchcars") continue;
      } catch {
        // Key contains "searchcars" as string? Check plaintext
        if (!key.includes("searchcars")) continue;
      }

      try {
        const parsed = JSON.parse(value);
        if (parsed?.status === 1 && parsed?.data?.cars && Array.isArray(parsed.data.cars)) {
          const cars: AutolinaCar[] = parsed.data.cars;
          const totalCount = parsed.data.count;
          console.log(`[Autolina] searchcars Block gefunden: ${cars.length} Autos (total: ${totalCount})`);
          return this.carsToResults(cars, options);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[Autolina] searchcars JSON parse error: ${msg}`);
      }
    }

    console.warn(`[Autolina] ⚠️ Kein searchcars Block mit cars-Array gefunden`);
    return [];
  }

  /**
   * Extract all window.SS_Requests[`key`] = value blocks from HTML.
   * Returns array of { key, value } where both are raw JSON strings.
   */
  private extractSSRequestBlocks(html: string): Array<{ key: string; value: string }> {
    const blocks: Array<{ key: string; value: string }> = [];

    // Pattern: window.SS_Requests[`...`] = ...;
    // We use indexOf-based parsing since regex can't reliably handle nested JSON
    const marker = "window.SS_Requests[`";
    let searchFrom = 0;

    while (true) {
      const startIdx = html.indexOf(marker, searchFrom);
      if (startIdx === -1) break;

      // Extract the key (between backticks)
      const keyStart = startIdx + marker.length;
      const keyEnd = html.indexOf("`]", keyStart);
      if (keyEnd === -1) {
        searchFrom = keyStart;
        continue;
      }

      const key = html.substring(keyStart, keyEnd);

      // After `] = ` comes the JSON value
      const eqIdx = html.indexOf("=", keyEnd + 2);
      if (eqIdx === -1) {
        searchFrom = keyEnd;
        continue;
      }

      // Find start of JSON value (skip whitespace after =)
      let valueStart = eqIdx + 1;
      while (valueStart < html.length && html[valueStart] === " ") valueStart++;

      if (valueStart >= html.length) break;

      // Balance braces to find end of JSON object/array
      const firstChar = html[valueStart];
      if (firstChar !== "{" && firstChar !== "[" && firstChar !== '"') {
        // Not a JSON value we can parse, skip
        searchFrom = valueStart;
        continue;
      }

      let value: string;
      if (firstChar === "{" || firstChar === "[") {
        const closingChar = firstChar === "{" ? "}" : "]";
        let depth = 0;
        let inString = false;
        let escaped = false;
        let i = valueStart;

        while (i < html.length) {
          const ch = html[i];
          if (escaped) {
            escaped = false;
            i++;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            i++;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
          } else if (!inString) {
            if (ch === firstChar) depth++;
            else if (ch === closingChar) {
              depth--;
              if (depth === 0) break;
            }
          }
          i++;
        }
        value = html.substring(valueStart, i + 1);
      } else {
        // Quoted string value
        const strEnd = html.indexOf('"', valueStart + 1);
        value = strEnd >= 0 ? html.substring(valueStart, strEnd + 1) : "";
      }

      if (value) {
        blocks.push({ key, value });
      }

      searchFrom = valueStart + value.length;
    }

    return blocks;
  }

  /**
   * Convert Autolina car JSON objects to ScraperResult array.
   */
  private carsToResults(cars: AutolinaCar[], options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenIds = new Set<number>();

    for (const car of cars) {
      if (seenIds.has(car.carId)) continue;
      seenIds.add(car.carId);

      // Price: Autolina gives CHF, we need Rappen (cents)
      const priceRappen = Math.round((car.price || 0) * 100);

      // Price filtering
      if (priceRappen > 0) {
        if (options?.minPrice && priceRappen < options.minPrice) continue;
        if (options?.maxPrice && priceRappen > options.maxPrice) continue;
      }

      // Year from firstRegDate
      let year: number | null = null;
      if (car.firstRegDate?.date) {
        const yearMatch = car.firstRegDate.date.match(/^(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1], 10);
        }
      }

      // Year filtering
      if (year !== null) {
        if (options?.yearFrom && year < options.yearFrom) continue;
        if (options?.yearTo && year > options.yearTo) continue;
      }

      // Build title: "MAKE modelType" or "MAKE MODEL"
      const title = [car.makeName, car.modelType || car.modelName]
        .filter(Boolean)
        .join(" ")
        .substring(0, 200) || "Fahrzeug";

      // Build URL: https://www.autolina.ch/auto/{slug}/{carId}
      const slug = car.slug || `${car.makeSlug}-${car.modelSlug}`;
      const url = `${this.baseUrl}/auto/${slug}/${car.carId}`;

      // Image: first pic
      const imageUrl = car.pics && car.pics.length > 0 ? car.pics[0] : null;

      // Build description parts
      const descParts: string[] = [];
      if (year) descParts.push(`EZ: ${year}`);
      if (car.mileage) descParts.push(`${car.mileage.toLocaleString("de-CH")} km`);
      if (car.powerOutput) descParts.push(`${car.powerOutput} PS`);

      const fuelStr = car.fuelType ? FUEL_TYPE_MAP[car.fuelType] : null;
      if (fuelStr) descParts.push(fuelStr);

      const gearStr = car.gearboxType ? GEARBOX_TYPE_MAP[car.gearboxType] : null;
      if (gearStr) descParts.push(gearStr);

      if (car.city && car.postalCode) {
        descParts.push(`${car.postalCode} ${car.city}`);
      } else if (car.city) {
        descParts.push(car.city);
      } else if (car.region) {
        descParts.push(car.region);
      }

      const description = descParts.join(" | ").substring(0, 500) || undefined;

      results.push({
        title,
        price: priceRappen,
        url,
        imageUrl,
        description,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
