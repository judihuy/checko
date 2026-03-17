// Proxy Manager — Rotation + Health Tracking
// Rotiert Webshare-Proxies über verschiedene Länder (DE, CH, AT)
// Bei 403: anderes Land versuchen. Bei 3x 403: 60s Pause.
// Trackt Erfolgsraten pro Plattform + Proxy.

import { ProxyAgent, fetch as undiciFetch } from "undici";

// === Configuration (from ENV) ===

// Falls PROXY_USERNAME nicht gesetzt, aus SCRAPER_PROXY extrahieren
function extractProxyCredentials(): { username: string; password: string } {
  if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    return { username: process.env.PROXY_USERNAME, password: process.env.PROXY_PASSWORD };
  }
  const scraperProxy = process.env.SCRAPER_PROXY || "";
  const match = scraperProxy.match(/\/\/([^-]+)-[a-z]+-\d+:([^@]+)@/);
  if (match) {
    return { username: match[1], password: match[2] };
  }
  return { username: "", password: "" };
}

const { username: PROXY_USERNAME_BASE, password: PROXY_PASSWORD } = extractProxyCredentials();
const PROXY_HOST = process.env.PROXY_HOST || "p.webshare.io";
const PROXY_PORT = parseInt(process.env.PROXY_PORT || "80", 10);

// Country suffixes for rotation
const PROXY_COUNTRIES = ["de", "ch", "at"];

// Number of proxies per country
const PROXIES_PER_COUNTRY = 5;

interface ProxyEntry {
  username: string;
  password: string;
  country: string;
  url: string;
}

interface ProxyStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  consecutive403: number;
  lastUsed: number;
  pausedUntil: number; // timestamp when pause ends
}

// === Proxy Pool ===

function buildProxyPool(): ProxyEntry[] {
  const pool: ProxyEntry[] = [];
  for (const country of PROXY_COUNTRIES) {
    for (let i = 1; i <= PROXIES_PER_COUNTRY; i++) {
      const username = `${PROXY_USERNAME_BASE}-${country}-${i}`;
      pool.push({
        username,
        password: PROXY_PASSWORD,
        country,
        url: `http://${username}:${PROXY_PASSWORD}@${PROXY_HOST}:${PROXY_PORT}`,
      });
    }
  }
  return pool;
}

const proxyPool: ProxyEntry[] = buildProxyPool();

// Stats per proxy (keyed by username)
const proxyStats: Map<string, ProxyStats> = new Map();

// Stats per platform
const platformStats: Map<string, { success: number; failure: number; lastRun: number }> = new Map();

// === Internal Helpers ===

function getStats(username: string): ProxyStats {
  let stats = proxyStats.get(username);
  if (!stats) {
    stats = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      consecutive403: 0,
      lastUsed: 0,
      pausedUntil: 0,
    };
    proxyStats.set(username, stats);
  }
  return stats;
}

function isProxyAvailable(proxy: ProxyEntry): boolean {
  const stats = getStats(proxy.username);
  return Date.now() >= stats.pausedUntil;
}

// === Public API ===

/**
 * Wählt einen Proxy aus dem Pool.
 * Bevorzugt Land `preferredCountry`, vermeidet `excludeCountry`.
 * Gibt null zurück wenn alle Proxies pausiert sind.
 */
export function getProxy(preferredCountry?: string, excludeCountry?: string): ProxyEntry | null {
  const now = Date.now();

  // Filter verfügbare Proxies
  let available = proxyPool.filter((p) => isProxyAvailable(p));

  if (excludeCountry) {
    const filtered = available.filter((p) => p.country !== excludeCountry);
    if (filtered.length > 0) available = filtered;
  }

  if (available.length === 0) {
    console.warn("[ProxyManager] ⚠️ Alle Proxies pausiert!");
    return null;
  }

  // Bevorzuge preferred country
  if (preferredCountry) {
    const preferred = available.filter((p) => p.country === preferredCountry);
    if (preferred.length > 0) {
      // Wähle den am längsten nicht genutzten
      preferred.sort((a, b) => getStats(a.username).lastUsed - getStats(b.username).lastUsed);
      return preferred[0];
    }
  }

  // Sonst: zufällig aus verfügbaren
  available.sort((a, b) => getStats(a.username).lastUsed - getStats(b.username).lastUsed);
  return available[0];
}

/**
 * Zufälligen Proxy zurückgeben (einfache Variante)
 */
export function getRandomProxy(): ProxyEntry | null {
  const available = proxyPool.filter((p) => isProxyAvailable(p));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Meldet Erfolg für einen Proxy
 */
export function reportSuccess(proxy: ProxyEntry, platform: string): void {
  const stats = getStats(proxy.username);
  stats.totalRequests++;
  stats.successCount++;
  stats.consecutive403 = 0;
  stats.lastUsed = Date.now();

  // Platform stats
  const ps = platformStats.get(platform) || { success: 0, failure: 0, lastRun: 0 };
  ps.success++;
  ps.lastRun = Date.now();
  platformStats.set(platform, ps);
}

/**
 * Meldet Fehler für einen Proxy.
 * Bei 403: Erhöht consecutive403 Counter. Bei 3x → 60s Pause.
 */
export function reportFailure(proxy: ProxyEntry, platform: string, statusCode?: number): void {
  const stats = getStats(proxy.username);
  stats.totalRequests++;
  stats.failureCount++;
  stats.lastUsed = Date.now();

  if (statusCode === 403) {
    stats.consecutive403++;
    if (stats.consecutive403 >= 3) {
      stats.pausedUntil = Date.now() + 60_000; // 60s Pause
      console.warn(
        `[ProxyManager] ⚠️ Proxy ${proxy.username} pausiert für 60s (3x 403)`
      );
      stats.consecutive403 = 0; // Reset nach Pause
    }
  }

  // Platform stats
  const ps = platformStats.get(platform) || { success: 0, failure: 0, lastRun: 0 };
  ps.failure++;
  ps.lastRun = Date.now();
  platformStats.set(platform, ps);
}

/**
 * Erfolgsrate für eine Plattform (0-100%)
 */
export function getPlatformSuccessRate(platform: string): number {
  const ps = platformStats.get(platform);
  if (!ps || (ps.success + ps.failure) === 0) return -1; // no data
  return Math.round((ps.success / (ps.success + ps.failure)) * 100);
}

/**
 * Alle Plattform-Stats zurückgeben
 */
export function getAllPlatformStats(): Record<string, { success: number; failure: number; rate: number }> {
  const result: Record<string, { success: number; failure: number; rate: number }> = {};
  for (const [platform, ps] of platformStats) {
    const total = ps.success + ps.failure;
    result[platform] = {
      success: ps.success,
      failure: ps.failure,
      rate: total > 0 ? Math.round((ps.success / total) * 100) : -1,
    };
  }
  return result;
}

/**
 * Stats zurücksetzen (z.B. nach Deploy)
 */
export function resetStats(): void {
  proxyStats.clear();
  platformStats.clear();
}

// === Convenience: Fetch with proxy rotation ===

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Maskiert Proxy-URL für Log-Ausgabe
 */
export function maskProxyUrl(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return proxyUrl.replace(/:[^:@]+@/, ":***@");
  }
}

/**
 * Fetch mit Proxy-Rotation und automatischem Retry bei 403.
 * Versucht bis zu 3 verschiedene Proxies (verschiedene Länder bei 403).
 */
export async function fetchWithProxy(
  url: string,
  platform: string,
  options?: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;
    maxRetries?: number;
    preferredCountry?: string;
  }
): Promise<{ response: Response; proxy: ProxyEntry | null }> {
  const maxRetries = options?.maxRetries ?? 3;
  let lastCountry: string | undefined;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = getProxy(options?.preferredCountry, lastCountry);

    const headers: Record<string, string> = {
      "User-Agent": getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache",
      ...options?.headers,
    };

    try {
      let response: Response;

      if (proxy) {
        console.log(
          `[ProxyManager] ${platform} attempt ${attempt + 1}/${maxRetries} via ${proxy.country.toUpperCase()} proxy ${proxy.username}`
        );
        const dispatcher = new ProxyAgent(proxy.url);
        const undiciResp = await undiciFetch(url, {
          headers,
          dispatcher,
          method: options?.method,
          body: options?.body,
        });
        response = undiciResp as unknown as Response;
      } else {
        console.log(`[ProxyManager] ${platform} attempt ${attempt + 1}/${maxRetries} direct (no proxy available)`);
        response = await fetch(url, {
          headers,
          method: options?.method,
          body: options?.body,
        });
      }

      if (response.ok) {
        if (proxy) reportSuccess(proxy, platform);
        return { response, proxy };
      }

      // Handle 403
      if (response.status === 403) {
        if (proxy) {
          reportFailure(proxy, platform, 403);
          lastCountry = proxy.country; // nächster Versuch: anderes Land
        }
        console.warn(
          `[ProxyManager] ${platform} HTTP 403 (attempt ${attempt + 1}/${maxRetries}) via ${proxy?.country.toUpperCase() || "direct"}`
        );
        continue;
      }

      // Other errors — still report and return
      if (proxy) reportFailure(proxy, platform, response.status);
      return { response, proxy };
    } catch (error) {
      if (proxy) reportFailure(proxy, platform);
      lastError = error instanceof Error ? error : new Error(String(error));
      lastCountry = proxy?.country;
      console.warn(
        `[ProxyManager] ${platform} fetch error (attempt ${attempt + 1}/${maxRetries}): ${lastError.message}`
      );
    }
  }

  // Alle Retries fehlgeschlagen — Fallback: direkt ohne Proxy
  console.warn(`[ProxyManager] ${platform} all proxy retries exhausted, trying direct...`);
  try {
    const headers: Record<string, string> = {
      "User-Agent": getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
      ...options?.headers,
    };
    const response = await fetch(url, { headers, method: options?.method, body: options?.body });
    return { response, proxy: null };
  } catch (directError) {
    throw lastError || directError;
  }
}
