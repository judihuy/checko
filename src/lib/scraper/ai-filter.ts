// KI-Nachfilterung für Scraper-Ergebnisse
// Nutzt Claude Haiku via Anthropic API um irrelevante Inserate rauszufiltern
// BEVOR sie als Alerts gespeichert werden

import type { ScraperResult, ScraperOptions } from "./base";

const AI_FILTER_TIMEOUT_MS = 5000;
const AI_FILTER_CONCURRENCY = 5; // Max 5 parallele API-Calls

interface AIFilterResult {
  result: ScraperResult;
  relevant: boolean;
}

/**
 * Baut einen dynamischen Prompt basierend auf den Suchkriterien
 */
function buildFilterPrompt(result: ScraperResult, options: ScraperOptions, query: string): string {
  const criteria: string[] = [];

  // Fahrzeug-Kriterien
  if (options.vehicleMake) criteria.push(`Marke: ${options.vehicleMake}`);
  if (options.vehicleModel) criteria.push(`Modell: ${options.vehicleModel}`);
  if (options.yearFrom || options.yearTo) {
    criteria.push(`Baujahr: ${options.yearFrom || "?"}-${options.yearTo || "?"}`);
  }
  if (options.kmFrom || options.kmTo) {
    criteria.push(`KM: ${options.kmFrom || 0}-${options.kmTo || "∞"}`);
  }
  if (options.fuelType) criteria.push(`Treibstoff: ${options.fuelType}`);
  if (options.transmission) criteria.push(`Getriebe: ${options.transmission}`);

  // Immobilien-Kriterien
  if (options.propertyType) criteria.push(`Immobilientyp: ${options.propertyType}`);
  if (options.propertyOffer) criteria.push(`Angebot: ${options.propertyOffer}`);
  if (options.rooms) criteria.push(`Zimmer: min. ${options.rooms}`);
  if (options.areaM2) criteria.push(`Fläche: min. ${options.areaM2} m²`);
  if (options.location) criteria.push(`Ort: ${options.location}`);

  // Möbel-Kriterien
  if (options.furnitureType) criteria.push(`Möbelart: ${options.furnitureType}`);

  // Preis
  if (options.minPrice) criteria.push(`Min. Preis: ${(options.minPrice / 100).toFixed(0)} CHF`);
  if (options.maxPrice) criteria.push(`Max. Preis: ${(options.maxPrice / 100).toFixed(0)} CHF`);

  // Allgemeine Suche
  if (query) criteria.push(`Suchbegriff: ${query}`);

  const criteriaStr = criteria.length > 0 ? criteria.join(", ") : query;
  const priceStr = result.price > 0 ? `${(result.price / 100).toFixed(0)} CHF` : "kein Preis";

  return `Du bist ein Relevanz-Filter für Marktplatz-Inserate.

Suchkriterien: ${criteriaStr}

Inserat: "${result.title}" — ${priceStr} — Plattform: ${result.platform}

Ist dieses Inserat relevant für die Suchkriterien? Beachte:
- Titel muss zur gesuchten Marke/Modell/Kategorie passen
- Zubehör, Ersatzteile oder Werbung sind IRRELEVANT (es sei denn explizit gesucht)
- Modellautos, Spielzeug etc. sind IRRELEVANT wenn echte Fahrzeuge gesucht werden

Antworte NUR mit JA oder NEIN.`;
}

/**
 * Einzelnen API-Call an Claude Haiku machen
 */
async function callAIFilter(prompt: string): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn("[KI-Filter] Kein ANTHROPIC_API_KEY gesetzt — Ergebnis wird durchgelassen");
    return true; // Fallback: durchlassen
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_FILTER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 10,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      console.warn(`[KI-Filter] API Fehler ${response.status}: ${errText.substring(0, 200)}`);
      return true; // Fallback: durchlassen
    }

    const data = await response.json();
    const text = data?.content?.[0]?.text?.trim()?.toUpperCase() || "";

    return text.startsWith("JA");
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[KI-Filter] Timeout nach 5s — Ergebnis wird durchgelassen");
    } else {
      console.warn("[KI-Filter] API-Fehler:", error instanceof Error ? error.message : String(error));
    }
    return true; // Fallback: durchlassen
  }
}

/**
 * Batch-Filter: Verarbeitet Ergebnisse in Batches von max 5 gleichzeitig
 */
async function processBatch(
  batch: ScraperResult[],
  options: ScraperOptions,
  query: string
): Promise<AIFilterResult[]> {
  const promises = batch.map(async (result): Promise<AIFilterResult> => {
    const prompt = buildFilterPrompt(result, options, query);
    const relevant = await callAIFilter(prompt);
    return { result, relevant };
  });

  return Promise.all(promises);
}

/**
 * Hauptfunktion: Filtert Scraper-Ergebnisse mit KI
 *
 * @param results - Alle Scraper-Ergebnisse
 * @param options - Suchoptionen (Kategorie, Marke, Modell, etc.)
 * @param query - Der Suchbegriff
 * @returns Gefilterte Ergebnisse (nur relevante)
 */
export async function filterWithAI(
  results: ScraperResult[],
  options: ScraperOptions,
  query: string
): Promise<ScraperResult[]> {
  // Wenn keine Kategorie-spezifischen Filter gesetzt sind, alle durchlassen
  // (KI-Filter macht nur bei strukturierten Suchen Sinn)
  const hasStructuredCriteria = !!(
    options.vehicleMake ||
    options.vehicleModel ||
    options.propertyType ||
    options.furnitureType ||
    options.category
  );

  if (!hasStructuredCriteria) {
    console.log(`[KI-Filter] Keine strukturierten Kriterien — ${results.length} Ergebnisse alle durchgelassen`);
    return results;
  }

  if (results.length === 0) return results;

  console.log(`[KI-Filter] Prüfe ${results.length} Ergebnisse mit Claude Haiku...`);

  const filtered: ScraperResult[] = [];
  let removedCount = 0;

  // In Batches von max AI_FILTER_CONCURRENCY verarbeiten
  for (let i = 0; i < results.length; i += AI_FILTER_CONCURRENCY) {
    const batch = results.slice(i, i + AI_FILTER_CONCURRENCY);
    const batchResults = await processBatch(batch, options, query);

    for (const { result, relevant } of batchResults) {
      if (relevant) {
        filtered.push(result);
      } else {
        removedCount++;
        console.log(`[KI-Filter] "${result.title.substring(0, 60)}" — IRRELEVANT (entfernt)`);
      }
    }
  }

  console.log(`[KI-Filter] Ergebnis: ${filtered.length} relevant, ${removedCount} entfernt (von ${results.length} total)`);

  return filtered;
}
