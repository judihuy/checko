// Basis-Scraper Interface und Abstract Class
// Alle Plattform-Scraper erben von BaseScraper

import { ProxyAgent, fetch as undiciFetch } from "undici";

// puppeteer-extra + stealth-plugin via require() für Bundler-Kompatibilität
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteerExtra = require("puppeteer-extra");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

// Typisierung: puppeteer-extra hat das gleiche Interface wie puppeteer
const puppeteer = puppeteerExtra as typeof import("puppeteer");

export interface ScraperResult {
  title: string;
  price: number;       // Preis in Rappen (Cent)
  url: string;
  imageUrl: string | null;
  description?: string; // Beschreibung des Inserats (für KI-Filter)
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

// Proxy-Pool: built from ENV (PROXY_USERNAME, PROXY_PASSWORD, PROXY_HOST, PROXY_PORT)
// Falls PROXY_USERNAME nicht gesetzt, aus SCRAPER_PROXY extrahieren
function extractProxyCredentials(): { username: string; password: string } {
  if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    return { username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD };
  }
  // Fallback: aus SCRAPER_PROXY extrahieren (Format: http://user-country-N:pass@host:port)
  const scraperProxy = process.env.SCRAPER_PROXY || "";
  const match = scraperProxy.match(/\/\/([^-]+)-[a-z]+-\d+:([^@]+)@/);
  if (match) {
    return { username: match[1], password: match[2] };
  }
  return { username: "", password: "" };
}

const { username: PROXY_USERNAME_BASE, password: PROXY_PASSWORD_BASE } = extractProxyCredentials();
const PROXY_HOST = process.env.PROXY_HOST || "p.webshare.io";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "80", 10);

const PROXY_POOL = Array.from({ length: 10 }, (_, i) => ({
  username: `${PROXY_USERNAME_BASE}-de-${i + 1}`,
  password: PROXY_PASSWORD_BASE,
}));

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

  // User-Agent Rotation — echte aktuelle Chrome User-Agents
  private static readonly USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  ];

  // Viewport-Randomisierung
  private static readonly VIEWPORTS = [
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ];

  protected getRandomUserAgent(): string {
    const idx = Math.floor(Math.random() * BaseScraper.USER_AGENTS.length);
    return BaseScraper.USER_AGENTS[idx];
  }

  protected getRandomViewport(): { width: number; height: number } {
    const idx = Math.floor(Math.random() * BaseScraper.VIEWPORTS.length);
    return BaseScraper.VIEWPORTS[idx];
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
      const viewport = this.getRandomViewport();

      console.log(`[Scraper/${this.platform}] Launching stealth browser with proxy user ${proxy.username}, viewport ${viewport.width}x${viewport.height}`);

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
          `--window-size=${viewport.width},${viewport.height}`,
        ],
      });

      try {
        const page = await browser.newPage();

        // Proxy-Authentifizierung
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });

        // Viewport setzen (randomisiert)
        await page.setViewport(viewport);

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
   * Fetcht HTML mit echtem Headless-Browser (Puppeteer) + Proxy mit spezifischem Land.
   * Verwendet Residential Proxy mit Ländercode (z.B. "ch" für Schweiz).
   * Ansonsten identisch zu fetchWithBrowser.
   */
  protected async fetchWithBrowserCountry(url: string, country: string): Promise<string> {
    const release = await acquireBrowserLock();

    try {
      const now = Date.now();
      const elapsed = now - lastBrowserRequestTime;
      if (elapsed < BROWSER_MIN_DELAY_MS) {
        const waitMs = BROWSER_MIN_DELAY_MS - elapsed;
        console.log(`[Scraper/${this.platform}] Browser rate-limit: waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      // Build country-specific proxy credentials
      const proxyIdx = Math.floor(Math.random() * 5) + 1;
      const proxyUsername = `${PROXY_USERNAME_BASE}-${country}-${proxyIdx}`;
      const proxyPassword = PROXY_PASSWORD_BASE;
      const userAgent = this.getRandomUserAgent();
      const viewport = this.getRandomViewport();

      console.log(`[Scraper/${this.platform}] Launching stealth browser with ${country.toUpperCase()} proxy user ${proxyUsername}, viewport ${viewport.width}x${viewport.height}`);

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
          `--window-size=${viewport.width},${viewport.height}`,
        ],
      });

      try {
        const page = await browser.newPage();

        // Proxy-Authentifizierung mit länderspezifischem User
        await page.authenticate({
          username: proxyUsername,
          password: proxyPassword,
        });

        await page.setViewport(viewport);
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

        console.log(`[Scraper/${this.platform}] Browser (${country.toUpperCase()} proxy) fetch OK, HTML length: ${html.length}`);
        return html;
      } finally {
        await browser.close();
      }
    } finally {
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
      const viewport = this.getRandomViewport();
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

      console.log(`[Scraper/${this.platform}] Launching stealth browser WITHOUT proxy, viewport ${viewport.width}x${viewport.height}`);

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
          `--window-size=${viewport.width},${viewport.height}`,
        ],
      });

      try {
        const page = await browser.newPage();
        await page.setViewport(viewport);
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
   * PRIMÄRE Scrape-Methode — schneller und ressourcenschonender als Puppeteer.
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
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
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
          redirect: "follow",    // Explicitly follow redirects (e.g. Autolina 302)
        });
        // undici Response in Web-Standard Response konvertieren
        return response as unknown as Response;
      } catch (proxyError) {
        console.warn(`[Scraper/${this.platform}] Proxy failed, falling back to direct fetch:`, proxyError);
        // Fallback: direkter Fetch ohne Proxy
        return fetch(url, { headers, redirect: "follow" });
      }
    }

    // Kein Proxy konfiguriert → normales fetch
    console.log(`[Scraper/${this.platform}] Fetching directly (no proxy configured)`);
    return fetch(url, { headers, redirect: "follow" });
  }

  /**
   * Fetcht mit HTTP-Headers via Proxy mit spezifischem Land (z.B. "ch" für Schweiz).
   * Nutzt den Proxy-Manager mit Länder-Präferenz und automatischem Retry.
   * PRIMÄRE Scrape-Methode für CH-geoblockte Plattformen.
   */
  protected async fetchWithCountryHeaders(url: string, country: string): Promise<Response> {
    await this.enforceRateLimit();

    const { fetchWithProxy } = await import("./proxy-manager");

    const headers: Record<string, string> = {
      "User-Agent": this.getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    console.log(`[Scraper/${this.platform}] Fetching via ${country.toUpperCase()} proxy with browser headers`);

    const { response } = await fetchWithProxy(url, this.platform, {
      headers,
      maxRetries: 3,
      preferredCountry: country,
    });

    return response;
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
