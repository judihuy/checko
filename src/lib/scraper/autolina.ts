// Autolina.ch Scraper — HTTP-Fetch (kein Cloudflare, kein Puppeteer nötig)
// Schweizer Auto-Plattform mit 100k+ Fahrzeugen.
// Server-Side Rendered (Angular SSR) — HTML enthält alle Listing-Daten direkt.
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

    // Fallback: Allgemeine Suche (alle Autos)
    // Bei reinem Freitext-Query versuchen wir den als Make zu nutzen
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

    return this.parseHtml(html, options);
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

    return this.parseHtml(html, options);
  }

  /**
   * Parse car listings from Autolina SSR HTML.
   *
   * Listing structure (Angular SSR):
   * <app-car-row>
   *   <a href="/auto/{make-model}/{id}">
   *     <img src="https://api.autolina.ch/auto-bild/..." alt="MAKE Model ...">
   *     <div class="make-model">
   *       <span title="MAKE">MAKE</span>
   *       <span title="Model detail">Model detail</span>
   *     </div>
   *     <div class="price"><span>CHF</span><span>XX'XXX</span></div>
   *     <div class="vehicle-data">
   *       <span>2022</span> <span>73'200 km</span> <span>184 PS</span>
   *       <span>Automatik</span> <span>Diesel</span> <span>Grau</span>
   *     </div>
   *     <div class="region-or-title"><span>8000 Zürich / ZH</span></div>
   *   </a>
   * </app-car-row>
   */
  private parseHtml(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Split HTML by car-row components
    const rowSplits = html.split(/<app-car-row\b/);

    // Skip first element (before first car-row)
    for (let i = 1; i < rowSplits.length; i++) {
      const rowHtml = rowSplits[i];
      const endIdx = rowHtml.indexOf("</app-car-row>");
      const block = endIdx > 0 ? rowHtml.substring(0, endIdx) : rowHtml;

      // Extract URL: href="/auto/{slug}/{id}"
      const hrefMatch = block.match(/href="(\/auto\/[^"]+)"/);
      if (!hrefMatch) continue;

      const relUrl = hrefMatch[1];
      const fullUrl = `${this.baseUrl}${relUrl}`;
      if (seenUrls.has(fullUrl)) continue;
      seenUrls.add(fullUrl);

      // Extract make from title attribute on first make-model span
      const makeMatch = block.match(/class="make-model[^"]*"[^>]*>[\s\S]*?<span[^>]*title="([^"]+)"/);
      const make = makeMatch ? this.decodeHtmlEntities(makeMatch[1]) : "";

      // Extract model from second span title in make-model
      // Pattern: after the first title="MAKE" span, find the next span with title
      let model = "";
      if (makeMatch) {
        const afterMake = block.substring(block.indexOf(makeMatch[0]) + makeMatch[0].length);
        const modelMatch = afterMake.match(/<span[^>]*title="([^"]+)"/);
        if (modelMatch) {
          model = this.decodeHtmlEntities(modelMatch[1]);
        }
      }

      // Build title
      const title = [make, model].filter(Boolean).join(" ") || "Fahrzeug";

      // Extract price: look for CHF followed by digits with Swiss formatting (X'XXX)
      let price = 0;
      const priceMatch = block.match(/class="price[^"]*"[\s\S]*?CHF[\s\S]*?>([\d''.,-]+)</);
      if (priceMatch) {
        const priceStr = priceMatch[1]
          .replace(/['']/g, "")  // Remove Swiss thousand separators
          .replace(/\.–$/, "")    // Remove .– suffix
          .replace(",", ".")      // Replace comma decimal
          .trim();
        price = Math.round(parseFloat(priceStr) * 100); // Convert CHF to Rappen
        if (isNaN(price)) price = 0;
      }

      // Price filtering
      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Extract image URL
      let imageUrl: string | null = null;
      const imgMatch = block.match(/src="(https:\/\/api\.autolina\.ch\/auto-bild\/[^"]+)"/);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }

      // Extract vehicle data (year, km, PS, transmission, fuel, color)
      const descParts: string[] = [];

      // Year
      const yearMatch = block.match(/class="vehicle-data[\s\S]*?<span[^>]*class="monospace"[^>]*>((?:19|20)\d{2})<\/span>/);
      let year: number | null = null;
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        descParts.push(`EZ: ${year}`);
      }

      // Year filtering
      if (year !== null) {
        if (options?.yearFrom && year < options.yearFrom) continue;
        if (options?.yearTo && year > options.yearTo) continue;
      }

      // Km: look for pattern like "73'200 km" or "73<span>...</span>200 km"
      const kmMatch = block.match(/vehicle-data[\s\S]*?class="monospace"[^>]*translate="no"[^>]*>([\d''.]+)<[\s\S]*?<span class="small">km<\/span>/);
      if (kmMatch) {
        const kmStr = kmMatch[1].replace(/['']/g, "").replace(/\./g, "");
        descParts.push(`${kmStr} km`);
      }

      // PS
      const psMatch = block.match(/vehicle-data[\s\S]*?class="monospace"[^>]*>(\d+)<\/span>[\s\S]*?<span class="small">PS<\/span>/);
      if (psMatch) {
        descParts.push(`${psMatch[1]} PS`);
      }

      // Extract additional vehicle-data spans (transmission, fuel, color)
      const dataSpanPattern = /class="vehicle-data[\s\S]*?/;
      if (dataSpanPattern.test(block)) {
        // Find transmission/fuel/color from non-monospace spans in vehicle-data
        const vdStart = block.indexOf('class="vehicle-data');
        if (vdStart >= 0) {
          const vdEnd = block.indexOf("</div>", block.indexOf("</div>", vdStart) + 6);
          const vdBlock = block.substring(vdStart, vdEnd > 0 ? vdEnd : vdStart + 2000);

          // Match plain text spans (no monospace class) within vehicle-data items
          const plainSpans = vdBlock.matchAll(/<span[^>]*class="[^"]*ng-tns[^"]*"[^>]*>([^<]+)<\/span>/g);
          for (const sp of plainSpans) {
            const text = sp[1].trim();
            if (text && !text.match(/^\d/) && text !== "km" && text !== "PS" && text.length > 1) {
              descParts.push(text);
            }
          }
        }
      }

      // Extract location
      const locMatch = block.match(/class="region-or-title[\s\S]*?translate="no"[^>]*>([\s\S]*?)<\/span>/);
      if (locMatch) {
        // Clean up the location text (remove inner span tags, normalize whitespace)
        const locText = locMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (locText) descParts.push(locText);
      }

      const description = descParts.join(" | ").substring(0, 500) || undefined;

      results.push({
        title: title.substring(0, 200),
        price,
        url: fullUrl,
        imageUrl,
        description,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }

  /**
   * Decode HTML entities (&amp; &quot; etc.)
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'");
  }
}
