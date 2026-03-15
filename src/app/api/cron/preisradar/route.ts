// Cron-Endpoint für Preisradar
// POST /api/cron/preisradar
// Geschützt mit Secret-Header: x-cron-secret

import { NextRequest, NextResponse } from "next/server";
import { runAllActiveSearches } from "@/lib/scraper/scheduler";
import { checkRateLimit, RATE_LIMIT_CRON } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate-Limiting: 5 pro Minute
  const rl = checkRateLimit(request, "cron-preisradar", RATE_LIMIT_CRON.max, RATE_LIMIT_CRON.windowMs);
  if (rl) return rl;
  // Sicherheit: Secret-Header prüfen
  const cronSecret = process.env.CRON_SECRET;
  const requestSecret = request.headers.get("x-cron-secret");

  if (!cronSecret || requestSecret !== cronSecret) {
    return NextResponse.json(
      { error: "Nicht autorisiert" },
      { status: 401 }
    );
  }

  try {
    const result = await runAllActiveSearches();

    return NextResponse.json({
      success: true,
      totalSearches: result.totalSearches,
      totalNewAlerts: result.totalNewAlerts,
      skippedSearches: result.skippedSearches,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron Preisradar error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      },
      { status: 500 }
    );
  }
}
