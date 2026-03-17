// Health Monitor — Scraper-Gesundheit tracken + Telegram-Alerts
// Trackt Erfolgsraten pro Plattform über mehrere Durchläufe.
// Bei 0% Erfolg über 3 aufeinanderfolgende Durchläufe → Telegram-Alert.

import { getAllPlatformStats } from "./proxy-manager";

// === Configuration ===

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8774648234:AAGlsfQzsWPSVZVtMucpQHPCBWjig9c3DEU";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "5464533686";
const MAX_CONSECUTIVE_FAILURES = 3;

// === State ===

interface PlatformHealth {
  consecutiveZeroRuns: number; // Aufeinanderfolgende Durchläufe mit 0 Ergebnissen
  lastAlertSent: number; // Timestamp des letzten Alerts
  totalRuns: number;
  totalSuccessfulRuns: number;
}

const healthState: Map<string, PlatformHealth> = new Map();

// Overall scraper run tracking
let consecutiveEmptyRuns = 0;
let lastOverallAlert = 0;

// === Telegram ===

async function sendTelegramMessage(message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[HealthMonitor] Telegram nicht konfiguriert — Alert übersprungen");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[HealthMonitor] Telegram API error: ${response.status} — ${text}`);
      return false;
    }

    console.log("[HealthMonitor] ✅ Telegram-Alert gesendet");
    return true;
  } catch (error) {
    console.error(
      "[HealthMonitor] Telegram-Fehler:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

// === Public API ===

/**
 * Nach einem Scrape-Durchlauf aufrufen.
 * Trackt Ergebnisse pro Plattform und sendet Alerts bei Totalausfall.
 */
export async function reportScrapeRun(results: {
  platform: string;
  resultsCount: number;
  error?: string;
}[]): Promise<void> {
  const now = Date.now();
  const failedPlatforms: string[] = [];
  const successPlatforms: string[] = [];

  for (const result of results) {
    let health = healthState.get(result.platform);
    if (!health) {
      health = {
        consecutiveZeroRuns: 0,
        lastAlertSent: 0,
        totalRuns: 0,
        totalSuccessfulRuns: 0,
      };
      healthState.set(result.platform, health);
    }

    health.totalRuns++;

    if (result.resultsCount === 0) {
      health.consecutiveZeroRuns++;
      failedPlatforms.push(result.platform);
    } else {
      health.consecutiveZeroRuns = 0;
      health.totalSuccessfulRuns++;
      successPlatforms.push(result.platform);
    }

    // Platform-spezifischer Alert: 3x hintereinander 0 Ergebnisse
    if (
      health.consecutiveZeroRuns >= MAX_CONSECUTIVE_FAILURES &&
      now - health.lastAlertSent > 3600_000 // Max 1 Alert pro Stunde pro Plattform
    ) {
      const msg =
        `⚠️ <b>Checko Preisradar — Plattform-Ausfall</b>\n\n` +
        `Plattform: <b>${result.platform}</b>\n` +
        `${health.consecutiveZeroRuns}x hintereinander 0 Ergebnisse\n` +
        `${result.error ? `Fehler: ${result.error}\n` : ""}` +
        `Zeitpunkt: ${new Date().toLocaleString("de-CH")}`;

      await sendTelegramMessage(msg);
      health.lastAlertSent = now;
    }
  }

  // Gesamtcheck: Wenn ALLE Plattformen fehlschlagen
  if (results.length > 0 && successPlatforms.length === 0) {
    consecutiveEmptyRuns++;

    if (
      consecutiveEmptyRuns >= MAX_CONSECUTIVE_FAILURES &&
      now - lastOverallAlert > 3600_000
    ) {
      const proxyStats = getAllPlatformStats();
      const statsStr = Object.entries(proxyStats)
        .map(([p, s]) => `  ${p}: ${s.rate}% (${s.success}/${s.success + s.failure})`)
        .join("\n");

      const msg =
        `🚨 <b>Checko Preisradar — TOTALAUSFALL</b>\n\n` +
        `${consecutiveEmptyRuns}x hintereinander 0% Erfolg über alle Plattformen!\n\n` +
        `Betroffene Plattformen:\n${failedPlatforms.map((p) => `  ❌ ${p}`).join("\n")}\n\n` +
        `Proxy-Statistiken:\n${statsStr || "  Keine Daten"}\n\n` +
        `Zeitpunkt: ${new Date().toLocaleString("de-CH")}`;

      await sendTelegramMessage(msg);
      lastOverallAlert = now;
    }
  } else {
    consecutiveEmptyRuns = 0;
  }
}

/**
 * Sendet einen manuellen Test-Alert über Telegram
 */
export async function sendTestAlert(): Promise<boolean> {
  return sendTelegramMessage(
    `✅ <b>Checko Preisradar — Test-Alert</b>\n\n` +
    `Health-Monitor funktioniert!\n` +
    `Zeitpunkt: ${new Date().toLocaleString("de-CH")}`
  );
}

/**
 * Gesundheitsstatus aller Plattformen abrufen
 */
export function getHealthStatus(): Record<string, {
  consecutiveZeroRuns: number;
  totalRuns: number;
  totalSuccessfulRuns: number;
  rate: number;
}> {
  const result: Record<string, {
    consecutiveZeroRuns: number;
    totalRuns: number;
    totalSuccessfulRuns: number;
    rate: number;
  }> = {};

  for (const [platform, health] of healthState) {
    result[platform] = {
      consecutiveZeroRuns: health.consecutiveZeroRuns,
      totalRuns: health.totalRuns,
      totalSuccessfulRuns: health.totalSuccessfulRuns,
      rate:
        health.totalRuns > 0
          ? Math.round((health.totalSuccessfulRuns / health.totalRuns) * 100)
          : -1,
    };
  }

  return result;
}
