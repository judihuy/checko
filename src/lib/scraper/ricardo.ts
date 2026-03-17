// Ricardo.ch Scraper — API-basiert (kein Puppeteer!)
// Nutzt die interne JSON-API: /api/mfa/search
// Liefert strukturierte Daten inkl. Preis, Bilder, Titel direkt als JSON.
// Fallback: fetchWithHeaders + JSON-LD Parsing

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { fetchWithProxy } from "./proxy-manager";

export class RicardoScraper extends BaseScraper {
  readonly platform = "ricardo";
  readonly displayName = "Ricardo.ch";
  readonly baseUrl = "https://www.ricardo.ch";
  isWorking = true;

  // Rate limiting: 8s between requests to avoid 429
  private static apiLastRequestTime = 0;
  private static readonly API_MIN_DELAY_MS = 8000;

  private async enforceApiRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - RicardoScraper.apiLastRequestTime;
    if (elapsed < RicardoScraper.API_MIN_DELAY_MS) {
      const waitMs = RicardoScraper.API_MIN_DELAY_MS - elapsed;
      console.log(`[Ricardo] Rate-limit: waiting ${waitMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    RicardoScraper.apiLastRequestTime = Date.now();
  }

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

    // Methode 1 (PRIMÄR): Interne JSON-API
    try {
      const apiResults = await this.scrapeViaApi(enrichedQuery, options);
      if (apiResults.length > 0) {
        console.log(`[Ricardo] ✅ API: ${apiResults.length} Ergebnisse`);
        return apiResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] API-Methode fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): HTTP fetch + HTML/JSON-LD Parsing
    try {
      const htmlResults = await this.scrapeViaHtml(enrichedQuery, options);
      if (htmlResults.length > 0) {
        console.log(`[Ricardo] HTML-Fallback: ${htmlResults.length} Ergebnisse`);
        return htmlResults;
      }
    } catch (error) {
      console.warn(
        `[Ricardo] HTML-Fallback fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    console.warn(`[Ricardo] ⚠️ Keine Ergebnisse aus allen Methoden`);
    return [];
  }

  /**
   * Ricardo interne JSON-API aufrufen
   * Endpoint: GET /api/mfa/search?q={query}&sort=newest&...
   * Liefert: { articles: [...], totalArticlesCount, config, filters, ... }
   */
  private async scrapeViaApi(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    await this.enforceApiRateLimit();

    const results: ScraperResult[] = [];
    const encodedQuery = encodeURIComponent(query);

    // Build API URL with filters
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("sort", "newest");

    // Price filter: Ricardo API uses range_filters.price with min/max in CHF
    if (options?.minPrice) {
      params.set("range_filters.price.min", String(Math.round(options.minPrice / 100)));
    }
    if (options?.maxPrice) {
      params.set("range_filters.price.max", String(Math.round(options.maxPrice / 100)));
    }

    // Category filter: Fahrzeuge = 69956
    if (options?.category === "Fahrzeuge") {
      params.set("category_id", "69956");
    }

    const apiUrl = `${this.baseUrl}/api/mfa/search?${params.toString()}`;
    console.log(`[Ricardo] API URL: ${apiUrl}`);

    // API-Anfrage — direkt ohne Proxy (Ricardo API blockiert nicht so aggressiv)
    const headers: Record<string, string> = {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Referer": `${this.baseUrl}/de/s/${encodedQuery}`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    };

    let responseText: string;

    try {
      // Zuerst direkt ohne Proxy versuchen
      const { response } = await fetchWithProxy(apiUrl, this.platform, {
        headers,
        maxRetries: 2,
        preferredCountry: "ch",
      });

      if (!response.ok) {
        // Bei 429 (Rate Limit): warten und nochmal direkt versuchen
        if (response.status === 429) {
          console.log(`[Ricardo] 429 Rate Limited — warte 15s und versuche direkt...`);
          await new Promise((r) => setTimeout(r, 15000));
          const directResp = await fetch(apiUrl, {
            headers: {
              ...headers,
              "User-Agent": this.getRandomUserAgent(),
            },
          });
          if (!directResp.ok) {
            console.error(`[Ricardo] API HTTP ${directResp.status} nach Retry`);
            return results;
          }
          responseText = await directResp.text();
        } else {
          console.error(`[Ricardo] API HTTP ${response.status}`);
          return results;
        }
      } else {
        responseText = await response.text();
      }
    } catch (fetchError) {
      // Direct fallback
      console.warn(`[Ricardo] Proxy fetch failed, trying direct:`, fetchError);
      const directResp = await fetch(apiUrl, {
        headers: {
          ...headers,
          "User-Agent": this.getRandomUserAgent(),
        },
      });
      if (!directResp.ok) {
        console.error(`[Ricardo] Direct API HTTP ${directResp.status}`);
        return results;
      }
      responseText = await directResp.text();
    }

    // Parse JSON response
    let data: {
      articles?: Array<{
        id: string;
        title: string;
        bidPrice: number | null;
        buyNowPrice: number | null;
        image: string | null;
        hasAuction: boolean;
        hasBuyNow: boolean;
        endDate: string;
        categoryId: number;
      }>;
      totalArticlesCount?: number;
    };

    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(`[Ricardo] API JSON Parse-Fehler (response length: ${responseText.length})`);
      return results;
    }

    if (!data.articles || !Array.isArray(data.articles)) {
      console.warn(`[Ricardo] API: Keine 'articles' im Response`);
      return results;
    }

    console.log(`[Ricardo] API: ${data.articles.length} Artikel (total: ${data.totalArticlesCount})`);

    for (const article of data.articles) {
      // Preis: buyNowPrice hat Priorität, dann bidPrice
      const priceCHF = article.buyNowPrice ?? article.bidPrice ?? 0;
      const priceRappen = Math.round(priceCHF * 100);

      // Preisfilter
      if (priceRappen > 0) {
        if (options?.minPrice && priceRappen < options.minPrice) continue;
        if (options?.maxPrice && priceRappen > options.maxPrice) continue;
      }

      // URL: Ricardo article URL format
      const articleUrl = `${this.baseUrl}/de/a/${article.id}`;

      // Image: Full URL aus dem image field
      // Ricardo images: https://img.ricardostatic.ch/images/{uuid}/t_265x200/{slug}
      const imageUrl = article.image || null;

      // Description: Auktionsinfo
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
        title: article.title,
        price: priceRappen,
        url: articleUrl,
        imageUrl,
        description: descParts.length > 0 ? descParts.join(" | ") : undefined,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }

  /**
   * HTML-Fallback: Seite per HTTP laden und JSON-LD parsen
   */
  private async scrapeViaHtml(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const encodedQuery = encodeURIComponent(query);

    let searchUrl = `${this.baseUrl}/de/s/${encodedQuery}`;
    const urlParams = new URLSearchParams();
    if (options?.minPrice) urlParams.set("price_min", String(Math.round(options.minPrice / 100)));
    if (options?.maxPrice) urlParams.set("price_max", String(Math.round(options.maxPrice / 100)));
    urlParams.set("sort_by", "newest");

    const paramStr = urlParams.toString();
    if (paramStr) searchUrl += "?" + paramStr;

    console.log(`[Ricardo] HTML Fallback URL: ${searchUrl}`);

    const response = await this.fetchWithHeaders(searchUrl);
    if (!response.ok) {
      console.error(`[Ricardo] HTML: HTTP ${response.status}`);
      return [];
    }

    const html = await response.text();
    if (html.length < 1000 || html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Ricardo] ⚠️ Cloudflare-Challenge oder kurze Antwort");
      return [];
    }

    return this.parseJsonLd(html, options);
  }

  /**
   * Parse JSON-LD schema.org ItemList aus HTML
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
}
