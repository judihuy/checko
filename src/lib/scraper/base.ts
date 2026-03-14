// Basis-Scraper Interface und Abstract Class
// Alle Plattform-Scraper erben von BaseScraper

import { ProxyAgent, fetch as undiciFetch } from "undici";

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

// Proxy-Pool: 10 deutsche Webshare-Proxies
const PROXY_POOL: string[] = [
  "http://kfxavtnr-de-1:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-2:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-3:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-4:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-5:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-6:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-7:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-8:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-9:4f55trvs9n0y@p.webshare.io:80",
  "http://kfxavtnr-de-10:4f55trvs9n0y@p.webshare.io:80",
];

/**
 * Maskiert Passwort in Proxy-URL für sichere Log-Ausgabe
 * http://user:secret@host:port → http://user:***@host:port
 */
function maskProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    return proxyUrl.replace(/:[^:@]+@/, ":***@");
  }
}

/**
 * Wählt zufälligen Proxy aus dem Pool
 */
function getRandomProxy(): string | null {
  // ENV-Variable überschreibt Pool (Komma-getrennt oder einzeln)
  const envProxy = process.env.SCRAPER_PROXY_POOL || process.env.SCRAPER_PROXY;
  if (envProxy) {
    const envProxies = envProxy.split(",").map((p) => p.trim()).filter(Boolean);
    if (envProxies.length > 0) {
      return envProxies[Math.floor(Math.random() * envProxies.length)];
    }
  }

  // Fallback: Hardcoded Pool
  if (PROXY_POOL.length > 0) {
    return PROXY_POOL[Math.floor(Math.random() * PROXY_POOL.length)];
  }

  return null;
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

    // Proxy aus Pool wählen
    const proxyUrl = getRandomProxy();

    if (proxyUrl) {
      console.log(`[Scraper/${this.platform}] Fetching via proxy: ${maskProxyUrl(proxyUrl)}`);
      try {
        const dispatcher = new ProxyAgent(proxyUrl);
        const response = await undiciFetch(url, {
          headers,
          dispatcher,
        });
        // undici Response in Web-Standard Response konvertieren
        return response as unknown as Response;
      } catch (proxyError) {
        console.warn(`[Scraper/${this.platform}] Proxy failed, falling back to direct fetch:`, proxyError);
        // Fallback: direkter Fetch ohne Proxy
        return fetch(url, { headers });
      }
    }

    // Kein Proxy konfiguriert → normales fetch
    console.log(`[Scraper/${this.platform}] Fetching directly (no proxy configured)`);
    return fetch(url, { headers });
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
