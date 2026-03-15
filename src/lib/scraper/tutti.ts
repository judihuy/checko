// Tutti.ch Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Cloudflare-Bypass
// Primäre Parse-Methode: __NEXT_DATA__ JSON (Tutti nutzt Next.js)
// Fallback: JSON-LD und HTML-Pattern-Matching

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";
  isWorking = true; // Aktiviert — Puppeteer mit Proxy versucht Cloudflare zu umgehen

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);
      const searchUrl = `${this.baseUrl}/de/q/${encodedQuery}`;

      console.log(`[Tutti] Search URL: ${searchUrl}`);

      // Puppeteer mit Proxy (Cloudflare-Bypass)
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Tutti] Proxy browser failed, trying without proxy:`, browserError);
        try {
          html = await this.fetchWithBrowserNoProxy(searchUrl);
        } catch (noProxyError) {
          console.warn(`[Tutti] Browser without proxy also failed, falling back to HTTP:`, noProxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Tutti.ch: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Tutti] HTML length: ${html.length}`);

      // Prüfe ob Cloudflare blockiert
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Tutti] ⚠️ Cloudflare-Challenge erkannt — Scraping blockiert.");
        return results;
      }

      if (html.length < 1000) {
        console.warn(`[Tutti] ⚠️ Sehr kurze Antwort (${html.length} Bytes) — wahrscheinlich Bot-Schutz`);
        return results;
      }

      // Methode 1 (PRIMÄR): __NEXT_DATA__ JSON parsen
      const nextDataResults = this.parseNextData(html, options);
      if (nextDataResults.length > 0) {
        console.log(`[Tutti] ✅ __NEXT_DATA__ parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 2: JSON-LD schema.org
      const jsonLdResults = this.parseJsonLd(html, options);
      if (jsonLdResults.length > 0) {
        console.log(`[Tutti] JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 3: HTML-Pattern-Matching
      const htmlResults = this.parseHtmlListings(html, options);
      if (htmlResults.length > 0) {
        console.log(`[Tutti] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      console.warn(`[Tutti] ⚠️ Keine Ergebnisse aus allen Parse-Methoden.`);
      return results;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Tutti] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON aus dem HTML
   * Tutti.ch nutzt Next.js und liefert die Suchergebnisse im
   * <script id="__NEXT_DATA__"> Tag als JSON
   *
   * Typische Struktur:
   * props.pageProps.listings[] oder props.pageProps.searchResult.listings[]
   * Jedes Listing hat: subject, body, parameters (mit price), images[], ownerId etc.
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
    );

    if (!nextDataMatch) {
      console.log("[Tutti] __NEXT_DATA__ nicht gefunden");
      return results;
    }

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps;

      if (!pageProps) {
        console.log("[Tutti] pageProps nicht gefunden in __NEXT_DATA__");
        return results;
      }

      // Verschiedene Pfade zu den Listings versuchen
      const listings: unknown[] =
        pageProps.listings ||
        pageProps.searchResult?.listings ||
        pageProps.initialData?.listings ||
        pageProps.results?.listings ||
        pageProps.data?.listings ||
        [];

      // Falls listings ein Objekt mit items/results ist
      const listingArray = Array.isArray(listings)
        ? listings
        : (listings as Record<string, unknown>)?.items ||
          (listings as Record<string, unknown>)?.results ||
          [];

      if (!Array.isArray(listingArray) || listingArray.length === 0) {
        console.log("[Tutti] Keine Listings in __NEXT_DATA__ gefunden. Keys:", Object.keys(pageProps).join(", "));
        return results;
      }

      console.log(`[Tutti] ${listingArray.length} Listings in __NEXT_DATA__ gefunden`);

      for (const listing of listingArray) {
        if (!listing || typeof listing !== "object") continue;
        const item = listing as Record<string, unknown>;

        // Titel extrahieren
        const title = (item.subject || item.title || item.name || "") as string;
        if (!title) continue;

        // Preis extrahieren (verschiedene Strukturen)
        let priceRaw = 0;

        // Variante 1: parameters Array mit key "price"
        if (Array.isArray(item.parameters)) {
          const priceParam = (item.parameters as Array<Record<string, unknown>>).find(
            (p) => p.key === "price" || p.label === "Preis" || p.name === "price"
          );
          if (priceParam) {
            const val = priceParam.value || priceParam.rawValue || priceParam.displayValue;
            priceRaw = typeof val === "number" ? val : parseFloat(String(val || "0").replace(/[^0-9.,\-]/g, "").replace(",", "."));
          }
        }

        // Variante 2: price direkt oder in formattedPrice
        if (priceRaw <= 0) {
          const directPrice = item.price || item.priceValue || item.currentPrice;
          if (directPrice !== undefined && directPrice !== null) {
            priceRaw = typeof directPrice === "number"
              ? directPrice
              : parseFloat(String(directPrice).replace(/[^0-9.,\-]/g, "").replace(",", "."));
          }
        }

        // Variante 3: moneyValue-Objekt
        if (priceRaw <= 0 && item.moneyValue && typeof item.moneyValue === "object") {
          const mv = item.moneyValue as Record<string, unknown>;
          const val = mv.amount || mv.value || mv.price;
          if (val !== undefined) {
            priceRaw = typeof val === "number" ? val : parseFloat(String(val));
          }
        }

        if (isNaN(priceRaw)) priceRaw = 0;

        const price = Math.round(priceRaw * 100); // CHF → Rappen

        // Preisfilter (nur wenn Preis > 0)
        if (price > 0) {
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;
        }

        // URL extrahieren
        const itemId = item.id || item.listingId || item.adId || "";
        const itemSlug = item.slug || item.seoPath || "";
        let url = "";
        if (typeof item.url === "string" && item.url.length > 0) {
          url = item.url.startsWith("http") ? item.url : `${this.baseUrl}${item.url}`;
        } else if (typeof item.link === "string" && item.link.length > 0) {
          url = item.link.startsWith("http") ? item.link : `${this.baseUrl}${item.link}`;
        } else if (itemSlug) {
          url = `${this.baseUrl}/de/vi/${itemSlug}`;
        } else if (itemId) {
          url = `${this.baseUrl}/de/vi/${itemId}`;
        } else {
          url = `${this.baseUrl}/de/q/${encodeURIComponent(title)}`;
        }

        // Bild extrahieren
        let imageUrl: string | null = null;
        if (Array.isArray(item.images) && item.images.length > 0) {
          const firstImg = item.images[0];
          if (typeof firstImg === "string") {
            imageUrl = firstImg;
          } else if (firstImg && typeof firstImg === "object") {
            const imgObj = firstImg as Record<string, unknown>;
            imageUrl = (imgObj.url || imgObj.uri || imgObj.src || imgObj.thumb || imgObj.thumbnail || "") as string;
          }
        } else if (typeof item.image === "string") {
          imageUrl = item.image;
        } else if (typeof item.thumbnailUrl === "string") {
          imageUrl = item.thumbnailUrl;
        } else if (typeof item.imageUrl === "string") {
          imageUrl = item.imageUrl;
        }

        if (imageUrl && !imageUrl.startsWith("http")) {
          imageUrl = null; // Ungültige URL verwerfen
        }

        results.push({
          title,
          price,
          url,
          imageUrl,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    } catch (error) {
      console.error("[Tutti] __NEXT_DATA__ Parse-Fehler:", error);
    }

    return results;
  }

  /**
   * Parse JSON-LD schema.org Blöcke
   */
  private parseJsonLd(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const jsonLdMatches = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    for (const match of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(match[1]);

        // Verarbeite @graph oder einzelnes Objekt
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

            // Preis
            let priceRaw = 0;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers) {
                priceRaw = typeof offers.price === "number"
                  ? offers.price
                  : parseFloat(String(offers.price || "0"));
              }
            }
            if (isNaN(priceRaw)) priceRaw = 0;
            const price = Math.round(priceRaw * 100);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            // URL
            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

            // Bild
            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];
            else if (item.image && typeof item.image === "object") {
              imageUrl = ((item.image as Record<string, unknown>).url as string) || null;
            }

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
        // JSON parse error
      }
    }

    return results;
  }

  /**
   * HTML-Pattern-Matching: Listings aus dem gerenderten HTML extrahieren
   * Tutti hat typisch: <a href="/de/vi/..."> mit Preis und Titel in der Nähe
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Links zu Listing-Seiten finden
    const linkRegex = /href="(\/de\/vi\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Kontext: 1000 Zeichen um den Link herum
      const start = Math.max(0, linkMatch.index - 500);
      const end = Math.min(html.length, linkMatch.index + 500);
      const context = html.substring(start, end);

      // Preis suchen (CHF Format)
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

      // Titel aus dem Link-Kontext
      const titleMatch = context.match(/>([^<]{5,80})<\/(?:a|h[1-6]|span|div)/);
      const slugMatch = href.match(/\/de\/vi\/([^/]+?)(?:-\d+)?\/?$/);
      const title = titleMatch
        ? titleMatch[1].trim()
        : slugMatch
          ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Inserat";

      // Bild in der Nähe
      const imgMatch = context.match(/src="(https:\/\/[^"]*(?:tutti|images|img|cdn)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i);

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
