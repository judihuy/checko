// Basis-Scraper Interface und Abstract Class
// Alle Plattform-Scraper erben von BaseScraper

import { ProxyAgent, fetch as undiciFetch } from "undici";
import puppeteer from "puppeteer";

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
  // Kategorie-spezifische Felder
  category?: string;
  subcategory?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  yearFrom?: number;
  yearTo?: number;
  kmFrom?: number;
  kmTo?: number;
  fuelType?: string;
  transmission?: string;
  engineSizeCcm?: number;
  motorcycleType?: string;
  propertyType?: string;
  propertyOffer?: string;
  rooms?: number;
  areaM2?: number;
  location?: string;
  furnitureType?: string;
}

// Proxy-Pool: 10 deutsche Webshare-Proxies
const PROXY_POOL = [
  { username: "kfxavtnr-de-1", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-2", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-3", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-4", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-5", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-6", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-7", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-8", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-9", password: "4f55trvs9n0y" },
  { username: "kfxavtnr-de-10", password: "4f55trvs9n0y" },
];

const PROXY_HOST = "p.webshare.io";
const PROXY_PORT = 80;

// Legacy proxy URLs für undici (fetchWithHeaders)
const PROXY_URLS: string[] = PROXY_POOL.map(
  (p) => `http://${p.username}:${p.password}@${PROXY_HOST}:${PROXY_PORT}`
);

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
 * Wählt zufälligen Proxy aus dem Pool (URL-Format für undici)
 */
function getRandomProxyUrl(): string | null {
  const envProxy = process.env.SCRAPER_PROXY_POOL || process.env.SCRAPER_PROXY;
  if (envProxy) {
    const envProxies = envProxy.split(",").map((p) => p.trim()).filter(Boolean);
    if (envProxies.length > 0) {
      return envProxies[Math.floor(Math.random() * envProxies.length)];
    }
  }

  if (PROXY_URLS.length > 0) {
    return PROXY_URLS[Math.floor(Math.random() * PROXY_URLS.length)];
  }

  return null;
}

/**
 * Wählt zufällige Proxy-Credentials aus dem Pool (für Puppeteer)
 */
function getRandomProxyCredentials(): { username: string; password: string } {
  const idx = Math.floor(Math.random() * PROXY_POOL.length);
  return PROXY_POOL[idx];
}

// ===== Browser Semaphore: Max 1 Browser gleichzeitig =====
let browserLock: Promise<void> = Promise.resolve();

function acquireBrowserLock(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const prev = browserLock;
    let release: () => void;
    browserLock = new Promise<void>((r) => {
      release = r;
    });
    prev.then(() => {
      resolve(release!);
    });
  });
}

// Letzte Browser-Request-Zeit für globales Rate-Limiting
let lastBrowserRequestTime = 0;
const BROWSER_MIN_DELAY_MS = 5000; // 5 Sekunden zwischen Browser-Requests

export abstract class BaseScraper {
  abstract readonly platform: string;
  abstract readonly displayName: string;
  abstract readonly baseUrl: string;

  /**
   * Flag: Ist dieser Scraper aktuell funktionsfähig?
   * Wird auf false gesetzt wenn die Plattform blockiert (Cloudflare, DataDome etc.)
   * Der Scheduler überspringt Scraper mit isWorking=false
   */
  isWorking: boolean = true;

  // Rate-Limiting: Letzte Request-Zeit pro Plattform (für fetchWithHeaders)
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

  /**
   * Fetcht HTML mit echtem Headless-Browser (Puppeteer) + Proxy.
   * Max 1 Browser gleichzeitig (Semaphore). 5s Pause zwischen Requests.
   * Automatisches Cookie-Banner-Handling + 3s Warte-Zeit nach Page-Load.
   * Bei Fehler wird Error geworfen — Aufrufer sollte Fallback nutzen.
   */
  protected async fetchWithBrowser(url: string): Promise<string> {
    const release = await acquireBrowserLock();

    try {
      // Rate-Limiting: 5 Sekunden Pause zwischen Browser-Requests
      const now = Date.now();
      const elapsed = now - lastBrowserRequestTime;
      if (elapsed < BROWSER_MIN_DELAY_MS) {
        const waitMs = BROWSER_MIN_DELAY_MS - elapsed;
        console.log(`[Scraper/${this.platform}] Browser rate-limit: waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const proxy = getRandomProxyCredentials();
      const userAgent = this.getRandomUserAgent();

      console.log(`[Scraper/${this.platform}] Launching browser with proxy user ${proxy.username}`);

      // Chromium-Pfad: ENV überschreibt Puppeteer-Default
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
          `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
        ],
      });

      try {
        const page = await browser.newPage();

        // Proxy-Authentifizierung
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

        // Viewport setzen
        await page.setViewport({ width: 1920, height: 1080 });

        // User-Agent setzen
        await page.setUserAgent(userAgent);

        // Sprache setzen
        await page.setExtraHTTPHeaders({
          "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
        });

        // Seite laden
        const response = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        if (response && !response.ok()) {
          console.warn(`[Scraper/${this.platform}] Browser fetch HTTP ${response.status()} ${response.statusText()}`);
        }

        // 3 Sekunden warten für JS-Rendering
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Cookie-Banner automatisch akzeptieren
        try {
          const buttons = await page.$$("button");
          for (const btn of buttons) {
            const text = await page.evaluate((el) => el.textContent || "", btn);
            if (
              text.includes("Akzeptieren") ||
              text.includes("akzeptieren") ||
              text.includes("Accept") ||
              text.includes("Alle akzeptieren") ||
              text.includes("Zustimmen") ||
              text.includes("Einverstanden")
            ) {
              await btn.click();
              console.log(`[Scraper/${this.platform}] Cookie-Banner geklickt: "${text.trim().substring(0, 40)}"`);
              await new Promise((resolve) => setTimeout(resolve, 1000));
              break;
            }
          }
        } catch (cookieError) {
          // Cookie-Banner nicht gefunden oder Klick-Fehler — kein Problem
        }

        const html = await page.content();

        lastBrowserRequestTime = Date.now();

        console.log(`[Scraper/${this.platform}] Browser fetch OK, HTML length: ${html.length}`);

        return html;
      } finally {
        // Browser IMMER schliessen — auch bei Fehler
        await browser.close();
      }
    } finally {
      // Lock IMMER freigeben
      release();
    }
  }

  /**
   * Fetcht HTML mit echtem Headless-Browser OHNE Proxy.
   * Für Plattformen die den Proxy ablehnen aber ohne Proxy funktionieren.
   */
  protected async fetchWithBrowserNoProxy(url: string): Promise<string> {
    const release = await acquireBrowserLock();

    try {
      const now = Date.now();
      const elapsed = now - lastBrowserRequestTime;
      if (elapsed < BROWSER_MIN_DELAY_MS) {
        const waitMs = BROWSER_MIN_DELAY_MS - elapsed;
        console.log(`[Scraper/${this.platform}] Browser rate-limit: waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const userAgent = this.getRandomUserAgent();
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

      console.log(`[Scraper/${this.platform}] Launching browser WITHOUT proxy`);

      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
        ],
      });

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(userAgent);
        await page.setExtraHTTPHeaders({
          "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
        });

        const response = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        if (response && !response.ok()) {
          console.warn(`[Scraper/${this.platform}] Browser fetch HTTP ${response.status()} ${response.statusText()}`);
        }

        // 3 Sekunden warten für JS-Rendering
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Cookie-Banner automatisch akzeptieren
        try {
          const buttons = await page.$$("button");
          for (const btn of buttons) {
            const text = await page.evaluate((el) => el.textContent || "", btn);
            if (
              text.includes("Akzeptieren") ||
              text.includes("akzeptieren") ||
              text.includes("Accept") ||
              text.includes("Alle akzeptieren") ||
              text.includes("Zustimmen") ||
              text.includes("Einverstanden")
            ) {
              await btn.click();
              console.log(`[Scraper/${this.platform}] Cookie-Banner geklickt: "${text.trim().substring(0, 40)}"`);
              await new Promise((resolve) => setTimeout(resolve, 1000));
              break;
            }
          }
        } catch {
          // Cookie-Banner Fehler — ignorieren
        }

        const html = await page.content();
        lastBrowserRequestTime = Date.now();

        console.log(`[Scraper/${this.platform}] Browser (no proxy) fetch OK, HTML length: ${html.length}`);
        return html;
      } finally {
        await browser.close();
      }
    } finally {
      release();
    }
  }

  /**
   * Fetcht mit HTTP-Headers via undici + Proxy (kein Browser).
   * Wird als Fallback verwendet wenn Puppeteer fehlschlägt.
   */
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
    const proxyUrl = getRandomProxyUrl();

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
