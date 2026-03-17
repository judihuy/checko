// FlareSolverr Client — Cloudflare-Challenge-Bypass
// Sendet Requests an den FlareSolverr-Container, der Cloudflare-Challenges löst.
// Wird als Fallback genutzt wenn normaler HTTP-Fetch 403/Cloudflare erhält.

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://flaresolverr:8191/v1";
const FLARESOLVERR_TIMEOUT = 60000; // 60 Sekunden max

interface FlareSolverrResponse {
  status: string;
  message: string;
  startTimestamp: number;
  endTimestamp: number;
  version: string;
  solution: {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string; // HTML content
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
    }>;
    userAgent: string;
  };
}

/**
 * Prüft ob ein HTTP-Response/HTML auf Cloudflare-Challenge hindeutet
 */
export function isCloudflareChallenge(statusCode: number, html?: string): boolean {
  if (statusCode === 403 || statusCode === 503) {
    if (!html) return true;
    return (
      html.includes("Just a moment") ||
      html.includes("cf_chl_opt") ||
      html.includes("challenge-platform") ||
      html.includes("cf-browser-verification") ||
      html.includes("Checking your browser") ||
      html.includes("_cf_chl_opt")
    );
  }
  return false;
}

/**
 * Fetcht eine Seite über FlareSolverr (Cloudflare-Bypass).
 * Gibt den HTML-Content als String zurück.
 * Wirft einen Error wenn FlareSolverr nicht erreichbar oder fehlerhaft.
 */
export async function fetchViaFlareSolverr(url: string, platform: string): Promise<string> {
  console.log(`[FlareSolverr/${platform}] Requesting: ${url}`);

  try {
    const response = await fetch(`${FLARESOLVERR_URL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: FLARESOLVERR_TIMEOUT,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`FlareSolverr HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    const data = (await response.json()) as FlareSolverrResponse;

    if (data.status !== "ok") {
      throw new Error(`FlareSolverr error: ${data.message}`);
    }

    const html = data.solution.response;
    const durationMs = data.endTimestamp - data.startTimestamp;

    console.log(
      `[FlareSolverr/${platform}] ✅ Success in ${durationMs}ms, ` +
      `status: ${data.solution.status}, HTML length: ${html.length}`
    );

    return html;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch failed")) {
      console.error(`[FlareSolverr/${platform}] ❌ FlareSolverr nicht erreichbar (${FLARESOLVERR_URL})`);
      throw new Error(`FlareSolverr nicht erreichbar: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Prüft ob FlareSolverr konfiguriert und erreichbar ist
 */
export function isFlareSolverrConfigured(): boolean {
  return !!process.env.FLARESOLVERR_URL;
}
