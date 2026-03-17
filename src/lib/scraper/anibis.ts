// Anibis.ch Scraper (Schweiz)
// Nutzt Puppeteer (headless Browser) mit Proxy
// Parse-Methoden: JSON-LD, HTML-Pattern-Matching

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AnibisScraper extends BaseScraper {
  readonly platform = "anibis";
  readonly displayName = "Anibis.ch";
  readonly baseUrl = "https://www.anibis.ch";
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

      // Anibis.ch URL mit echten Filtern
      // Basis: /de/q/suchbegriff
      // Preis: ?pr=MIN-MAX (CHF)
      // Hinweis: Anibis hat Cloudflare-Schutz, Ergebnisse können eingeschränkt sein
      let searchUrl = `${this.baseUrl}/de/q/${encodedQuery}`;
      const urlParams = new URLSearchParams();
      
      if (options?.minPrice || options?.maxPrice) {
        const minCHF = options.minPrice ? Math.round(options.minPrice / 100) : "";
        const maxCHF = options.maxPrice ? Math.round(options.maxPrice / 100) : "";
        urlParams.set("pr", `${minCHF}-${maxCHF}`);
      }
      
      const paramStr = urlParams.toString();
      if (paramStr) {
        searchUrl += "?" + paramStr;
      }

      console.log(`[Anibis] Search URL: ${searchUrl}`);

      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Anibis] Browser failed, trying without proxy:`, browserError);
        try {
          html = await this.fetchWithBrowserNoProxy(searchUrl);
        } catch (noProxyError) {
          console.warn(`[Anibis] Browser without proxy also failed, falling back to HTTP:`, noProxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Anibis.ch: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Anibis] HTML length: ${html.length}`);

      // Prüfe ob blockiert
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Anibis] ⚠️ Cloudflare-Challenge erkannt — Scraping blockiert.");
        return results;
      }

      if (html.length < 1000) {
        console.warn(`[Anibis] ⚠️ Sehr kurze Antwort (${html.length} Bytes) — wahrscheinlich Bot-Schutz`);
        return results;
      }

      // Methode 1: JSON-LD schema.org
      const jsonLdResults = this.parseJsonLd(html, options);
      if (jsonLdResults.length > 0) {
        console.log(`[Anibis] ✅ JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 2: HTML-Pattern-Matching
      const htmlResults = this.parseHtmlListings(html, options);
      if (htmlResults.length > 0) {
        console.log(`[Anibis] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      console.warn(`[Anibis] ⚠️ Keine Ergebnisse aus allen Parse-Methoden.`);
      return results;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Anibis] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Parse JSON-LD schema.org ItemList
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
          if (graph?.["@type"] !== "ItemList" || !Array.isArray(graph?.itemListElement)) {
            continue;
          }

          for (const entry of graph.itemListElement) {
            const item = entry?.item || entry;
            if (!item) continue;

            const title = (item.name as string) || "";
            if (!title) continue;

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
            const price = Math.round(priceRaw * 100); // CHF → Rappen

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

            // Bild
            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];
            else if (item.image && typeof item.image === "object") {
              imageUrl = ((item.image as Record<string, unknown>).url as string) || null;
            }

            // Description
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

    return results;
  }

  /**
   * HTML-Pattern-Matching: Links zu Inseraten mit CHF-Preisen
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Anibis Inserate: Links die auf /de/d/ oder /de/vi/ verweisen
    const linkRegex = /href="(\/de\/(?:d|vi)\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Kontext: 800 Zeichen um den Link
      const start = Math.max(0, linkMatch.index - 400);
      const end = Math.min(html.length, linkMatch.index + 400);
      const context = html.substring(start, end);

      // Preis suchen (CHF Format mit Apostroph-Tausendertrenner)
      const priceMatch =
        context.match(/(?:CHF|Fr\.?)\s*([\d'.,]+)/i) ||
        context.match(/([\d'.,]+)\s*(?:CHF|Fr\.?)/i);

      let price = 0;
      if (priceMatch) {
        const priceStr = priceMatch[1].replace(/'/g, "").replace(/,/g, "");
        price = Math.round(parseFloat(priceStr) * 100);
        if (isNaN(price)) price = 0;
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Titel aus Kontext oder URL-Slug
      const titleMatch = context.match(/>([^<]{5,80})<\/(?:a|h[1-6]|span|div)/);
      const slugMatch = href.match(/\/(?:d|vi)\/([^/]+?)(?:-\d+)?\/?$/);
      const title = titleMatch
        ? titleMatch[1].trim()
        : slugMatch
          ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Inserat";

      // Bild in der Nähe
      const imgMatch = context.match(/src="(https:\/\/[^"]*(?:anibis|images|img|cdn)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i);

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
}
