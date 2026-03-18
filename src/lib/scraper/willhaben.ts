// Willhaben.at Scraper (Österreich)
// Nutzt Puppeteer (headless Browser) mit Proxy
// Parse-Methoden: JSON-LD, __NEXT_DATA__, HTML-Pattern-Matching

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { parseSwissPrice, parseSwissPriceRappen } from "./price-utils";

export class WillhabenScraper extends BaseScraper {
  readonly platform = "willhaben";
  readonly displayName = "Willhaben.at";
  readonly baseUrl = "https://www.willhaben.at";
  isWorking = false; // ❌ Vorerst deaktiviert — Schweizer Fokus, Österreich nicht Priorität

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      // Enrich query with vehicle make/model if available
      let enrichedQuery = query;
      if (options?.vehicleMake) {
        enrichedQuery = options.vehicleMake;
        if (options.vehicleModel) enrichedQuery += " " + options.vehicleModel;
        if (query && !enrichedQuery.toLowerCase().includes(query.toLowerCase())) {
          enrichedQuery += " " + query;
        }
      }
      const encodedQuery = encodeURIComponent(enrichedQuery);
      
      // Willhaben.at URL-Struktur:
      // Allgemeine Suche: /iad/kaufen-und-verkaufen/marktplatz?keyword=X
      // Auto-Suche: /iad/gebrauchtwagen/auto/gebraucht?keyword=X
      // Immobilien: /iad/immobilien/mietwohnungen/mietwohnung-angebote OR /eigentumswohnungen
      // Filter: PRICE_FROM, PRICE_TO, YEAR_MODEL_FROM, YEAR_MODEL_TO, KILOMETRES_FROM, KILOMETRES_TO
      let basePath = "/iad/kaufen-und-verkaufen/marktplatz";
      if (options?.category === "Fahrzeuge") {
        basePath = "/iad/gebrauchtwagen/auto/gebraucht";
      } else if (options?.category === "Immobilien") {
        if (options?.propertyOffer === "miete" && options?.propertyType === "wohnung") {
          basePath = "/iad/immobilien/mietwohnungen/mietwohnung-angebote";
        } else if (options?.propertyOffer === "kauf" && options?.propertyType === "wohnung") {
          basePath = "/iad/immobilien/eigentumswohnungen/eigentumswohnung-angebote";
        } else if (options?.propertyOffer === "kauf" && options?.propertyType === "haus") {
          basePath = "/iad/immobilien/haus-kaufen/haus-angebote";
        } else if (options?.propertyOffer === "miete" && options?.propertyType === "haus") {
          basePath = "/iad/immobilien/haus-mieten/haus-angebote";
        } else {
          // Neutraler Immobilien-Pfad wenn Typ/Offer nicht sicher gesetzt
          basePath = "/iad/immobilien";
        }
      }
      
      let searchUrl = `${this.baseUrl}${basePath}?keyword=${encodedQuery}`;

      // Preisfilter (EUR — unsere Preise sind in CHF-Rappen, 1 CHF ≈ 0.96 EUR)
      if (options?.minPrice) {
        const minEUR = Math.round((options.minPrice / 100) / 0.96);
        searchUrl += `&PRICE_FROM=${minEUR}`;
      }
      if (options?.maxPrice) {
        const maxEUR = Math.round((options.maxPrice / 100) / 0.96);
        searchUrl += `&PRICE_TO=${maxEUR}`;
      }

      // Fahrzeug-spezifische Filter (Willhaben Parameter)
      if (options?.yearFrom) searchUrl += `&YEAR_MODEL_FROM=${options.yearFrom}`;
      if (options?.yearTo) searchUrl += `&YEAR_MODEL_TO=${options.yearTo}`;
      // KM-Filter — jetzt mit FROM und TO!
      if (options?.kmFrom) searchUrl += `&KILOMETRES_FROM=${options.kmFrom}`;
      if (options?.kmTo) searchUrl += `&KILOMETRES_TO=${options.kmTo}`;

      console.log(`[Willhaben] Search URL: ${searchUrl}`);

      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Willhaben] Browser failed, trying without proxy:`, browserError);
        try {
          html = await this.fetchWithBrowserNoProxy(searchUrl);
        } catch (noProxyError) {
          console.warn(`[Willhaben] Browser without proxy also failed, falling back to HTTP:`, noProxyError);
          const response = await this.fetchWithHeaders(searchUrl);
          if (!response.ok) {
            console.error(`Willhaben.at: HTTP ${response.status} für "${query}"`);
            return results;
          }
          html = await response.text();
        }
      }

      console.log(`[Willhaben] HTML length: ${html.length}`);

      // Prüfe ob blockiert
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Willhaben] ⚠️ Cloudflare-Challenge erkannt — Scraping blockiert.");
        return results;
      }

      if (html.length < 1000) {
        console.warn(`[Willhaben] ⚠️ Sehr kurze Antwort (${html.length} Bytes)`);
        return results;
      }

      // Methode 1: __NEXT_DATA__ JSON (Willhaben nutzt Next.js)
      const nextDataResults = this.parseNextData(html, options);
      if (nextDataResults.length > 0) {
        console.log(`[Willhaben] ✅ __NEXT_DATA__ parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 2: JSON-LD
      const jsonLdResults = this.parseJsonLd(html, options);
      if (jsonLdResults.length > 0) {
        console.log(`[Willhaben] JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 3: HTML-Pattern-Matching
      const htmlResults = this.parseHtmlListings(html, options);
      if (htmlResults.length > 0) {
        console.log(`[Willhaben] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      console.warn(`[Willhaben] ⚠️ Keine Ergebnisse aus allen Parse-Methoden.`);
      return results;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Willhaben] ❌ Scraper-Fehler: ${reason}`);
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON (Willhaben nutzt Next.js)
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i
    );

    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) return results;

      // Willhaben Struktur: searchResult.advertSummaryList.advertSummary[]
      const adverts: unknown[] =
        pageProps.searchResult?.advertSummaryList?.advertSummary ||
        pageProps.advertSummaryList?.advertSummary ||
        pageProps.listings ||
        pageProps.results ||
        [];

      if (!Array.isArray(adverts) || adverts.length === 0) return results;

      console.log(`[Willhaben] ${adverts.length} Adverts in __NEXT_DATA__`);

      for (const advert of adverts) {
        if (!advert || typeof advert !== "object") continue;
        const item = advert as Record<string, unknown>;

        // Titel — Willhaben nutzt "description" als Titelfeld
        const title = (item.description || item.title || item.headline || "") as string;
        if (!title) continue;

        // Beschreibung aus body oder attributes (BODY-Feld)
        let description: string | undefined;
        if (typeof item.body === "string" && item.body) {
          description = item.body.substring(0, 500);
        } else if (Array.isArray(item.attributes)) {
          for (const attr of (item.attributes as Array<Record<string, unknown>>)) {
            const name = String(attr.name || "").toUpperCase();
            if ((name === "BODY" || name === "DESCRIPTION") && Array.isArray(attr.values) && (attr.values as string[]).length > 0) {
              description = String((attr.values as string[])[0]).substring(0, 500);
              break;
            }
          }
        }

        // Preis: attributes Array mit Attribut "PRICE" oder "PRICE/AMOUNT"
        let priceRaw = 0;
        if (Array.isArray(item.attributes)) {
          const attrs = item.attributes as Array<Record<string, unknown>>;
          // Willhaben speichert Preise unter verschiedenen Attributnamen
          for (const attr of attrs) {
            const name = String(attr.name || "").toUpperCase();
            if (name === "PRICE" || name === "PRICE/AMOUNT" || name === "PRICE_FOR_DISPLAY") {
              const vals = attr.values as string[] | undefined;
              if (vals && vals.length > 0) {
                const v = parseSwissPrice(String(vals[0]));
                if (v > 0) { priceRaw = v; break; }
              }
            }
          }
          // Breitere Suche: alles mit "PRICE" im Namen
          if (priceRaw <= 0) {
            for (const attr of attrs) {
              const name = String(attr.name || "").toUpperCase();
              if (name.includes("PRICE") && Array.isArray(attr.values) && (attr.values as string[]).length > 0) {
                const v = parseSwissPrice(String((attr.values as string[])[0]));
                if (v > 0) { priceRaw = v; break; }
              }
            }
          }
        }

        // Fallback: price direkt auf dem Objekt
        if (priceRaw <= 0 && item.price !== undefined) {
          priceRaw = parseSwissPrice(item.price as string | number);
        }

        // Fallback: teaserAttributes (neueres Willhaben-Format)
        if ((priceRaw <= 0 || isNaN(priceRaw)) && Array.isArray(item.teaserAttributes)) {
          for (const attr of (item.teaserAttributes as Array<Record<string, unknown>>)) {
            const name = String(attr.prefix || attr.key || "").toUpperCase();
            if (name.includes("PRICE") || name.includes("€")) {
              const val = String(attr.value || attr.formattedValue || "");
              const v = parseSwissPrice(val);
              if (v > 0) { priceRaw = v; break; }
            }
          }
        }

        if (isNaN(priceRaw)) priceRaw = 0;

        // EUR → CHF Rappen (1 EUR ≈ 0.96 CHF)
        const price = Math.round(priceRaw * 0.96 * 100);

        if (price > 0) {
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;
        }

        // URL — selfLink zeigt auf API, NICHT verwenden! 
        const adId = item.id || item.adId || item.advertId || "";
        let url = "";
        if (typeof item.ownUrl === "string" && item.ownUrl.includes("/iad/")) {
          url = item.ownUrl.startsWith("http") ? item.ownUrl : `${this.baseUrl}${item.ownUrl}`;
        } else if (typeof item.contextLinkList === "object" && Array.isArray(item.contextLinkList)) {
          const webLink = (item.contextLinkList as Array<Record<string, unknown>>).find(
            (l) => typeof l.uri === "string" && (l.uri as string).includes("/iad/")
          );
          if (webLink) url = `https://www.willhaben.at${(webLink as Record<string, unknown>).uri}`;
        }
        // Fallback: Inserat-URL aus adId konstruieren
        if (!url && adId) {
          url = `https://www.willhaben.at/iad/kaufen-und-verkaufen/d/-${adId}/`;
        }
        if (!url) url = `https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz`;

        // Bild — Willhaben nutzt verschiedene Bildstrukturen
        let imageUrl: string | null = null;
        if (Array.isArray(item.advertImageList)) {
          const imgs = item.advertImageList as Array<Record<string, unknown>>;
          if (imgs.length > 0) {
            imageUrl = (imgs[0].mainImageUrl || imgs[0].referenceImageUrl || imgs[0].url || imgs[0].selfLink || "") as string;
          }
        }
        // Neueres Format: allImageUrls Array (direkte URL-Strings)
        if (!imageUrl && Array.isArray(item.allImageUrls) && (item.allImageUrls as string[]).length > 0) {
          imageUrl = (item.allImageUrls as string[])[0];
        }
        // Attribute: IMAGE oder MAIN_IMAGE_URL
        if (!imageUrl && Array.isArray(item.attributes)) {
          for (const attr of (item.attributes as Array<Record<string, unknown>>)) {
            const name = String(attr.name || "").toUpperCase();
            if ((name === "ALL_IMAGE_URLS" || name === "IMAGE_URLS" || name === "MAIN_IMAGE_URL") && Array.isArray(attr.values) && (attr.values as string[]).length > 0) {
              const val = (attr.values as string[])[0];
              if (val && val.startsWith("http")) { imageUrl = val; break; }
            }
          }
        }
        // Direkte Felder
        if (!imageUrl && typeof item.imageUrl === "string" && item.imageUrl.startsWith("http")) {
          imageUrl = item.imageUrl;
        }
        if (!imageUrl && typeof item.thumbnailUrl === "string" && item.thumbnailUrl.startsWith("http")) {
          imageUrl = item.thumbnailUrl;
        }
        // advertImage (einzelnes Objekt)
        if (!imageUrl && item.advertImage && typeof item.advertImage === "object") {
          const img = item.advertImage as Record<string, unknown>;
          imageUrl = (img.mainImageUrl || img.referenceImageUrl || img.url || "") as string;
        }

        if (imageUrl && !imageUrl.startsWith("http")) imageUrl = null;

        results.push({
          title,
          price,
          url,
          imageUrl,
          description,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    } catch (error) {
      console.error("[Willhaben] __NEXT_DATA__ Parse-Fehler:", error);
    }

    return results;
  }

  /**
   * Parse JSON-LD schema.org
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

            let priceRaw = 0;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers) {
                const val = offers.price || offers.lowPrice;
                priceRaw = parseSwissPrice(val as string | number);
              }
            }
        
        // Fallback: Check more attribute names for price
        if (priceRaw === 0 && Array.isArray(item.attributes)) {
          for (const attr of (item.attributes as Array<Record<string, unknown>>)) {
            const name = String(attr.name || "").toUpperCase();
            if (name.includes("PRICE") && Array.isArray(attr.values) && (attr.values as string[]).length > 0) {
              const v = parseSwissPrice(String((attr.values as string[])[0]));
              if (v > 0) { priceRaw = v; break; }
            }
          }
        }

            // EUR → CHF Rappen
            const price = Math.round(priceRaw * 0.96 * 100);

            if (price > 0) {
              if (options?.minPrice && price < options.minPrice) continue;
              if (options?.maxPrice && price > options.maxPrice) continue;
            }

            const url = (item.url as string) || "";
            const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

            let imageUrl: string | null = null;
            if (typeof item.image === "string") imageUrl = item.image;
            else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];

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
   * HTML-Pattern-Matching: Links zu Inseraten mit EUR-Preisen
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Willhaben Inserat-Links
    const linkRegex = /href="(\/iad\/kaufen-und-verkaufen\/d\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      const normalized = href.replace(/\/$/, "");
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Kontext
      const start = Math.max(0, linkMatch.index - 500);
      const end = Math.min(html.length, linkMatch.index + 500);
      const context = html.substring(start, end);

      // Preis (EUR Format)
      const priceMatch =
        context.match(/€\s*([\d.,]+)/i) ||
        context.match(/([\d.,]+)\s*€/i) ||
        context.match(/EUR\s*([\d.,]+)/i);

      let price = 0;
      if (priceMatch) {
        const priceEUR = parseSwissPrice(priceMatch[1]);
        if (priceEUR > 0) {
          price = Math.round(priceEUR * 0.96 * 100); // EUR → CHF Rappen
        }
      }

      if (price > 0) {
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;
      }

      // Titel
      const titleMatch = context.match(/>([^<]{5,100})<\/(?:a|h[1-6]|span|div)/);
      const slugMatch = href.match(/\/d\/([^/]+?)(?:-\d+)?\/?$/);
      const title = titleMatch
        ? titleMatch[1].trim()
        : slugMatch
          ? slugMatch[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Inserat";

      // Bild
      const imgMatch = context.match(/src="(https:\/\/[^"]*(?:willhaben|cache)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i);

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
