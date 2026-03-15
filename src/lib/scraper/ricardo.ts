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

    try {
      const encodedQuery = encodeURIComponent(query);
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

            // Preis aus offers extrahieren
            let priceRaw = 0;
            if (item.offers) {
              const offers = item.offers;
              priceRaw = typeof offers.price === "number"
                ? offers.price
                : parseFloat(String(offers.price || "0"));
            } else if (typeof item.price === "number") {
              priceRaw = item.price;
            }

            const price = Math.round(priceRaw * 100); // CHF → Rappen
            if (isNaN(price) || price <= 0) continue;

            // Preisfilter
            if (options?.minPrice && price < options.minPrice) continue;
            if (options?.maxPrice && price > options.maxPrice) continue;

            // URL
            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http")
              ? url
              : url
                ? `${this.baseUrl}${url}`
                : `${this.baseUrl}/de/s/`;

            // Bild
            const imageUrl = typeof item.image === "string"
              ? item.image
              : typeof item.image === "object" && item.image !== null
                ? ((item.image as Record<string, unknown>).url as string) || null
                : null;

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

      // Preis suchen im Kontext
      const priceMatch =
        context.match(/(?:CHF|Fr\.?)\s*([\d',.]+)/i) ||
        context.match(/([\d',.]+)\s*(?:CHF|Fr\.?)/i);

      let price = 0;
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/[',]/g, "");
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
