// Tutti.ch Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass
// Tutti.ch hat Cloudflare-Schutz — braucht echten Browser mit Proxy

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class TuttiScraper extends BaseScraper {
  readonly platform = "tutti";
  readonly displayName = "Tutti.ch";
  readonly baseUrl = "https://www.tutti.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // Tutti.ch Such-URL mit optionalem Preisfilter
      let searchUrl = `${this.baseUrl}/de/ganze-schweiz?q=${encodedQuery}`;
      if (options?.maxPrice) {
        searchUrl += `&price_to=${Math.round(options.maxPrice / 100)}`;
      }
      if (options?.minPrice) {
        searchUrl += `&price_from=${Math.round(options.minPrice / 100)}`;
      }

      console.log(`[Tutti] Search URL: ${searchUrl}`);

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[Tutti] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`Tutti.ch: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      console.log(`[Tutti] HTML length: ${html.length}`);

      // Prüfe ob Cloudflare blockiert hat
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[Tutti] ⚠️ Cloudflare-Challenge erkannt — Scraping blockiert. Proxy wechseln oder Browser-Fingerprint anpassen.");
        return results;
      }

      // Prüfe auf leere/minimale Seite (Bot-Schutz ohne explizites Cloudflare)
      if (html.length < 1000) {
        console.warn(`[Tutti] ⚠️ Sehr kurze Antwort (${html.length} Bytes) — wahrscheinlich Bot-Schutz oder Redirect`);
        return results;
      }

      // Methode 1: __NEXT_DATA__ JSON parsen (Tutti nutzt Next.js)
      const nextDataResults = this.parseNextData(html, options);
      if (nextDataResults.length > 0) {
        console.log(`[Tutti] __NEXT_DATA__ parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 2: Window.__INITIAL_DATA__ oder andere JSON-Blöcke
      const initialDataResults = this.parseInitialData(html, options);
      if (initialDataResults.length > 0) {
        console.log(`[Tutti] Initial data parsed: ${initialDataResults.length} results`);
        return initialDataResults;
      }

      // Methode 3: HTML-Pattern-Matching (React-gerenderte Karten)
      const htmlResults = this.parseHtmlCards(html, options);
      if (htmlResults.length > 0) {
        console.log(`[Tutti] HTML card parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      // Methode 4: Generischer Fallback
      const fallbackResults = this.parseFallback(html, searchUrl, options);
      console.log(`[Tutti] Fallback parsing: ${fallbackResults.length} results`);

      if (fallbackResults.length === 0) {
        console.warn(`[Tutti] ⚠️ Keine Ergebnisse aus allen 4 Parse-Methoden. HTML-Snippet (erste 500 Zeichen): ${html.substring(0, 500)}`);
      }

      return fallbackResults;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[Tutti] ❌ Scraper-Fehler: ${reason}`);
      if (error instanceof Error && error.message.includes("timeout")) {
        console.error("[Tutti] → Timeout: Seite hat zu lange geladen. Puppeteer-Timeout erhöhen oder Proxy prüfen.");
      }
      if (error instanceof Error && error.message.includes("net::ERR_")) {
        console.error("[Tutti] → Netzwerk-Fehler: Proxy möglicherweise down oder blockiert.");
      }
    }

    return results;
  }

  /**
   * Parse __NEXT_DATA__ JSON aus dem HTML
   * Tutti.ch nutzt Next.js mit Server-Side Rendering
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([^]*?)<\/script>/
    );
    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps || {};

      // Verschiedene mögliche Pfade für Listings in der JSON-Struktur
      const possiblePaths = [
        pageProps?.listings,
        pageProps?.searchResult?.listings,
        pageProps?.searchResult?.items,
        pageProps?.initialData?.listings,
        pageProps?.data?.listings,
        pageProps?.results,
        pageProps?.ads,
        pageProps?.items,
      ];

      let listings: unknown[] = [];
      for (const path of possiblePaths) {
        if (Array.isArray(path) && path.length > 0) {
          listings = path;
          break;
        }
      }

      // Wenn keine Arrays gefunden, rekursiv nach Arrays mit title-Property suchen
      if (listings.length === 0) {
        listings = this.findListingsInObject(pageProps);
      }

      for (const listing of listings) {
        const item = listing as Record<string, unknown>;
        const title =
          (item.title as string) ||
          (item.subject as string) ||
          (item.name as string) ||
          "";
        if (!title) continue;

        // Preis extrahieren (verschiedene mögliche Felder)
        let priceRaw: number = 0;
        if (typeof item.price === "number") {
          priceRaw = item.price;
        } else if (typeof item.price === "object" && item.price !== null) {
          const priceObj = item.price as Record<string, unknown>;
          priceRaw = (priceObj.value as number) || (priceObj.amount as number) || 0;
        } else if (item.body && typeof item.body === "object") {
          const body = item.body as Record<string, unknown>;
          priceRaw = (body.price as number) || 0;
        }

        const price = Math.round(priceRaw * 100); // CHF → Rappen

        // Preisfilter
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        // URL
        let url: string;
        if (typeof item.link === "string") {
          url = item.link.startsWith("http") ? item.link : `${this.baseUrl}${item.link}`;
        } else if (typeof item.url === "string") {
          url = item.url.startsWith("http") ? item.url : `${this.baseUrl}${item.url}`;
        } else if (item.id) {
          url = `${this.baseUrl}/de/angebot/${item.id}`;
        } else {
          url = `${this.baseUrl}/de/ganze-schweiz?q=${encodeURIComponent(title)}`;
        }

        // Bild
        const imageUrl =
          (item.imageUrl as string) ||
          (item.thumbnailUrl as string) ||
          (typeof item.image === "object" && item.image !== null
            ? (item.image as Record<string, unknown>).url as string
            : typeof item.image === "string"
              ? item.image
              : null) ||
          null;

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
    } catch (parseError) {
      console.error("Tutti.ch: __NEXT_DATA__ parse error:", parseError);
    }

    return results;
  }

  /**
   * Rekursiv nach Arrays mit listing-artigen Objekten suchen
   */
  private findListingsInObject(obj: unknown, depth = 0): unknown[] {
    if (depth > 5 || !obj || typeof obj !== "object") return [];

    if (Array.isArray(obj)) {
      // Prüfe ob dieses Array listing-artige Objekte enthält
      if (
        obj.length > 0 &&
        typeof obj[0] === "object" &&
        obj[0] !== null
      ) {
        const first = obj[0] as Record<string, unknown>;
        if (first.title || first.subject || first.name) {
          return obj;
        }
      }
      return [];
    }

    for (const value of Object.values(obj as Record<string, unknown>)) {
      const found = this.findListingsInObject(value, depth + 1);
      if (found.length > 0) return found;
    }

    return [];
  }

  /**
   * Parse window.__INITIAL_DATA__ oder ähnliche JSON-Einbettungen
   */
  private parseInitialData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach verschiedenen JSON-Einbettungsmustern
    const patterns = [
      /window\.__INITIAL_DATA__\s*=\s*({[\s\S]*?});/,
      /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
      /window\.__DATA__\s*=\s*({[\s\S]*?});/,
      /<script[^>]*>window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});<\/script>/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (!match) continue;

      try {
        const data = JSON.parse(match[1]);
        const listings = this.findListingsInObject(data);

        for (const listing of listings) {
          const item = listing as Record<string, unknown>;
          const title = (item.title as string) || (item.subject as string) || "";
          if (!title) continue;

          const priceRaw =
            typeof item.price === "number"
              ? item.price
              : typeof item.price === "object" && item.price !== null
                ? ((item.price as Record<string, unknown>).value as number) || 0
                : 0;
          const price = Math.round(priceRaw * 100);

          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          results.push({
            title,
            price,
            url: `${this.baseUrl}/de/angebot/${item.id || ""}`,
            imageUrl: (item.imageUrl as string) || null,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) break;
        }

        if (results.length > 0) break;
      } catch {
        // Parse error — try next pattern
      }
    }

    return results;
  }

  /**
   * Parse HTML-Karten mit typischen CSS-Klassen
   */
  private parseHtmlCards(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach Links zu Inseraten mit Preis-Informationen
    // Tutti-Karten haben typischerweise href="/de/..." oder "/de/angebot/..."
    const cardRegex =
      /<a[^>]*href="(\/de\/[^"]*(?:angebot|inserat|anzeige)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let cardMatch;
    const seenUrls = new Set<string>();

    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const href = cardMatch[1];
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      const cardHtml = cardMatch[2];

      // Preis suchen: CHF gefolgt von Zahl, oder Zahl gefolgt von CHF/Fr.
      const priceMatch =
        cardHtml.match(/(?:CHF|Fr\.?)\s*([\d',.]+)/i) ||
        cardHtml.match(/([\d',.]+)\s*(?:CHF|Fr\.?)/i);
      if (!priceMatch) continue;

      const priceStr = priceMatch[1].replace(/[',]/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price)) continue;

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Titel: längster Textknoten oder aus aria-label
      const textParts = cardHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const title = textParts.split(/\s{2,}/)[0]?.trim() || textParts.substring(0, 100);

      // Bild
      const imgMatch = cardHtml.match(/src="(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/i);

      results.push({
        title: title || "Inserat",
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
   * Generischer Fallback: Suche nach Preis-Mustern im gesamten HTML
   */
  private parseFallback(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach CHF-Preisen und nahen Texten
    const priceBlockRegex =
      /(?:<[^>]+>)*\s*(?:CHF|Fr\.?)\s*([\d',.]+)\s*(?:<[^>]+>)*/gi;
    let priceMatch;
    const foundPrices: Array<{ price: number; index: number }> = [];

    while ((priceMatch = priceBlockRegex.exec(html)) !== null) {
      const priceStr = priceMatch[1].replace(/[',]/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (!isNaN(price) && price > 0) {
        foundPrices.push({ price, index: priceMatch.index });
      }
    }

    // Für jeden Preis den nächsten Link und Titel suchen
    for (const { price, index } of foundPrices) {
      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Suche in der Umgebung (500 Zeichen davor) nach Links
      const context = html.substring(Math.max(0, index - 500), index + 200);
      const linkMatch = context.match(/href="(\/de\/[^"]*)"[^>]*>([^<]+)/);

      if (linkMatch) {
        results.push({
          title: linkMatch[2].trim() || "Inserat",
          price,
          url: `${this.baseUrl}${linkMatch[1]}`,
          imageUrl: null,
          platform: this.platform,
          scrapedAt: new Date(),
        });

        if (options?.limit && results.length >= options.limit) break;
      }
    }

    return results;
  }
}
