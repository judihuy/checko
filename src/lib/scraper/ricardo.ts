// Ricardo.ch Scraper
// Nutzt Puppeteer (headless Browser) OHNE Proxy (Proxy wird blockiert)
// Primäre Parse-Methode: JSON-LD (schema.org ItemList)
// Fallback: HTML-Pattern-Matching

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class RicardoScraper extends BaseScraper {
  readonly platform = "ricardo";
  readonly displayName = "Ricardo.ch";
  readonly baseUrl = "https://www.ricardo.ch";
  isWorking = true;

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    // Enrich query with vehicle make/model if available
    let enrichedQuery = query;
    if (options?.vehicleMake) {
      enrichedQuery = options.vehicleMake;
      if (options.vehicleModel) enrichedQuery += " " + options.vehicleModel;
      if (query && query !== enrichedQuery && !enrichedQuery.toLowerCase().includes(query.toLowerCase())) {
        enrichedQuery += " " + query;
      }
    }

    try {
      const encodedQuery = encodeURIComponent(enrichedQuery);
      const searchUrl = `${this.baseUrl}/de/s/${encodedQuery}`;

      console.log(`[Ricardo] Search URL: ${searchUrl}`);

      // Browser OHNE Proxy — Ricardo blockiert den Webshare-Proxy nicht,
      // aber die Seite funktioniert auch ohne Proxy gut
      let html: string;
      try {
        html = await this.fetchWithBrowserNoProxy(searchUrl);
      } catch (browserError) {
        console.warn(`[Ricardo] Browser failed, trying with proxy:`, browserError);
        try {
          html = await this.fetchWithBrowser(searchUrl);
        } catch (proxyError) {
          console.warn(`[Ricardo] Proxy browser also failed, falling back to HTTP:`, proxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Ricardo.ch: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Ricardo] HTML length: ${html.length}`);

      // Prüfe ob blockiert
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Ricardo] ⚠️ Cloudflare-Challenge erkannt — Scraping blockiert.");
        return results;
      }

      if (html.length < 1000) {
        console.warn(`[Ricardo] ⚠️ Sehr kurze Antwort (${html.length} Bytes) — wahrscheinlich Bot-Schutz`);
        return results;
      }

      // Methode 1 (PRIMÄR): JSON-LD schema.org ItemList
      const jsonLdResults = this.parseJsonLd(html, options);
      if (jsonLdResults.length > 0) {
        console.log(`[Ricardo] ✅ JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 2: HTML-Links zu /de/a/ mit CHF-Preisen im Kontext
      const htmlResults = this.parseHtmlListings(html, options);
      if (htmlResults.length > 0) {
        console.log(`[Ricardo] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      // Methode 3: Fallback — Alle /de/a/ Links sammeln (auch ohne Preis)
      const fallbackResults = this.parseFallbackLinks(html, options);
      console.log(`[Ricardo] Fallback: ${fallbackResults.length} results`);

      if (fallbackResults.length === 0) {
        console.warn(`[Ricardo] ⚠️ Keine Ergebnisse aus allen Parse-Methoden.`);
      }

      return fallbackResults;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Ricardo] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Preis aus einem offers-Objekt oder offers-Array extrahieren
   * Unterstützt: offers.price, offers.lowPrice, offers.highPrice,
   * offers als Array mit erstem Element, und verschachtelte Strukturen
   */
  private extractPriceFromOffers(offers: unknown): number {
    if (!offers) return 0;

    // Falls offers ein Array ist → erstes Element nehmen
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (!offer || typeof offer !== "object") return 0;

    const o = offer as Record<string, unknown>;

    // Versuche verschiedene Preis-Felder in Prioritäts-Reihenfolge
    const priceFields = ["price", "lowPrice", "highPrice"];
    for (const field of priceFields) {
      const val = o[field];
      if (val === undefined || val === null || val === "") continue;

      // Apostroph als Tausendertrenner entfernen: "6'000.00" → "6000.00"
      const parsed = typeof val === "number" ? val : parseFloat(String(val).replace(/'/g, "").replace(/[^0-9.\-]/g, ""));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    return 0;
  }

  /**
   * Bild-URL aus einem JSON-LD image-Feld extrahieren
   * Unterstützt: string, {url: string}, [{url: string}], [string]
   */
  private extractImageUrl(image: unknown): string | null {
    if (!image) return null;
    if (typeof image === "string" && image.length > 0) return image;

    // Array → erstes Element
    if (Array.isArray(image)) {
      const first = image[0];
      if (typeof first === "string" && first.length > 0) return first;
      if (first && typeof first === "object") {
        const url = (first as Record<string, unknown>).url || (first as Record<string, unknown>).contentUrl;
        if (typeof url === "string" && url.length > 0) return url;
      }
      return null;
    }

    // Objekt mit url/contentUrl
    if (typeof image === "object" && image !== null) {
      const obj = image as Record<string, unknown>;
      const url = obj.url || obj.contentUrl;
      if (typeof url === "string" && url.length > 0) return url;
    }

    return null;
  }

  /**
   * Parse JSON-LD schema.org ItemList aus dem HTML
   * Ricardo liefert ein <script type="application/ld+json" id="srps-json-ld"> mit:
   * { "@context": "https://schema.org", "@graph": [
   *   { "@type": "ItemList", "itemListElement": [
   *     { "@type": "ListItem", "position": 1, "item": {
   *       "@type": "Product", "name": "...", "image": "...",
   *       "url": "...", "offers": { "price": 500, "priceCurrency": "CHF" }
   *     }}
   *   ]}
   * ]}
   *
   * Auch unterstützt:
   * - offers als Array: "offers": [{ "price": "500.00", ... }]
   * - offers.lowPrice / offers.highPrice als Fallback
   * - price direkt auf dem Item
   * - image als String, Objekt oder Array
   */
  private parseJsonLd(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Alle JSON-LD Blöcke finden
    const jsonLdMatches = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);

        // Ricardo nutzt @graph Array
        const graphs = jsonData?.["@graph"] || [jsonData];

        for (const graph of graphs) {
          // Suche nach ItemList
          if (graph?.["@type"] !== "ItemList" || !Array.isArray(graph?.itemListElement)) {
            continue;
          }

          for (const entry of graph.itemListElement) {
            const item = entry?.item || entry;
            if (!item) continue;

            const title = (item.name as string) || "";
            if (!title) continue;

            // Preis aus offers extrahieren (robust)
            let priceRaw = this.extractPriceFromOffers(item.offers);

            // Fallback: Preis direkt auf dem Item
            if (priceRaw <= 0 && item.price !== undefined) {
              const directPrice = typeof item.price === "number"
                ? item.price
                : parseFloat(String(item.price).replace(/'/g, "").replace(/[^0-9.\-]/g, ""));
              if (!isNaN(directPrice) && directPrice > 0) {
                priceRaw = directPrice;
              }
            }

            const price = Math.round(priceRaw * 100); // CHF → Rappen

            // Treffer AUCH mit Preis 0 aufnehmen (besser als nichts)
            // Nur explizit NaN rausfiltern
            if (isNaN(price)) continue;

            // Preisfilter (nur wenn Preis > 0, damit 0-Preis-Items durchkommen)
            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            // URL
            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http")
              ? url
              : url
                ? `${this.baseUrl}${url}`
                : `${this.baseUrl}/de/s/`;

            // Bild (robust)
            const imageUrl = this.extractImageUrl(item.image);

            results.push({
              title,
              price,
              url: fullUrl,
              imageUrl,
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

    return results;
  }

  /**
   * HTML-Pattern-Matching: Links zu /de/a/ mit CHF-Preisen in der Nähe
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Finde alle Links zu Artikelseiten /de/a/
    const linkRegex = /href="(\/de\/a\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      // Normalisiere URL (entferne trailing slash variations)
      const normalizedHref = href.replace(/\/$/, "");
      if (seenUrls.has(normalizedHref)) continue;
      seenUrls.add(normalizedHref);

      // Kontext: 800 Zeichen um den Link herum
      const start = Math.max(0, linkMatch.index - 400);
      const end = Math.min(html.length, linkMatch.index + 400);
      const context = html.substring(start, end);

      // Preis suchen im Kontext (Schweizer Format: 6'000.00)
      const priceMatch =
        context.match(/(?:CHF|Fr\.?)\s*([\d'.,]+)/i) ||
        context.match(/([\d'.,]+)\s*(?:CHF|Fr\.?)/i);

      let price = 0;
      if (priceMatch) {
        // Apostroph als Tausendertrenner entfernen: "6'000.00" → "6000.00"
        const priceStr = priceMatch[1].replace(/'/g, "").replace(/,/g, "");
        price = Math.round(parseFloat(priceStr) * 100);
        if (isNaN(price)) price = 0;
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Titel aus dem href extrahieren (URL-Slug)
      const slugMatch = href.match(/\/de\/a\/([^/]+?)(?:-\d+)?\/?$/);
      const title = slugMatch
        ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Artikel";

      // Bild in der Nähe
      const imgMatch = context.match(/src="(https:\/\/img\.ricardostatic\.ch[^"]+)"/i);

      results.push({
        title,
        price,
        url: `${this.baseUrl}${href}`,
        imageUrl: imgMatch ? imgMatch[1] : null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }

  /**
   * Fallback: Sammle alle /de/a/ Links mit Titel aus dem URL-Slug
   */
  private parseFallbackLinks(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    const linkRegex = /href="(\/de\/a\/([^"]+))"/g;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const slug = match[2];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Titel aus Slug
      const titlePart = slug.replace(/-\d+\/?$/, "").replace(/-/g, " ");
      const title = titlePart.replace(/\b\w/g, (c) => c.toUpperCase());

      results.push({
        title: title || "Artikel",
        price: 0,
        url: `${this.baseUrl}${href}`,
        imageUrl: null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
