// eBay Kleinanzeigen Scraper (kleinanzeigen.de)
// Nutzt Puppeteer (headless Browser) mit Proxy für Anti-Bot-Bypass

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";

export class EbayKleinanzeigenScraper extends BaseScraper {
  readonly platform = "ebay-ka";
  readonly displayName = "eBay Kleinanzeigen";
  readonly baseUrl = "https://www.kleinanzeigen.de";

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
      // URL-Encoding: Leerzeichen → Bindestrich für Kleinanzeigen URL-Format
      const urlQuery = enrichedQuery.trim().replace(/\s+/g, "-");

      // Kleinanzeigen.de URL-Format:
      // Basis: /s-[kategorie/][preis:MIN:MAX/]suchbegriff/k0
      // Kategorie: /s-autos/ für Autos, /s-motorraeder/ für Motorräder
      // Preis: /s-preis:MIN:MAX/ (EUR!)
      // Hinweis: km/Baujahr werden über UI-Filter gesteuert, NICHT als URL-Parameter.
      // Die Filterung nach Baujahr/KM erfolgt daher über die KI-Nachfilterung.
      let categoryPrefix = "";
      if (options?.category === "Fahrzeuge") {
        if (options?.subcategory === "Motorräder") {
          categoryPrefix = "motorraeder/";
        } else {
          categoryPrefix = "autos/";
        }
      } else if (options?.category === "Immobilien") {
        if (options?.propertyOffer === "miete") {
          categoryPrefix = "wohnung-mieten/";
        } else if (options?.propertyOffer === "kauf") {
          categoryPrefix = "wohnung-kaufen/";
        } else {
          categoryPrefix = "immobilien/";
        }
      } else if (options?.category === "Möbel" || options?.category === "Haushalt") {
        // Normale Möbel/Haushalt-Suche — Suchbegriff + Preisfilter reichen
        // Keine spezielle Kategorie-Prefix, Kleinanzeigen findet Möbel über den Suchbegriff
        categoryPrefix = "";
      }

      let searchUrl: string;
      // CHF → EUR Umrechnung (1 CHF ≈ 1.04 EUR, vereinfacht 1:1)
      const minEUR = options?.minPrice ? Math.round(options.minPrice / 100) : "";
      const maxEUR = options?.maxPrice ? Math.round(options.maxPrice / 100) : "";

      if (minEUR || maxEUR) {
        searchUrl = `${this.baseUrl}/s-${categoryPrefix}preis:${minEUR}:${maxEUR}/${urlQuery}/k0`;
      } else {
        searchUrl = `${this.baseUrl}/s-${categoryPrefix}${urlQuery}/k0`;
      }

      console.log(`[eBay KA] Search URL: ${searchUrl}`);

      // Puppeteer-First, Fallback auf fetchWithHeaders
      let html: string;
      try {
        html = await this.fetchWithBrowser(searchUrl);
      } catch (browserError) {
        console.warn(`[eBay KA] Puppeteer failed, falling back to HTTP fetch:`, browserError);
        const response = await this.fetchWithHeaders(searchUrl);
        if (!response.ok) {
          console.error(`eBay KA: HTTP ${response.status} für "${query}"`);
          return results;
        }
        html = await response.text();
      }

      console.log(`[eBay KA] HTML length: ${html.length}`);

      // Methode 1: JSON-LD aus den Artikeln parsen (jeder Artikel hat eigenes JSON-LD)
      const jsonLdResults = this.parseJsonLd(html, searchUrl, options);
      if (jsonLdResults.length > 0) {
        console.log(`[eBay KA] JSON-LD parsed: ${jsonLdResults.length} results`);
        return jsonLdResults;
      }

      // Methode 2: HTML-Parsing der article.aditem Elemente
      const articleResults = this.parseArticles(html, options);
      if (articleResults.length > 0) {
        console.log(`[eBay KA] Article parsing: ${articleResults.length} results`);
        return articleResults;
      }

      // Methode 3: Fallback-Regex
      const fallbackResults = this.parseFallback(html, searchUrl, options);
      console.log(`[eBay KA] Fallback parsing: ${fallbackResults.length} results`);

      if (fallbackResults.length === 0) {
        console.warn(`[eBay KA] ⚠️ Keine Ergebnisse aus allen 3 Parse-Methoden. HTML-Snippet (erste 500 Zeichen): ${html.substring(0, 500)}`);
      }

      return fallbackResults;
    } catch (error) {
      const reason = error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
      console.error(`[eBay KA] ❌ Scraper-Fehler: ${reason}`);
      if (error instanceof Error && error.message.includes("timeout")) {
        console.error("[eBay KA] → Timeout: Seite hat zu lange geladen. Puppeteer-Timeout erhöhen oder Proxy prüfen.");
      }
      if (error instanceof Error && error.message.includes("net::ERR_")) {
        console.error("[eBay KA] → Netzwerk-Fehler: Proxy möglicherweise down oder blockiert.");
      }
    }

    return results;
  }

  /**
   * Parse JSON-LD Blöcke in den Artikeln
   * Jeder Artikel hat ein <script type="application/ld+json"> mit ImageObject
   */
  private parseJsonLd(html: string, searchUrl: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Finde alle article-Blöcke mit data-href und JSON-LD
    const articleRegex = /<article[^>]*data-adid="(\d+)"[^>]*data-href="([^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
    let articleMatch;

    while ((articleMatch = articleRegex.exec(html)) !== null) {
      const dataHref = articleMatch[2];
      const articleHtml = articleMatch[3];

      // JSON-LD extrahieren
      const jsonLdMatch = articleHtml.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
      if (!jsonLdMatch) continue;

      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd["@type"] !== "ImageObject") continue;

        const title = jsonLd.title || "";
        if (!title) continue;

        // Preis aus dem article HTML extrahieren
        const priceMatch = articleHtml.match(
          /class="aditem-main--middle--price-shipping--price"[^>]*>\s*([\d.,]+)\s*€/i
        );
        if (!priceMatch) continue;

        const priceStr = priceMatch[1].replace(/\./g, "").replace(",", ".");
        const priceEUR = parseFloat(priceStr);
        if (isNaN(priceEUR)) continue;

        // EUR → CHF Rappen (1 EUR ≈ 0.96 CHF)
        const price = Math.round(priceEUR * 0.96 * 100);

        // Preisfilter
        if (options?.minPrice && price < options.minPrice) continue;
        if (options?.maxPrice && price > options.maxPrice) continue;

        const url = dataHref
          ? `${this.baseUrl}${dataHref}`
          : searchUrl;

        const imageUrl = jsonLd.contentUrl || null;

        // Beschreibung aus dem article-HTML extrahieren
        const descMatch = articleHtml.match(
          /class="aditem-main--middle--description"[^>]*>\s*([^<]+)/i
        );
        const description = descMatch ? descMatch[1].trim() : undefined;

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
      } catch {
        // JSON parse error — skip this article
      }
    }

    return results;
  }

  /**
   * Parse article.aditem Elemente direkt aus dem HTML
   */
  private parseArticles(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const articleRegex = /<article[^>]*class="aditem"[^>]*data-href="([^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;
    let match;

    while ((match = articleRegex.exec(html)) !== null) {
      const dataHref = match[1];
      const articleHtml = match[2];

      // Titel: <a class="ellipsis" href="...">TITEL</a>
      const titleMatch = articleHtml.match(/<a\s+class="ellipsis"[^>]*>([^<]+)<\/a>/i);
      if (!titleMatch) continue;
      const title = titleMatch[1].trim();

      // Preis: <p class="aditem-main--middle--price-shipping--price">1.799 € VB</p>
      const priceMatch = articleHtml.match(
        /class="aditem-main--middle--price-shipping--price"[^>]*>\s*([\d.,]+)\s*€/i
      );
      if (!priceMatch) continue;

      const priceStr = priceMatch[1].replace(/\./g, "").replace(",", ".");
      const priceEUR = parseFloat(priceStr);
      if (isNaN(priceEUR)) continue;

      // EUR → CHF Rappen
      const price = Math.round(priceEUR * 0.96 * 100);

      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      const url = dataHref
        ? `${this.baseUrl}${dataHref}`
        : `${this.baseUrl}/s-anzeige/${title.toLowerCase().replace(/\s+/g, "-")}`;

      // Bild: <img src="https://img.kleinanzeigen.de/...">
      const imgMatch = articleHtml.match(/src="(https:\/\/img\.kleinanzeigen\.de[^"]+)"/i);
      const imageUrl = imgMatch ? imgMatch[1] : null;

      // Beschreibung
      const descMatch = articleHtml.match(
        /class="aditem-main--middle--description"[^>]*>\s*([^<]+)/i
      );
      const description = descMatch ? descMatch[1].trim() : undefined;

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

    return results;
  }

  /**
   * Fallback: Einfaches Regex-Parsing
   */
  private parseFallback(html: string, searchUrl: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Alle Titel aus ellipsis-Links
    const titleRegex = /<a\s+class="ellipsis"[^>]*>([^<]+)<\/a>/gi;
    // Alle Preise
    const priceRegex = /class="aditem-main--middle--price-shipping--price"[^>]*>\s*([\d.,]+)\s*€/gi;
    // Alle Anzeigen-Links
    const hrefRegex = /data-href="(\/s-anzeige\/[^"]+)"/gi;
    // Alle Bilder
    const imgRegex = /src="(https:\/\/img\.kleinanzeigen\.de[^"]+)"/gi;

    const titles: string[] = [];
    const prices: number[] = [];
    const urls: string[] = [];
    const images: string[] = [];

    let m;
    while ((m = titleRegex.exec(html)) !== null) {
      titles.push(m[1].trim());
    }
    while ((m = priceRegex.exec(html)) !== null) {
      const priceStr = m[1].replace(/\./g, "").replace(",", ".");
      prices.push(Math.round(parseFloat(priceStr) * 0.96 * 100));
    }
    while ((m = hrefRegex.exec(html)) !== null) {
      urls.push(m[1]);
    }
    while ((m = imgRegex.exec(html)) !== null) {
      images.push(m[1]);
    }

    const count = Math.min(titles.length, prices.length);
    for (let i = 0; i < count; i++) {
      const price = prices[i];
      if (options?.minPrice && price < options.minPrice) continue;
      if (options?.maxPrice && price > options.maxPrice) continue;

      results.push({
        title: titles[i],
        price,
        url: urls[i] ? `${this.baseUrl}${urls[i]}` : searchUrl,
        imageUrl: images[i] || null,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    return results;
  }
}
