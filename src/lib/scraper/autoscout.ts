// AutoScout24.ch Scraper
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass
// AutoScout24.ch hat Cloudflare-Schutz und nutzt React Server Components

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class AutoScoutScraper extends BaseScraper {
  readonly platform = "autoscout";
  readonly displayName = "AutoScout24.ch";
  readonly baseUrl = "https://www.autoscout24.ch";

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const results: ScraperResult[] = [];

    try {
      const encodedQuery = encodeURIComponent(query);

      // AutoScout24.ch Such-URL: /de/autos mit Query-Parametern
      let searchUrl = `${this.baseUrl}/de/autos?q=${encodedQuery}`;
      if (options?.minPrice) {
        searchUrl += `&pricefrom=${Math.round(options.minPrice / 100)}`;
      }
      if (options?.maxPrice) {
        searchUrl += `&priceto=${Math.round(options.maxPrice / 100)}`;
      }

      console.log(`[AutoScout] Search URL: ${searchUrl}`);

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[AutoScout] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`AutoScout24.ch: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      console.log(`[AutoScout] HTML length: ${html.length}`);

      // Prüfe ob Cloudflare blockiert hat
      if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
        console.warn("[AutoScout] Cloudflare challenge detected — scraping blocked");
        return results;
      }

      // Prüfe ob Seite "nicht gefunden" zeigt
      if (html.includes("Die Seite konnte nicht gefunden werden")) {
        console.warn("[AutoScout] Page not found — URL may be incorrect");
        return results;
      }

      // Methode 1: JSON-LD structured data
      const jsonLdResults = this.parseJsonLd(html, searchUrl, options);
      if (jsonLdResults.length > 0) {
        console.log(`[AutoScout] JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 2: __NEXT_DATA__ oder React Server Components data
      const nextDataResults = this.parseNextData(html, options);
      if (nextDataResults.length > 0) {
        console.log(`[AutoScout] Next data parsed: ${nextDataResults.length} results`);
        return nextDataResults;
      }

      // Methode 3: React Server Component chunks (self.__next_f)
      const rscResults = this.parseReactServerChunks(html, options);
      if (rscResults.length > 0) {
        console.log(`[AutoScout] RSC parsed: ${rscResults.length} results`);
        return rscResults;
      }

      // Methode 4: HTML-Pattern-Matching
      const htmlResults = this.parseHtmlListings(html, searchUrl, options);
      if (htmlResults.length > 0) {
        console.log(`[AutoScout] HTML parsing: ${htmlResults.length} results`);
        return htmlResults;
      }

      // Methode 5: Generischer Fallback
      const fallbackResults = this.parseFallback(html, searchUrl, options);
      console.log(`[AutoScout] Fallback: ${fallbackResults.length} results`);
      return fallbackResults;
    } catch (error) {
      console.error("AutoScout24.ch Scraper error:", error);
    }

    return results;
  }

  /**
   * Parse JSON-LD structured data
   */
  private parseJsonLd(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    const jsonLdMatches = html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi
    );

    for (const jsonMatch of jsonLdMatches) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);

        // ItemList mit verschachtelten Einträgen
        if (jsonData?.itemListElement) {
          for (const entry of jsonData.itemListElement) {
            const offer = entry?.item || entry;
            const result = this.extractFromJsonLd(offer, searchUrl, options);
            if (result) {
              results.push(result);
              if (options?.limit && results.length >= options.limit) return results;
            }
          }
        }

        // Einzelnes Fahrzeug/Produkt
        if (
          jsonData?.["@type"] === "Car" ||
          jsonData?.["@type"] === "Vehicle" ||
          jsonData?.["@type"] === "Product"
        ) {
          const result = this.extractFromJsonLd(jsonData, searchUrl, options);
          if (result) {
            results.push(result);
            if (options?.limit && results.length >= options.limit) return results;
          }
        }

        // Array von Objekten
        if (Array.isArray(jsonData)) {
          for (const item of jsonData) {
            const result = this.extractFromJsonLd(item, searchUrl, options);
            if (result) {
              results.push(result);
              if (options?.limit && results.length >= options.limit) return results;
            }
          }
        }
      } catch {
        // JSON-LD parse error — skip
      }
    }

    return results;
  }

  private extractFromJsonLd(
    item: Record<string, unknown>,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult | null {
    if (!item || typeof item !== "object") return null;

    const title = (item.name as string) || (item.description as string) || "";
    if (!title) return null;

    const priceRaw =
      (item.offers as Record<string, unknown>)?.price ||
      item.price ||
      0;
    const price = Math.round(parseFloat(String(priceRaw)) * 100);
    if (isNaN(price) || price <= 0) return null;

    if (options?.minPrice && price < options.minPrice) return null;
    if (options?.maxPrice && price > options.maxPrice) return null;

    const itemUrl =
      (item.url as string) ||
      ((item.offers as Record<string, unknown>)?.url as string) ||
      searchUrl;

    const imageUrl =
      typeof item.image === "string"
        ? item.image
        : typeof item.image === "object" && item.image !== null
          ? ((item.image as Record<string, unknown>).url as string)
          : null;

    return {
      title,
      price,
      url: itemUrl.startsWith("http") ? itemUrl : `${this.baseUrl}${itemUrl}`,
      imageUrl,
      platform: this.platform,
      scrapedAt: new Date(),
    };
  }

  /**
   * Parse __NEXT_DATA__ JSON
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (!match) return results;

    try {
      const data = JSON.parse(match[1]);
      const pageProps = data?.props?.pageProps || {};

      // Suche nach Listings in verschiedenen Pfaden
      const possibleArrays = [
        pageProps?.listings,
        pageProps?.searchResult?.listings,
        pageProps?.searchResult?.items,
        pageProps?.vehicles,
        pageProps?.results,
        pageProps?.data?.results,
      ];

      for (const arr of possibleArrays) {
        if (!Array.isArray(arr) || arr.length === 0) continue;

        for (const item of arr) {
          const title =
            (item.title as string) ||
            (item.name as string) ||
            (item.makeModel as string) ||
            "";
          if (!title) continue;

          const priceRaw = item.price || item.listPrice || item.salesPrice || 0;
          const price = Math.round(parseFloat(String(priceRaw)) * 100);
          if (isNaN(price) || price <= 0) continue;

          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          const detailUrl = item.url || item.detailUrl || item.link || "";
          const url = detailUrl
            ? detailUrl.startsWith("http")
              ? detailUrl
              : `${this.baseUrl}${detailUrl}`
            : `${this.baseUrl}/de/autos`;

          results.push({
            title,
            price,
            url,
            imageUrl: (item.imageUrl as string) || (item.mainImage as string) || null,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) return results;
        }

        if (results.length > 0) return results;
      }
    } catch {
      // Parse error
    }

    return results;
  }

  /**
   * Parse React Server Component chunks
   * AutoScout24.ch nutzt RSC mit self.__next_f push() Aufrufen
   */
  private parseReactServerChunks(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach __next_f push Aufrufen die JSON enthalten
    const chunkRegex = /self\.__next_f\.push\(\[[\d,]+,"([\s\S]*?)"\]\)/g;
    let chunkMatch;

    while ((chunkMatch = chunkRegex.exec(html)) !== null) {
      const chunk = chunkMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      // Suche nach JSON-Objekten mit Fahrzeug-Daten
      const jsonMatches = chunk.matchAll(/\{[^{}]*"(?:title|name|makeModel)"[^{}]*"(?:price|listPrice)"[^{}]*\}/g);
      for (const jsonMatch of jsonMatches) {
        try {
          const item = JSON.parse(jsonMatch[0]);
          const title = item.title || item.name || item.makeModel || "";
          const priceRaw = item.price || item.listPrice || 0;
          const price = Math.round(parseFloat(String(priceRaw)) * 100);

          if (!title || isNaN(price) || price <= 0) continue;
          if (options?.minPrice && price < options.minPrice) continue;
          if (options?.maxPrice && price > options.maxPrice) continue;

          results.push({
            title,
            price,
            url: item.url
              ? item.url.startsWith("http")
                ? item.url
                : `${this.baseUrl}${item.url}`
              : `${this.baseUrl}/de/autos`,
            imageUrl: item.imageUrl || item.image || null,
            platform: this.platform,
            scrapedAt: new Date(),
          });

          if (options?.limit && results.length >= options.limit) return results;
        } catch {
          // Not valid JSON
        }
      }
    }

    return results;
  }

  /**
   * HTML-Pattern-Matching für Listing-Cards
   */
  private parseHtmlListings(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach Links zu Detail-Seiten mit /de/d/ (AutoScout Detail-URL-Pattern)
    const detailLinkRegex =
      /<a[^>]*href="(\/de\/d\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    const seenUrls = new Set<string>();

    while ((linkMatch = detailLinkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      if (seenUrls.has(href)) continue;
      seenUrls.add(href);

      const content = linkMatch[2];

      // Preis suchen
      const priceMatch =
        content.match(/(?:CHF|Fr\.?)\s*([\d',.]+)/i) ||
        content.match(/([\d',.]+)\s*(?:CHF|Fr\.?)/i);
      if (!priceMatch) continue;

      const priceStr = priceMatch[1].replace(/[',]/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price <= 0) continue;

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Titel: Text-Content des Links, bereinigt
      const textContent = content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const title = textContent.split(/(?:CHF|Fr\.?)/i)[0]?.trim() || textContent.substring(0, 100);

      const imgMatch = content.match(
        /src="(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)"/i
      );

      results.push({
        title: title || "Fahrzeug",
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
   * Generischer Fallback mit CHF-Preis-Suche
   */
  private parseFallback(
    html: string,
    searchUrl: string,
    options?: ScraperOptions
  ): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Suche nach CHF-Preisen im HTML
    const priceRegex = /(?:CHF|Fr\.?)\s*([\d',.]+)/gi;
    let priceMatch;

    while ((priceMatch = priceRegex.exec(html)) !== null) {
      const priceStr = priceMatch[1].replace(/[',]/g, "");
      const price = Math.round(parseFloat(priceStr) * 100);
      if (isNaN(price) || price <= 0) continue;

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      // Suche in der Umgebung nach einem Link
      const context = html.substring(
        Math.max(0, priceMatch.index - 500),
        priceMatch.index + 200
      );
      const linkMatch = context.match(/href="(\/de\/d\/[^"]+)"/);
      if (!linkMatch) continue;

      // Titel aus dem Link-Kontext
      const titleMatch = context.match(/>([^<]{5,80})</);

      results.push({
        title: titleMatch ? titleMatch[1].trim() : "Fahrzeug",
        price,
        url: `${this.baseUrl}${linkMatch[1]}`,
        imageUrl: null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
