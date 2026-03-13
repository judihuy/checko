// Basis-Scraper Interface und Abstract Class
// Alle Plattform-Scraper erben von BaseScraper

export interface ScraperResult {
  title: string;
  price: number;       // Preis in Rappen (Cent)
  url: string;
  imageUrl: string | null;
  platform: string;
  scrapedAt: Date;
}

export interface ScraperOptions {
  maxPrice?: number;   // in Rappen
  minPrice?: number;   // in Rappen
  limit?: number;      // max Ergebnisse
}

export abstract class BaseScraper {
  abstract readonly platform: string;
  abstract readonly displayName: string;
  abstract readonly baseUrl: string;

  // Rate-Limiting: Letzte Request-Zeit pro Plattform
  private static lastRequestTime: Map<string, number> = new Map();
  private static readonly MIN_DELAY_MS = 5000; // 5 Sekunden zwischen Requests

  // User-Agent Rotation
  private static readonly USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  ];

  protected getRandomUserAgent(): string {
    const idx = Math.floor(Math.random() * BaseScraper.USER_AGENTS.length);
    return BaseScraper.USER_AGENTS[idx];
  }

  protected async enforceRateLimit(): Promise<void> {
    const lastTime = BaseScraper.lastRequestTime.get(this.platform) || 0;
    const now = Date.now();
    const elapsed = now - lastTime;

    if (elapsed < BaseScraper.MIN_DELAY_MS) {
      const waitMs = BaseScraper.MIN_DELAY_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    BaseScraper.lastRequestTime.set(this.platform, Date.now());
  }

  protected getProxyAgent(): string | undefined {
    return process.env.SCRAPER_PROXY || undefined;
  }

  protected async fetchWithHeaders(url: string): Promise<Response> {
    await this.enforceRateLimit();

    const headers: Record<string, string> = {
      "User-Agent": this.getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
    };

    const fetchOptions: RequestInit = { headers };

    // Proxy-Support (HTTP_PROXY oder SCRAPER_PROXY)
    // Node.js native fetch unterstützt keinen Proxy direkt,
    // aber wir setzen die Headers. Für echten Proxy-Support
    // bräuchte man undici oder node-fetch mit proxy-agent.

    return fetch(url, fetchOptions);
  }

  /**
   * Scrape eine Plattform nach Ergebnissen
   * Muss von jeder Plattform implementiert werden
   */
  abstract scrape(query: string, options?: ScraperOptions): Promise<ScraperResult[]>;

  /**
   * Prüfe ob Scraper aktuell verfügbar ist
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithHeaders(this.baseUrl);
      return response.ok;
    } catch {
      return false;
    }
  }
}
