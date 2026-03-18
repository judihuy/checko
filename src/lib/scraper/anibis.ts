// Anibis.ch Scraper — HTTP-Fetch mit FlareSolverr-Fallback
// Primär: HTTP-Fetch mit Proxy + Browser-Headers
// Fallback: FlareSolverr bei 403/Cloudflare
// Letzter Fallback: Puppeteer + Stealth + CH Proxy

import { BaseScraper, ScraperResult, ScraperOptions } from "./base";
import { fetchViaFlareSolverr, isCloudflareChallenge, isFlareSolverrConfigured } from "./flaresolverr";
import { parseSwissPrice, parseSwissPriceRappen } from "./price-utils";

export class AnibisScraper extends BaseScraper {
  readonly platform = "anibis";
  readonly displayName = "Anibis.ch";
  readonly baseUrl = "https://www.anibis.ch";
  isWorking = true; // ✅ Reaktiviert mit FlareSolverr-Fallback

  async scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    // Methode 1 (PRIMÄR): HTTP-Fetch mit CH-Proxy + Browser-Headers
    try {
      const htmlResults = await this.scrapeViaHttp(query, options);
      if (htmlResults.length > 0) {
        console.log(`[Anibis] ✅ HTTP-Fetch: ${htmlResults.length} Ergebnisse`);
        return htmlResults;
      }
    } catch (error) {
      console.warn(
        `[Anibis] HTTP-Fetch fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Methode 2 (FALLBACK): FlareSolverr (Cloudflare-Bypass)
    if (isFlareSolverrConfigured()) {
      try {
        const flareResults = await this.scrapeViaFlareSolverr(query, options);
        if (flareResults.length > 0) {
          console.log(`[Anibis] ✅ FlareSolverr-Fallback: ${flareResults.length} Ergebnisse`);
          return flareResults;
        }
      } catch (error) {
        console.warn(
          `[Anibis] FlareSolverr-Fallback fehlgeschlagen:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Methode 3 (LETZTER FALLBACK): Puppeteer + Stealth + CH Proxy
    try {
      const browserResults = await this.scrapeViaBrowser(query, options);
      if (browserResults.length > 0) {
        console.log(`[Anibis] ✅ Browser-Fallback: ${browserResults.length} Ergebnisse`);
        return browserResults;
      }
    } catch (error) {
      console.warn(
        `[Anibis] Browser-Fallback fehlgeschlagen:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    console.warn(`[Anibis] ⚠️ Keine Ergebnisse aus allen Methoden`);
    return [];
  }

  /**
   * Build Anibis search URL with filters
   */
  private buildSearchUrl(query: string, options?: ScraperOptions): string {
    const encodedQuery = encodeURIComponent(query);
    // Anibis search URL format: /de/s/{query}
    let searchUrl = `${this.baseUrl}/de/s/${encodedQuery}`;

    const urlParams = new URLSearchParams();
    if (options?.minPrice) urlParams.set("pr", `${Math.round(options.minPrice / 100)}-`);
    if (options?.maxPrice) {
      const existing = urlParams.get("pr") || "";
      if (existing) {
        urlParams.set("pr", `${existing.replace("-", "")}-${Math.round(options.maxPrice / 100)}`);
      } else {
        urlParams.set("pr", `-${Math.round(options.maxPrice / 100)}`);
      }
    }
    urlParams.set("oa", "newest"); // Sort by newest

    const paramStr = urlParams.toString();
    if (paramStr) searchUrl += "?" + paramStr;

    return searchUrl;
  }

  /**
   * PRIMÄR: HTTP-Fetch mit CH-Proxy + Browser-Headers
   */
  private async scrapeViaHttp(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Anibis] HTTP-Fetch URL: ${searchUrl}`);

    const response = await this.fetchWithCountryHeaders(searchUrl, "ch");

    if (!response.ok) {
      if (isCloudflareChallenge(response.status)) {
        throw new Error(`Cloudflare-Challenge erkannt (HTTP ${response.status})`);
      }
      console.error(`[Anibis] HTTP: ${response.status}`);
      return [];
    }

    const html = await response.text();
    console.log(`[Anibis] HTML length: ${html.length}`);

    if (html.length < 1000 || isCloudflareChallenge(200, html)) {
      throw new Error("Cloudflare-Challenge oder kurze Antwort erkannt");
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * FlareSolverr-Fallback bei Cloudflare
   */
  private async scrapeViaFlareSolverr(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Anibis] FlareSolverr URL: ${searchUrl}`);

    const html = await fetchViaFlareSolverr(searchUrl, this.platform);

    if (html.length < 1000) {
      console.warn("[Anibis] ⚠️ Sehr kurze FlareSolverr-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Anibis] ⚠️ Cloudflare-Challenge trotz FlareSolverr");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * Browser-Fallback: Puppeteer + Stealth + CH Proxy
   */
  private async scrapeViaBrowser(query: string, options?: ScraperOptions): Promise<ScraperResult[]> {
    const searchUrl = this.buildSearchUrl(query, options);
    console.log(`[Anibis] Browser URL: ${searchUrl}`);

    const html = await this.fetchWithBrowserCountry(searchUrl, "ch");

    if (html.length < 1000) {
      console.warn("[Anibis] ⚠️ Sehr kurze Browser-Antwort");
      return [];
    }

    if (html.includes("Just a moment") || html.includes("cf_chl_opt")) {
      console.warn("[Anibis] ⚠️ Cloudflare-Challenge trotz Stealth-Browser");
      return [];
    }

    return this.parseAllFormats(html, options);
  }

  /**
   * Parse all formats with enhanced debugging:
   * JSON-LD → __NEXT_DATA__ (deep) → embedded JSON → HTML (broad patterns)
   */
  private parseAllFormats(html: string, options?: ScraperOptions): ScraperResult[] {
    // Debug: Log HTML indicators to understand content
    this.debugHtmlContent(html);

    let results = this.parseJsonLd(html, options);
    if (results.length > 0) return results;

    results = this.parseNextData(html, options);
    if (results.length > 0) return results;

    results = this.parseEmbeddedJson(html, options);
    if (results.length > 0) return results;

    results = this.parseHtmlListings(html, options);
    return results;
  }

  /**
   * Debug helper: Log what patterns exist in the HTML to help diagnose parsing
   */
  private debugHtmlContent(html: string): void {
    const hasNextData = html.includes('__NEXT_DATA__');
    const hasJsonLd = html.includes('application/ld+json');
    const hasDeD = /\/de\/d\//.test(html);
    const hasDeI = /\/de\/i\//.test(html);
    const hasCHF = /CHF|Fr\./i.test(html);
    const hasListingCard = /listing[-_]?card|ListingCard|data-testid/i.test(html);
    const hasAnibisImg = /img\.anibis|anibis.*\.(?:jpg|jpeg|png|webp)/i.test(html);
    const hasReactRoot = /id="__next"|id="root"|id="app"/i.test(html);
    const hasDataAttrs = /data-listing|data-ad|data-item/i.test(html);
    
    // Count <a> tags with detail-like hrefs
    const detailLinks = html.match(/href="\/de\/[di]\/[^"]+"/g) || [];

    // Look for embedded script tags with JSON (common in SSR apps)
    const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
    const jsonScripts = scriptTags.filter(s => 
      s.includes('"listings"') || s.includes('"searchResults"') || 
      s.includes('"adverts"') || s.includes('"items"') ||
      s.includes('"ads"') || s.includes('"results"')
    );
    
    console.log(`[Anibis] HTML Debug: __NEXT_DATA__=${hasNextData}, JSON-LD=${hasJsonLd}, ` +
      `/de/d/ links=${detailLinks.length}, /de/i/ links=${html.match(/href="\/de\/i\/[^"]+"/g)?.length || 0}, ` +
      `CHF=${hasCHF}, listing-card=${hasListingCard}, anibis-img=${hasAnibisImg}, ` +
      `react-root=${hasReactRoot}, data-attrs=${hasDataAttrs}, ` +
      `json-scripts=${jsonScripts.length}, total-scripts=${scriptTags.length}`);
    
    // Sample first detail link for debugging
    if (detailLinks.length > 0) {
      console.log(`[Anibis] Sample detail links: ${detailLinks.slice(0, 3).join(', ')}`);
    }
    
    // If no detail links at all, log a snippet of the HTML for diagnosis
    if (detailLinks.length === 0 && !hasNextData && !hasJsonLd) {
      // Log first 500 chars after <body> for debugging
      const bodyIdx = html.indexOf('<body');
      if (bodyIdx >= 0) {
        const snippet = html.substring(bodyIdx, bodyIdx + 500).replace(/\s+/g, ' ');
        console.log(`[Anibis] HTML snippet after <body>: ${snippet}`);
      }
    }
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
        const items = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        for (const jsonItem of items) {
          const graphs = jsonItem?.["@graph"] || [jsonItem];

          for (const graph of graphs) {
            // ItemList (primary expected format)
            if (graph?.["@type"] === "ItemList" && Array.isArray(graph?.itemListElement)) {
              for (const entry of graph.itemListElement) {
                const item = entry?.item || entry;
                if (!item?.name) continue;

                const parsed = this.parseJsonLdItem(item);
                if (!parsed) continue;
                if (!this.priceInRange(parsed.price, options)) continue;

                results.push({ ...parsed, platform: this.platform, scrapedAt: new Date() });
                if (options?.limit && results.length >= options.limit) break;
              }
              if (results.length > 0) break;
            }
            
            // Product / Offer type (alternative)
            if ((graph?.["@type"] === "Product" || graph?.["@type"] === "Offer") && graph?.name) {
              const parsed = this.parseJsonLdItem(graph);
              if (parsed && this.priceInRange(parsed.price, options)) {
                results.push({ ...parsed, platform: this.platform, scrapedAt: new Date() });
              }
            }
          }
          if (results.length > 0) break;
        }
        if (results.length > 0) break;
      } catch {
        // JSON parse error
      }
    }

    if (results.length > 0) {
      console.log(`[Anibis] JSON-LD: ${results.length} Ergebnisse`);
    }

    return results;
  }

  private parseJsonLdItem(item: Record<string, unknown>): Omit<ScraperResult, 'platform' | 'scrapedAt'> | null {
    const title = (item.name as string) || "";
    if (!title) return null;

    let priceRaw = 0;
    if (item.offers) {
      const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
      if (offers && typeof offers === 'object') {
        const o = offers as Record<string, unknown>;
        const val = o.price || o.lowPrice;
        priceRaw = parseSwissPrice(val as string | number);
      }
    }
    const price = parseSwissPriceRappen(priceRaw || 0);

    const url = (item.url as string) || "";
    const fullUrl = url.startsWith("http") ? url : url ? `${this.baseUrl}${url}` : this.baseUrl;

    let imageUrl: string | null = null;
    if (typeof item.image === "string") imageUrl = item.image;
    else if (Array.isArray(item.image) && typeof item.image[0] === "string") imageUrl = item.image[0];

    let listedAt: Date | null = null;
    const dateStr = item.datePosted || item.dateCreated || item.datePublished;
    if (dateStr) {
      const parsed = new Date(dateStr as string);
      if (!isNaN(parsed.getTime())) listedAt = parsed;
    }

    return {
      title: title.substring(0, 200),
      price,
      url: fullUrl,
      imageUrl,
      description: item.description ? String(item.description).substring(0, 500) : undefined,
      listedAt,
    };
  }

  /**
   * Parse __NEXT_DATA__ with deep path exploration.
   * Anibis (SMG) often nests data in various structures.
   */
  private parseNextData(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!nextDataMatch) return results;

    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const pageProps = nextData?.props?.pageProps;
      if (!pageProps) {
        console.log(`[Anibis] __NEXT_DATA__ vorhanden aber kein pageProps`);
        return results;
      }

      // Log available keys for debugging
      const keys = Object.keys(pageProps);
      console.log(`[Anibis] __NEXT_DATA__ pageProps keys: ${keys.join(', ')}`);

      // Deep search for listing arrays — try many known paths
      const listings = this.findListingsArray(pageProps);

      if (!listings || listings.length === 0) {
        console.log(`[Anibis] __NEXT_DATA__: Keine Listings-Array gefunden`);
        return results;
      }

      console.log(`[Anibis] __NEXT_DATA__: ${listings.length} Inserate gefunden`);

      for (const listing of listings) {
        if (!listing || typeof listing !== 'object') continue;
        const item = listing as Record<string, unknown>;

        const parsed = this.parseListingObject(item);
        if (!parsed) continue;
        if (!this.priceInRange(parsed.price, options)) continue;

        results.push({ ...parsed, platform: this.platform, scrapedAt: new Date() });
        if (options?.limit && results.length >= options.limit) break;
      }
    } catch (e) {
      console.warn(`[Anibis] __NEXT_DATA__ Parse-Fehler:`, e instanceof Error ? e.message : String(e));
    }

    if (results.length > 0) {
      console.log(`[Anibis] __NEXT_DATA__: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Deep search for a listings array in the pageProps object.
   * Tries many known paths used by Anibis / SMG platforms.
   */
  private findListingsArray(obj: Record<string, unknown>): unknown[] | null {
    // Direct known paths
    const directPaths: string[][] = [
      ['listings'],
      ['searchResults', 'listings'],
      ['searchResults', 'items'],
      ['searchResults', 'ads'],
      ['searchResults', 'adverts'],
      ['searchResult', 'listings'],
      ['searchResult', 'items'],
      ['searchResult', 'ads'],
      ['searchResult', 'advertSummaryList', 'advertSummary'],
      ['initialData', 'listings'],
      ['initialData', 'searchResults', 'listings'],
      ['data', 'listings'],
      ['data', 'searchResults', 'listings'],
      ['data', 'search', 'listings'],
      ['results'],
      ['ads'],
      ['adverts'],
      ['items'],
      ['search', 'listings'],
      ['search', 'results'],
      ['search', 'items'],
      ['search', 'ads'],
      ['dehydratedState', 'queries'],
    ];

    for (const path of directPaths) {
      const val = this.getNestedValue(obj, path);
      if (Array.isArray(val) && val.length > 0) {
        console.log(`[Anibis] Found listings at path: ${path.join('.')}`);
        return val;
      }
    }

    // React Query / TanStack Query dehydrated state (common in modern Next.js)
    const dehydrated = obj.dehydratedState as Record<string, unknown> | undefined;
    if (dehydrated?.queries && Array.isArray(dehydrated.queries)) {
      for (const query of dehydrated.queries as Array<Record<string, unknown>>) {
        const state = query.state as Record<string, unknown> | undefined;
        const data = state?.data as Record<string, unknown> | undefined;
        if (!data) continue;
        
        // Try to find listings in query data
        const found = this.findListingsInObject(data);
        if (found) {
          console.log(`[Anibis] Found listings in dehydratedState query`);
          return found;
        }
      }
    }

    // Recursive search for any array that looks like listings
    const found = this.findListingsInObject(obj);
    if (found) {
      console.log(`[Anibis] Found listings via recursive search`);
      return found;
    }

    return null;
  }

  /**
   * Recursively search an object for an array that looks like listings
   */
  private findListingsInObject(obj: unknown, depth: number = 0): unknown[] | null {
    if (depth > 6 || !obj || typeof obj !== 'object') return null;

    if (Array.isArray(obj)) {
      // Check if this array contains listing-like objects
      if (obj.length >= 1 && obj.length <= 200) {
        const first = obj[0];
        if (first && typeof first === 'object') {
          const keys = Object.keys(first as Record<string, unknown>);
          const looksLikeListing = keys.some(k => 
            /^(title|name|subject|headline)$/i.test(k)
          ) && keys.some(k => 
            /^(price|sellPrice|cost|amount|id|listingId|adId|url|href|slug|seoUrl)$/i.test(k)
          );
          if (looksLikeListing) return obj;
        }
      }
      return null;
    }

    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      // Prioritize keys that likely contain listings
      if (/listing|item|result|ad|advert|search|data|content/i.test(key)) {
        const found = this.findListingsInObject(record[key], depth + 1);
        if (found) return found;
      }
    }
    // Second pass for other keys
    for (const key of Object.keys(record)) {
      if (!/listing|item|result|ad|advert|search|data|content/i.test(key)) {
        const found = this.findListingsInObject(record[key], depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
    let current: unknown = obj;
    for (const key of path) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  /**
   * Parse a single listing object from __NEXT_DATA__ or embedded JSON.
   * Handles many different field naming conventions.
   */
  private parseListingObject(item: Record<string, unknown>): Omit<ScraperResult, 'platform' | 'scrapedAt'> | null {
    // Title — try many field names
    const title = String(
      item.title || item.name || item.subject || item.headline || 
      item.description || item.label || ""
    ).trim();
    if (!title || title.length < 2) return null;

    // Price — try many field names and formats
    let priceRaw = 0;
    const priceFields = [
      item.price, item.sellPrice, item.salePrice, item.currentPrice,
      item.amount, item.cost, item.priceValue,
    ];
    for (const pf of priceFields) {
      if (pf !== undefined && pf !== null) {
        if (typeof pf === 'number') { priceRaw = pf; break; }
        if (typeof pf === 'string') {
          const v = parseSwissPrice(pf);
          if (v > 0) { priceRaw = v; break; }
        }
        if (typeof pf === 'object') {
          const po = pf as Record<string, unknown>;
          const val = po.value || po.amount || po.raw || po.display;
          const v = parseSwissPrice(val as string | number);
          if (v > 0) { priceRaw = v; break; }
        }
      }
    }
    // Attributes array (common in SMG platforms)
    if (priceRaw <= 0 && Array.isArray(item.attributes)) {
      for (const attr of item.attributes as Array<Record<string, unknown>>) {
        const name = String(attr.name || attr.key || '').toUpperCase();
        if (name.includes('PRICE') && Array.isArray(attr.values) && (attr.values as string[]).length > 0) {
          const v = parseSwissPrice(String((attr.values as string[])[0]));
          if (v > 0) { priceRaw = v; break; }
        }
      }
    }

    const price = parseSwissPriceRappen(priceRaw || 0);

    // URL
    const listingId = item.id || item.listingId || item.adId || item.advertId || "";
    const slug = item.slug || item.seoUrl || item.canonicalUrl || item.detailUrl || "";
    const rawUrl = item.url || item.href || item.link || "";
    
    let listingUrl: string;
    if (typeof rawUrl === 'string' && rawUrl.includes('/de/')) {
      listingUrl = rawUrl.startsWith('http') ? rawUrl : `${this.baseUrl}${rawUrl}`;
    } else if (typeof slug === 'string' && slug) {
      listingUrl = slug.startsWith('http') ? slug : `${this.baseUrl}${slug.startsWith('/') ? slug : '/' + slug}`;
    } else if (listingId) {
      listingUrl = `${this.baseUrl}/de/d/${listingId}`;
    } else {
      listingUrl = this.baseUrl;
    }

    // Image
    let imageUrl: string | null = null;
    if (typeof item.image === "string" && item.image.startsWith("http")) imageUrl = item.image;
    else if (typeof item.imageUrl === "string" && item.imageUrl.startsWith("http")) imageUrl = item.imageUrl;
    else if (typeof item.thumbnailUrl === "string" && item.thumbnailUrl.startsWith("http")) imageUrl = item.thumbnailUrl;
    else if (Array.isArray(item.images) && item.images.length > 0) {
      const first = item.images[0];
      imageUrl = typeof first === "string" ? first : (first as Record<string, unknown>)?.url as string || null;
    } else if (item.media && typeof item.media === 'object') {
      const media = Array.isArray(item.media) ? item.media[0] : item.media;
      if (media && typeof media === 'object') {
        const m = media as Record<string, unknown>;
        imageUrl = (m.url || m.src || m.thumbnailUrl || m.imageUrl) as string || null;
      }
    }
    if (imageUrl && !imageUrl.startsWith('http')) imageUrl = null;

    // Date
    let listedAt: Date | null = null;
    const dateStr = item.createdAt || item.publishDate || item.timestamp || item.date || 
                    item.datePosted || item.dateCreated || item.modifiedAt;
    if (dateStr) {
      const parsed = new Date(String(dateStr));
      if (!isNaN(parsed.getTime())) listedAt = parsed;
    }

    // Description
    const desc = item.body || item.text || item.content || 
                 (item.description !== item.title ? item.description : undefined);
    const description = desc ? String(desc).substring(0, 500) : undefined;

    return {
      title: title.substring(0, 200),
      price,
      url: listingUrl,
      imageUrl,
      description,
      listedAt,
    };
  }

  /**
   * Parse embedded JSON in script tags (not __NEXT_DATA__ or JSON-LD).
   * Modern React SSR apps often embed search data in script tags.
   */
  private parseEmbeddedJson(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];

    // Look for script tags that might contain listing data
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;

    while ((scriptMatch = scriptRegex.exec(html)) !== null) {
      const content = scriptMatch[1];
      // Skip known non-data scripts
      if (content.length < 100 || content.length > 500000) continue;
      if (content.includes('function') && !content.includes('"listings"')) continue;
      
      // Look for JSON-like content with listing indicators
      const hasListingData = /["'](?:listings|searchResults|items|ads|adverts)["']\s*:/i.test(content);
      if (!hasListingData) continue;

      // Try to extract JSON from assignments like: window.__DATA__ = {...}
      const jsonPatterns = [
        /(?:window\.__\w+__|self\.__\w+__)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/,
        /(?:window\.\w+|self\.\w+)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/,
        /^\s*(\{[\s\S]*\})\s*;?\s*$/,
        /JSON\.parse\('([\s\S]+?)'\)/,
      ];

      for (const pattern of jsonPatterns) {
        const jsonMatch = content.match(pattern);
        if (!jsonMatch) continue;

        try {
          let jsonStr = jsonMatch[1];
          // Handle JSON.parse with escaped strings
          if (pattern.source.includes('JSON.parse')) {
            jsonStr = jsonStr.replace(/\\'/g, "'").replace(/\\"/g, '"');
          }
          const data = JSON.parse(jsonStr);
          
          if (typeof data === 'object' && data !== null) {
            const listings = this.findListingsInObject(data);
            if (listings && listings.length > 0) {
              console.log(`[Anibis] Embedded JSON: ${listings.length} Inserate gefunden`);
              for (const listing of listings) {
                if (!listing || typeof listing !== 'object') continue;
                const parsed = this.parseListingObject(listing as Record<string, unknown>);
                if (!parsed) continue;
                if (!this.priceInRange(parsed.price, options)) continue;
                results.push({ ...parsed, platform: this.platform, scrapedAt: new Date() });
                if (options?.limit && results.length >= options.limit) break;
              }
              if (results.length > 0) break;
            }
          }
        } catch {
          // JSON parse error — try next pattern
        }
      }
      if (results.length > 0) break;
    }

    if (results.length > 0) {
      console.log(`[Anibis] Embedded JSON: ${results.length} Ergebnisse`);
    }
    return results;
  }

  /**
   * Parse listing links and prices from rendered HTML.
   * Broadened patterns to catch more Anibis URL formats.
   */
  private parseHtmlListings(html: string, options?: ScraperOptions): ScraperResult[] {
    const results: ScraperResult[] = [];
    const seenUrls = new Set<string>();

    // Anibis listing links: /de/d/{slug} or /de/i/{slug} or /de/d/-{id} etc.
    // Also match links like /de/d/some-title--1234
    const linkRegex = /href="(\/de\/[di]\/[^"]+)"/g;
    let linkMatch;

    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1];
      // Skip non-listing links (categories, filters, etc.)
      if (href.includes('/de/d/c/') || href.includes('/de/d/k/')) continue;
      
      const normalized = href.replace(/\/$/, '');
      if (seenUrls.has(normalized)) continue;
      seenUrls.add(normalized);

      // Wider context window for finding title/price
      const start = Math.max(0, linkMatch.index - 800);
      const end = Math.min(html.length, linkMatch.index + 800);
      const context = html.substring(start, end);

      // Title — try multiple patterns
      let title = "";
      
      // Pattern 1: aria-label or title attribute on the link itself
      const ariaMatch = context.match(new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*(?:aria-label|title)="([^"]+)"`));
      if (ariaMatch) title = ariaMatch[1];
      
      // Pattern 2: aria-label / title on parent elements
      if (!title) {
        const titleAttr = context.match(/(?:aria-label|title)="([^"]{5,150})"/);
        if (titleAttr && !titleAttr[1].includes('anibis') && !titleAttr[1].includes('Suche')) {
          title = titleAttr[1];
        }
      }
      
      // Pattern 3: Text content near the link (heading or paragraph)
      if (!title) {
        const headingMatch = context.match(/<(?:h[1-6]|strong|b)[^>]*>([^<]{3,120})<\/(?:h[1-6]|strong|b)>/i);
        if (headingMatch) title = headingMatch[1].trim();
      }
      
      // Pattern 4: Any text content between tags
      if (!title) {
        const textMatch = context.match(/>([^<]{5,120})</);
        if (textMatch) {
          const candidate = textMatch[1].trim();
          // Filter out navigation/UI text
          if (!/^(Suche|Kategorie|Filter|Sortier|Anzeige|Seite|von|bis|CHF|Fr\.)/.test(candidate)) {
            title = candidate;
          }
        }
      }

      // Pattern 5: Extract from slug as last resort
      if (!title) {
        const slugMatch = href.match(/\/de\/[di]\/([^?]+)/);
        if (slugMatch) {
          const slug = slugMatch[1].replace(/--?\d+$/, ''); // Remove trailing ID
          title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }

      if (!title || title.length < 3) continue;

      // Price — try multiple patterns
      let price = 0;
      const pricePatterns = [
        /(?:CHF|Fr\.?)\s*([\d''\u2019.,\-]+)/i,
        /([\d''\u2019.,]+)\s*(?:CHF|Fr\.?)/i,
        /class="[^"]*price[^"]*"[^>]*>([^<]*\d[^<]*)</i,
        /data-[^=]*price[^=]*="([^"]+)"/i,
      ];
      
      for (const pp of pricePatterns) {
        const priceMatch = context.match(pp);
        if (priceMatch) {
          const parsed = parseSwissPriceRappen(priceMatch[1] || "0");
          if (parsed > 0 && parsed < 1000000000) { // < 10M CHF
            price = parsed;
            break;
          }
        }
      }

      if (!this.priceInRange(price, options)) continue;

      // Image — broader patterns
      const imgPatterns = [
        /src="(https?:\/\/[^"]*(?:anibis|smg|classifieds)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
        /src="(https?:\/\/img[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
        /src="(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)"/i,
        /data-src="(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
        /background-image:\s*url\(['"]?(https?:\/\/[^'")\s]*\.(?:jpg|jpeg|png|webp)[^'")\s]*)['"]?\)/i,
      ];
      
      let imageUrl: string | null = null;
      for (const ip of imgPatterns) {
        const imgMatch = context.match(ip);
        if (imgMatch) { imageUrl = imgMatch[1]; break; }
      }

      const fullUrl = `${this.baseUrl}${href}`;

      results.push({
        title: this.decodeHtmlEntities(title).substring(0, 200),
        price,
        url: fullUrl,
        imageUrl,
        platform: this.platform,
        scrapedAt: new Date(),
      });

      if (options?.limit && results.length >= options.limit) break;
    }

    if (results.length > 0) {
      console.log(`[Anibis] HTML-Listings: ${results.length} Ergebnisse`);
    }

    return results;
  }

  /**
   * Check if price is within the specified range (0 = no price, always passes)
   */
  private priceInRange(price: number, options?: ScraperOptions): boolean {
    if (price > 0) {
      if (options?.minPrice && price < options.minPrice) return false;
      if (options?.maxPrice && price > options.maxPrice) return false;
    }
    return true;
  }

  /**
   * Decode basic HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  }
}
