// Debug-Endpunkt: /api/debug/scraper-test
// Testet die Scraper und zeigt HTML-Snippets + Parse-Ergebnisse

import { NextRequest, NextResponse } from "next/server";
import { getScraperByPlatform, getAllScrapers } from "@/lib/scraper";

export async function GET(request: NextRequest) {
  // Nur im Development oder mit Admin-Secret erlauben
  const secret = request.headers.get("x-debug-secret");
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  if (!isDev && (!cronSecret || secret !== cronSecret)) {
    return NextResponse.json(
      { error: "Nicht autorisiert. Header x-debug-secret setzen." },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const platform = searchParams.get("platform") || "ebay-ka";
  const query = searchParams.get("query") || "BMW x5";
  const maxPrice = parseInt(searchParams.get("maxPrice") || "500000", 10); // in Rappen

  const results: Record<string, unknown> = {
    platform,
    query,
    maxPrice,
    timestamp: new Date().toISOString(),
  };

  try {
    const scraper = getScraperByPlatform(platform);
    if (!scraper) {
      const available = getAllScrapers().map((s) => s.platform);
      return NextResponse.json(
        { error: `Plattform "${platform}" nicht gefunden. Verfügbar: ${available.join(", ")}` },
        { status: 400 }
      );
    }

    results.scraperName = scraper.displayName;

    // Scrape ausführen
    const startTime = Date.now();
    const scraperResults = await scraper.scrape(query, {
      maxPrice,
      limit: 10,
    });
    const duration = Date.now() - startTime;

    results.duration = `${duration}ms`;
    results.resultCount = scraperResults.length;
    results.results = scraperResults.map((r) => ({
      title: r.title,
      price: r.price,
      priceFormatted: `${(r.price / 100).toFixed(2)} CHF`,
      url: r.url,
      imageUrl: r.imageUrl,
      platform: r.platform,
    }));

    return NextResponse.json(results);
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(results, { status: 500 });
  }
}
