// KI-Nachfilterung für Scraper-Ergebnisse
// Nutzt Claude Haiku 4.5 via Anthropic API um irrelevante Inserate rauszufiltern
// BEVOR sie als Alerts gespeichert werden
// 
// DREISTUFIGER FILTER:
// 1. Hard-Filter: Prospekte, Werbung, offensichtlich falsche Kategorie → sofort raus
// 2. Baujahr-Filter: Wenn yearTo gesetzt und Inserat neueres Baujahr hat → sofort raus
// 3. KI-Filter: Claude prüft Relevanz (Marke, Modell, Beschreibung, Kategorie)

import type { ScraperResult, ScraperOptions } from "./base";

const AI_FILTER_TIMEOUT_MS = 15000;
const AI_FILTER_CONCURRENCY = 3; // Max 3 parallele API-Calls (stärkeres Modell = langsamer)

// Stärkeres Modell für präzisere Filterung
const AI_FILTER_MODEL = "claude-haiku-4-5-20251001";

interface AIFilterResult {
  result: ScraperResult;
  relevant: boolean;
  reason?: string;
}

// ==================== STUFE 1: HARD-FILTER (regex-basiert, kein API-Call) ====================

/**
 * Erkennt Prospekte, Werbung, Kataloge und andere Nicht-Inserate
 */
const PROSPEKT_PATTERNS = [
  /prospekt/i,
  /katalog/i,
  /brosch[uü]re/i,
  /flyer/i,
  /werbung/i,
  /werbeprospekt/i,
  /preisliste/i,
  /modell\s*auto/i,
  /modellauto/i,
  /spielzeug/i,
  /miniatur/i,
  /diecast/i,
  /1[:/]\s*\d{2}\b/i, // Massstab wie 1:43, 1:18 etc.
  /ma[sß]stab/i,
  /sammler/i,
  /vitrine/i,
  /poster/i,
  /schlüsselanhänger/i,
  /aufkleber/i,
  /sticker/i,
  /t-shirt/i,
  /tasse\b/i,
  /mug\b/i,
  /bettwäsche/i,
  // "Handbuch"/"Reparaturanleitung" nur als Verkaufsgegenstand matchen,
  // nicht wenn im Inserat erwähnt wird dass eines beiliegt.
  // → Kontextbasierte Patterns: nur wenn es der Hauptgegenstand ist
  /\b(?:verkaufe|biete|zu\s+verkaufen)\b.*\b(?:handbuch|reparaturanleitung|werkstatthandbuch)\b/i,
  /\b(?:handbuch|reparaturanleitung|werkstatthandbuch)\b.*\b(?:zu\s+verkaufen|abzugeben)\b/i,
  // "Bild"/"Foto" nur wenn es um Bildverkauf geht (Poster, Druck, Kunstdruck etc.)
  /\b(?:verkaufe|biete)\b.*\b(?:bild|foto|kunstdruck|leinwand)\b/i,
  /\b(?:original\s*bild|gerahmtes?\s*(?:bild|foto)|fotodruck|bildband)\b/i,
];

/**
 * Wörter die STARK darauf hinweisen, dass es KEIN echtes Fahrzeug-Inserat ist
 * (nur relevant wenn Kategorie = Fahrzeuge)
 */
const NOT_REAL_VEHICLE_PATTERNS = [
  /\b(?:hot\s*wheels|matchbox|siku|wiking|herpa|norev|minichamps|autoart|bburago|maisto|welly|solido)\b/i,
];

function isProspektOrNonListing(title: string, description?: string): boolean {
  const text = `${title} ${description || ""}`.toLowerCase();
  
  for (const pattern of PROSPEKT_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  return false;
}

function isNotRealVehicle(title: string, description?: string): boolean {
  const text = `${title} ${description || ""}`;
  
  for (const pattern of NOT_REAL_VEHICLE_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  
  return false;
}

// ==================== STUFE 2: BAUJAHR-FILTER (regex-basiert) ====================

/**
 * Versucht das Baujahr aus dem Titel zu extrahieren.
 * Sucht nach 4-stelligen Jahreszahlen zwischen 1950 und 2030.
 * Ignoriert Jahreszahlen die Teil eines Datums sind (z.B. "17.03.2026", "2026-03-17").
 * Gibt ALLE gefundenen Baujahre zurück.
 */
function extractYearsFromText(text: string): number[] {
  // First, remove date-like patterns so they don't get picked up as build years
  // Patterns: DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
  const textWithoutDates = text
    .replace(/\d{1,2}[./-]\d{1,2}[./-](19[5-9]\d|20[0-3]\d)/g, "")
    .replace(/(19[5-9]\d|20[0-3]\d)[./-]\d{1,2}[./-]\d{1,2}/g, "")
    // Also remove "Endet: <date>" patterns that Ricardo adds
    .replace(/Endet:\s*[^\|]*/gi, "");

  const yearPattern = /\b(19[5-9]\d|20[0-3]\d)\b/g;
  const years: number[] = [];
  let match;
  while ((match = yearPattern.exec(textWithoutDates)) !== null) {
    years.push(parseInt(match[1], 10));
  }
  return years;
}

/**
 * Prüft ob das Inserat anhand des Titels/Beschreibung eindeutig ZU NEU ist
 * Gibt true zurück wenn das Inserat rausgefiltert werden soll
 */
function isYearOutOfRange(title: string, description: string | undefined, yearTo?: number): boolean {
  if (!yearTo) return false;
  
  const text = `${title} ${description || ""}`;
  const years = extractYearsFromText(text);
  
  if (years.length === 0) return false;
  
  // Wenn ALLE gefundenen Jahre über yearTo liegen → rausfiltern
  // (z.B. Suche max 2004, Inserat hat "2026" im Titel)
  const allTooNew = years.every(y => y > yearTo);
  
  // Mindestens eine Jahreszahl muss im Bereich sein
  if (allTooNew) {
    console.log(`[KI-Filter] Baujahr-Filter: "${title.substring(0, 60)}" — Jahre [${years.join(", ")}] > max ${yearTo} → RAUS`);
    return true;
  }
  
  return false;
}

// ==================== STUFE 3: KI-FILTER (API-Call) ====================

/**
 * Baut einen strengen Prompt basierend auf den Suchkriterien
 */
function buildFilterPrompt(result: ScraperResult, options: ScraperOptions, query: string): string {
  const criteria: string[] = [];

  // Fahrzeug-Kriterien
  if (options.vehicleMake) criteria.push(`Marke: ${options.vehicleMake}`);
  if (options.vehicleModel) criteria.push(`Modell: ${options.vehicleModel}`);
  if (options.yearFrom || options.yearTo) {
    criteria.push(`Baujahr: ${options.yearFrom || "beliebig"} bis ${options.yearTo || "beliebig"}`);
  }
  if (options.kmFrom || options.kmTo) {
    criteria.push(`KM: ${options.kmFrom || 0} bis ${options.kmTo || "∞"}`);
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

  // Kategorie
  if (options.category) criteria.push(`Kategorie: ${options.category}`);
  if (options.subcategory) criteria.push(`Unterkategorie: ${options.subcategory}`);

  // Allgemeine Suche
  if (query) criteria.push(`Suchbegriff: "${query}"`);

  const criteriaStr = criteria.join("\n- ");
  const priceStr = result.price > 0 ? `${(result.price / 100).toFixed(0)} CHF` : "kein Preis angegeben";
  const descriptionStr = result.description
    ? `Beschreibung: "${result.description.substring(0, 800)}"`
    : "Keine Beschreibung vorhanden.";

  return `Du bist ein STRENGER Relevanz-Filter für Marktplatz-Inserate. Deine Aufgabe: Nur ECHTE, RELEVANTE Inserate durchlassen. Im Zweifelsfall → NEIN.

SUCHKRITERIEN des Nutzers:
- ${criteriaStr}

INSERAT zur Prüfung:
Titel: "${result.title}"
Preis: ${priceStr}
Plattform: ${result.platform}
${descriptionStr}

STRENGE FILTER-REGELN (ALLE müssen erfüllt sein):

1. ECHTES INSERAT: Ist das ein ECHTES Verkaufsinserat für das gesuchte Produkt?
   → Prospekte, Kataloge, Werbung, Zubehör, Ersatzteile = NEIN
   → Modellautos, Spielzeug, Poster, Bücher über das Produkt = NEIN

2. RICHTIGE MARKE/MODELL: Stimmt die Marke und das Modell EXAKT überein?
   → Suche "Seat Toledo" aber Inserat ist "Seat Ibiza" = NEIN
   → Suche "BMW M3" aber Inserat ist "BMW 320i" = NEIN
   → Der Titel/Beschreibung muss die gesuchte Marke UND das gesuchte Modell enthalten

3. BAUJAHR IM BEREICH: Falls ein Baujahr-Bereich angegeben ist, muss das Inserat dazu passen.
   → Suche max 2004 aber Inserat zeigt 2026 = NEIN
   → Wenn Baujahr nicht erkennbar: kann JA sein (Unsicherheit tolerieren)

4. PREIS IM BEREICH: Falls Preislimits gesetzt sind, darf der Preis nicht stark abweichen.
   → Kein Preis angegeben: kann trotzdem JA sein

5. KATEGORIE: Stimmt die Produktkategorie?
   → Suche Fahrzeuge aber Inserat ist Möbelstück = NEIN

Antworte NUR mit JA oder NEIN. Kein Kommentar, keine Erklärung.`;
}

/**
 * Einzelnen API-Call an Claude machen
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
        model: AI_FILTER_MODEL,
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

    // STRENG: Nur wenn die Antwort klar mit JA beginnt, ist es relevant
    // Alles andere (NEIN, unklar, leer) wird als NICHT relevant behandelt
    return text.startsWith("JA");
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      console.warn("[KI-Filter] Timeout nach 15s — Ergebnis wird durchgelassen");
    } else {
      console.warn("[KI-Filter] API-Fehler:", error instanceof Error ? error.message : String(error));
    }
    return true; // Fallback: durchlassen
  }
}

/**
 * Batch-Filter: Verarbeitet Ergebnisse in Batches
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
 * Hauptfunktion: Filtert Scraper-Ergebnisse mit dreistufigem Filter
 *
 * Stufe 1: Hard-Filter (Prospekte, Werbung, Spielzeug) — kein API-Call
 * Stufe 2: Baujahr-Filter (wenn yearTo gesetzt) — kein API-Call
 * Stufe 3: KI-Filter (Claude prüft Relevanz) — API-Call
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
  if (results.length === 0) return results;

  console.log(`[KI-Filter] Starte dreistufigen Filter für ${results.length} Ergebnisse...`);

  let remaining = [...results];
  let removedHard = 0;
  let removedYear = 0;
  let removedAI = 0;

  // ==================== STUFE 1: Hard-Filter ====================
  const isVehicleSearch = !!(options.vehicleMake || options.vehicleModel || options.category === "Fahrzeuge");
  
  remaining = remaining.filter((r) => {
    // Prospekte/Werbung rausfiltern
    if (isProspektOrNonListing(r.title, r.description)) {
      removedHard++;
      console.log(`[KI-Filter] Hard-Filter: "${r.title.substring(0, 60)}" — Prospekt/Werbung → RAUS`);
      return false;
    }
    
    // Nicht-echte Fahrzeuge (Modellautos etc.) nur bei Fahrzeug-Suche
    if (isVehicleSearch && isNotRealVehicle(r.title, r.description)) {
      removedHard++;
      console.log(`[KI-Filter] Hard-Filter: "${r.title.substring(0, 60)}" — Modellauto/Spielzeug → RAUS`);
      return false;
    }
    
    return true;
  });

  if (removedHard > 0) {
    console.log(`[KI-Filter] Stufe 1 (Hard-Filter): ${removedHard} Prospekte/Werbung entfernt`);
  }

  // ==================== STUFE 2: Baujahr-Filter ====================
  if (options.yearTo) {
    remaining = remaining.filter((r) => {
      if (isYearOutOfRange(r.title, r.description, options.yearTo)) {
        removedYear++;
        return false;
      }
      return true;
    });

    if (removedYear > 0) {
      console.log(`[KI-Filter] Stufe 2 (Baujahr-Filter): ${removedYear} Inserate mit falschem Baujahr entfernt`);
    }
  }

  // ==================== STUFE 3: KI-Filter ====================
  // KI-Filter nur ausführen wenn strukturierte Kriterien vorhanden sind
  const hasStructuredCriteria = !!(
    options.vehicleMake ||
    options.vehicleModel ||
    options.propertyType ||
    options.furnitureType ||
    options.category
  );

  if (hasStructuredCriteria && remaining.length > 0) {
    console.log(`[KI-Filter] Stufe 3: Prüfe ${remaining.length} Ergebnisse mit ${AI_FILTER_MODEL}...`);
    
    const filtered: ScraperResult[] = [];

    for (let i = 0; i < remaining.length; i += AI_FILTER_CONCURRENCY) {
      const batch = remaining.slice(i, i + AI_FILTER_CONCURRENCY);
      const batchResults = await processBatch(batch, options, query);

      for (const { result, relevant } of batchResults) {
        if (relevant) {
          filtered.push(result);
        } else {
          removedAI++;
          console.log(`[KI-Filter] KI: "${result.title.substring(0, 60)}" — IRRELEVANT (entfernt)`);
        }
      }
    }

    remaining = filtered;
  }

  const totalRemoved = removedHard + removedYear + removedAI;
  console.log(`[KI-Filter] Ergebnis: ${remaining.length} relevant, ${totalRemoved} entfernt (Hard: ${removedHard}, Baujahr: ${removedYear}, KI: ${removedAI}) von ${results.length} total`);

  return remaining;
}
