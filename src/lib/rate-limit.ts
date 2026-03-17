// Generisches In-Memory Rate-Limiting
// Verwendet eine Map mit IP:endpoint als Key und Timestamps als Value
// Alte Einträge werden periodisch aufgeräumt

const rateLimitStore = new Map<string, number[]>();

// Aufräumen alle 5 Minuten
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitStore.entries()) {
    // Entferne Einträge die älter als 30 Minuten sind (längste Window)
    const recent = timestamps.filter((t) => now - t < 30 * 60 * 1000);
    if (recent.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, recent);
    }
  }
}, 5 * 60 * 1000);

/**
 * Prüft und trackt Rate-Limiting für eine IP + Endpoint Kombination.
 * @returns true wenn das Limit überschritten wurde (Request blockieren!)
 */
export function isRateLimited(
  ip: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const timestamps = rateLimitStore.get(key) ?? [];
  const recent = timestamps.filter((t) => now - t < windowMs);

  if (recent.length >= maxRequests) {
    rateLimitStore.set(key, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(key, recent);
  return false;
}

/**
 * Extrahiert die Client-IP aus dem Request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}

// ============================================================
// Vordefinierte Limits (Konstanten für alle Endpoints)
// ============================================================

/** Standard: 60 Requests pro Minute */
export const RATE_LIMIT_DEFAULT = { max: 60, windowMs: 60 * 1000 };

/** Login: 5 Versuche pro 15 Minuten */
export const RATE_LIMIT_LOGIN = { max: 5, windowMs: 15 * 60 * 1000 };

/** Register: 5 pro 15 Minuten */
export const RATE_LIMIT_REGISTER = { max: 5, windowMs: 15 * 60 * 1000 };

/** Stripe Checkout: 10 pro 15 Minuten */
export const RATE_LIMIT_STRIPE = { max: 10, windowMs: 15 * 60 * 1000 };

/** Cron: 5 pro Minute */
export const RATE_LIMIT_CRON = { max: 5, windowMs: 60 * 1000 };

/** Waitlist / Forgot-Password: 5 pro 15 Minuten */
export const RATE_LIMIT_SENSITIVE = { max: 5, windowMs: 15 * 60 * 1000 };

// ============================================================
// Helper: NextResponse 429
// ============================================================

import { NextResponse } from "next/server";

export function rateLimitResponse() {
  return NextResponse.json(
    { error: "Zu viele Anfragen. Bitte versuche es später erneut." },
    { status: 429 }
  );
}

/**
 * Shorthand: Prüft Rate-Limit und gibt 429 Response zurück wenn überschritten.
 * Gibt null zurück wenn OK.
 */
export function checkRateLimit(
  request: Request,
  endpoint: string,
  maxRequests: number = RATE_LIMIT_DEFAULT.max,
  windowMs: number = RATE_LIMIT_DEFAULT.windowMs
): NextResponse | null {
  const ip = getClientIp(request);
  if (isRateLimited(ip, endpoint, maxRequests, windowMs)) {
    return rateLimitResponse();
  }
  return null;
}
