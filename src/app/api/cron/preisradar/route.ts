// Cron-Endpoint für Preisradar
// POST /api/cron/preisradar
// Geschützt mit Secret-Header: x-cron-secret

import { NextRequest, NextResponse } from "next/server";
import { runAllActiveSearches } from "@/lib/scraper/scheduler";

export async function POST(request: NextRequest) {
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
